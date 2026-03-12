"""
Freepik Pikaso Image Generator Server

Automates Freepik's Pikaso web UI via Playwright for image generation.
Pulls cookies from your Chrome browser so no separate login needed.
Uses stealth mode to bypass Akamai bot detection.
Streams NDJSON progress events for real-time UI feedback.

Start:
    pip install fastapi uvicorn playwright pycookiecheat playwright-stealth
    playwright install chromium
    python3.11 -m uvicorn freepik_server:app --host 0.0.0.0 --port 8890
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import asyncio
import base64
import json
import os
import random
import re
import time

app = FastAPI(title="Freepik Pikaso Image Generator")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Config ──
PIKASO_URL = 'https://www.freepik.com/pikaso/ai-image-generator#from_element=mainmenu&from_view=pinned_tool'
MIN_INTERVAL = 5  # seconds between generations

# Exact button text in Freepik's model dropdown
MODEL_BUTTON_TEXT = {
    'nano-banana-2': 'Google Nano Banana 2',
    'seedream-5-lite': 'Seedream 5 Lite',
    'flux-2-pro': 'Flux.2 Pro',
    'cinematic': 'Cinematic',
    'auto': 'Auto',
}

# Browser display setting — browser is always non-headless (required for Freepik),
# but auto_minimize controls whether the window is minimized after launch.
# When False, browser stays visible (useful for debugging).
_auto_minimize = True  # Default: minimize on launch

# ── Global state ──
_playwright = None
_browser = None
_lock = asyncio.Lock()
_last_gen_time = 0
_consecutive_failures = 0
MAX_FAILURES_BEFORE_RESTART = 2

# Preloaded page state — refs uploaded + settings applied, waiting for prompt
_preloaded_page = None       # Playwright Page with refs already uploaded
_preloaded_context = None    # Playwright BrowserContext for the preloaded page
_preloaded_prompt_el = None  # The prompt contenteditable element
_preloaded_config = None     # Dict of {model, aspect_ratio, style, ref_count} that was preloaded


async def _human_type(page, text: str):
    """Type text with variable speed to look more human.
    Faster than before — base delay 5-18ms per char."""
    for i, ch in enumerate(text):
        delay = random.uniform(5, 18)
        if ch in '.,!?;:':
            delay = random.uniform(20, 45)
        elif ch == ' ':
            delay = random.uniform(10, 30)
        elif random.random() < 0.03:
            delay = random.uniform(35, 80)
        elif i > 0 and text[i-1:i+1].lower() in ('th', 'he', 'in', 'er', 'an', 'on', 'at', 'en', 'nd', 'ti'):
            delay = random.uniform(3, 10)
        await page.keyboard.type(ch, delay=0)
        await asyncio.sleep(delay / 1000)


class PreloadRequest(BaseModel):
    model: str = 'nano-banana-2'
    aspect_ratio: str = '1:1'
    count: int = 1
    style: str = ''
    style_reference: str = ''
    reference_images: list[str] = []


class GenerateRequest(BaseModel):
    prompt: str
    model: str = 'nano-banana-2'
    aspect_ratio: str = '1:1'
    count: int = 1  # number of images per generation (Freepik default is often 2)
    style: str = ''  # style tag: 'photo', 'illustration', '3d', etc. → prepended as #style
    style_reference: str = ''  # base64-encoded image for the Style reference slot
    reference_images: list[str] = []  # base64-encoded images (Character slot + additional)
    skip_preloaded: bool = False  # if True, ignore preloaded page and do full flow


# ── Helpers ──

def _get_chrome_cookies() -> list[dict]:
    """Extract Freepik cookies from the user's Chrome browser."""
    try:
        from pycookiecheat import chrome_cookies
        cookie_dict = chrome_cookies('https://www.freepik.com')
        if not cookie_dict:
            return []
        pw_cookies = []
        for name, value in cookie_dict.items():
            pw_cookies.append({
                'name': name,
                'value': value,
                'domain': '.freepik.com',
                'path': '/',
                'secure': True,
                'sameSite': 'Lax',
            })
        print(f'[freepik] Imported {len(pw_cookies)} cookies from Chrome')
        return pw_cookies
    except Exception as e:
        print(f'[freepik] Cookie extraction failed: {e}')
        return []


async def _kill_browser():
    """Force-kill the browser and playwright, resetting global state."""
    global _playwright, _browser
    print('[freepik] Killing browser...')
    if _browser:
        try:
            await _browser.close()
        except Exception:
            pass
        _browser = None
    if _playwright:
        try:
            await _playwright.stop()
        except Exception:
            pass
        _playwright = None
    print('[freepik] Browser killed')


async def _minimize_browser():
    """Minimize all browser windows via CDP."""
    if not _browser:
        return
    try:
        cdp = await _browser.new_browser_cdp_session()
        targets = await cdp.send('Target.getTargets')
        for t in targets.get('targetInfos', []):
            if t.get('type') == 'page':
                try:
                    window = await cdp.send('Browser.getWindowForTarget', {'targetId': t['targetId']})
                    await cdp.send('Browser.setWindowBounds', {
                        'windowId': window['windowId'],
                        'bounds': {'windowState': 'minimized'},
                    })
                    print('[freepik] Browser window minimized')
                except Exception:
                    pass
                break
    except Exception as e:
        print(f'[freepik] Could not minimize window: {e}')


async def _ensure_browser():
    """Launch browser with stealth patches. Auto-recovers if browser is dead."""
    global _playwright, _browser
    if _browser is not None:
        # Health check — try to talk to the browser
        try:
            contexts = _browser.contexts
            _ = len(contexts)  # Will throw if browser process is dead
            return _browser
        except Exception:
            print('[freepik] Browser is dead — restarting...')
            await _kill_browser()

    from playwright.async_api import async_playwright
    _playwright = await async_playwright().start()

    # Always non-headless (Freepik blocks headless browsers).
    # If auto_minimize is ON, start off-screen then minimize.
    # If auto_minimize is OFF, start at normal position for debugging.
    launch_args = [
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
    ]
    if _auto_minimize:
        launch_args.extend(['--window-position=-2000,-2000', '--window-size=800,600'])
        print('[freepik] Launching browser (will auto-minimize)...')
    else:
        launch_args.append('--window-size=1280,900')
        print('[freepik] Launching browser (visible for debugging)...')

    _browser = await _playwright.chromium.launch(
        headless=False,
        args=launch_args,
    )

    # Auto-minimize via CDP if setting is on
    if _auto_minimize:
        await _minimize_browser()

    return _browser


async def _new_page_with_cookies():
    """Create a new page with Chrome cookies and stealth patches."""
    browser = await _ensure_browser()
    context = await browser.new_context(
        viewport={'width': 1920, 'height': 1080},
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        accept_downloads=True,
    )

    page = await context.new_page()
    try:
        from playwright_stealth import Stealth
        stealth = Stealth()
        await stealth.apply_stealth_async(page)
        print('[freepik] Stealth patches applied')
    except Exception as e:
        print(f'[freepik] Stealth patches failed (continuing without): {e}')

    cookies = _get_chrome_cookies()
    if cookies:
        await context.add_cookies(cookies)

    return page, context


def _ndjson(event_type: str, **kwargs) -> str:
    return json.dumps({'type': event_type, **kwargs}) + '\n'


def _filter_reference_images(images: list[str]) -> list[str]:
    """Filter out empty/corrupt base64 images before uploading."""
    valid = []
    for img in images:
        raw = img.split(',')[1] if ',' in img else img
        if raw and len(raw) > 100:  # <100 chars = corrupt/empty
            valid.append(img)
        else:
            print(f'[freepik] Skipping invalid reference image ({len(raw)} chars)')
    return valid


# ── Endpoints ──

@app.get('/api/status')
async def status():
    has_cookies = len(_get_chrome_cookies()) > 0
    return {
        'ok': True,
        'browser_ready': _browser is not None,
        'has_cookies': has_cookies,
        'consecutive_failures': _consecutive_failures,
        'auto_minimize': _auto_minimize,
    }


@app.post('/api/settings')
async def update_settings(body: dict):
    """Update server settings. Currently supports: auto_minimize (bool)."""
    global _auto_minimize
    if 'auto_minimize' in body:
        _auto_minimize = bool(body['auto_minimize'])
        # If browser is running, apply/unapply minimize immediately
        if _browser:
            if _auto_minimize:
                await _minimize_browser()
                return {'ok': True, 'auto_minimize': _auto_minimize, 'message': 'Browser minimized'}
            else:
                # Un-minimize: restore to normal window
                try:
                    cdp = await _browser.new_browser_cdp_session()
                    targets = await cdp.send('Target.getTargets')
                    for t in targets.get('targetInfos', []):
                        if t.get('type') == 'page':
                            try:
                                window = await cdp.send('Browser.getWindowForTarget', {'targetId': t['targetId']})
                                await cdp.send('Browser.setWindowBounds', {
                                    'windowId': window['windowId'],
                                    'bounds': {'windowState': 'normal', 'width': 1280, 'height': 900},
                                })
                                print('[freepik] Browser window restored')
                            except Exception:
                                pass
                            break
                except Exception as e:
                    print(f'[freepik] Could not restore window: {e}')
                return {'ok': True, 'auto_minimize': _auto_minimize, 'message': 'Browser visible'}
    return {'ok': True, 'auto_minimize': _auto_minimize}


@app.post('/api/restart')
async def restart():
    """Force-kill browser and reset state. Call when things are stuck."""
    global _consecutive_failures
    await _kill_browser()
    _consecutive_failures = 0
    return {'ok': True, 'message': 'Browser killed. Next generation will launch a fresh one.'}


@app.post('/api/force-kill')
async def force_kill():
    """Nuclear option — kill browser, playwright, AND orphaned Chrome processes."""
    global _consecutive_failures
    await _kill_browser()
    _consecutive_failures = 0
    # Kill any orphaned "Google Chrome for Testing" processes
    import subprocess
    try:
        result = subprocess.run(
            ['pkill', '-f', 'Google Chrome for Testing'],
            capture_output=True, timeout=5
        )
        killed = result.returncode == 0
    except Exception:
        killed = False
    return {'ok': True, 'killed_orphans': killed, 'message': 'Browser + orphaned Chrome processes killed.'}


@app.post('/api/preload')
async def preload(req: PreloadRequest):
    """Pre-open browser, navigate, upload refs, set model/aspect/style.
    Called while LLM is still thinking so generate() can skip setup."""
    global _preloaded_page, _preloaded_context, _preloaded_prompt_el, _preloaded_config

    # Filter reference images
    style_ref_list = _filter_reference_images([req.style_reference]) if req.style_reference else []
    other_refs = _filter_reference_images(req.reference_images)
    clean_refs = style_ref_list + other_refs
    ref_count = len(clean_refs)

    async def stream():
        global _preloaded_page, _preloaded_context, _preloaded_prompt_el, _preloaded_config
        async with _lock:
            # Close any existing preloaded page
            if _preloaded_page:
                try:
                    ctx = _preloaded_context
                    _preloaded_page = None
                    _preloaded_context = None
                    _preloaded_prompt_el = None
                    _preloaded_config = None
                    await ctx.close()
                except Exception:
                    pass

            try:
                yield _ndjson('progress', message='Preloading: launching browser...')
                page, context = await _new_page_with_cookies()

                # ── Navigate ──
                yield _ndjson('progress', message='Preloading: opening Pikaso...')
                await page.goto(PIKASO_URL, wait_until='domcontentloaded', timeout=30000)

                try:
                    await page.wait_for_selector('[data-cy="image-generator-form"]', timeout=15000)
                except Exception:
                    await page.wait_for_timeout(4000)

                # Access check
                title = await page.title()
                if '403' in title or 'denied' in title.lower():
                    yield _ndjson('error', message=f'Freepik blocked: {title}')
                    await context.close()
                    return
                if '/log-in' in page.url or '/login' in page.url:
                    yield _ndjson('error', message='Not logged in')
                    await context.close()
                    return

                # ── History dropdown ──
                try:
                    dropdown_trigger = page.locator('[data-cy="selector-folder-popover"]')
                    if await dropdown_trigger.count() > 0:
                        current_text = (await dropdown_trigger.text_content() or '').strip()
                        if 'History' not in current_text:
                            await dropdown_trigger.click()
                            await page.wait_for_timeout(600)
                            history_item = page.locator('[data-cy="history"]')
                            if await history_item.count() > 0:
                                await history_item.click()
                                await page.wait_for_timeout(600)
                            else:
                                await page.keyboard.press('Escape')
                except Exception:
                    try:
                        await page.keyboard.press('Escape')
                    except Exception:
                        pass

                # ── Find prompt input ──
                prompt_el = None
                for sel in [
                    '[data-cy="image-prompt-input"] [contenteditable="true"]',
                    '[data-cy="image-generator-form"] [contenteditable="true"]',
                    '[contenteditable="true"]',
                ]:
                    try:
                        await page.wait_for_selector(sel, timeout=5000)
                        el = page.locator(sel).first
                        if await el.count() > 0:
                            prompt_el = el
                            break
                    except Exception:
                        continue
                if not prompt_el:
                    yield _ndjson('error', message='Prompt input not found during preload')
                    await context.close()
                    return

                # ── Set model ──
                model_text = MODEL_BUTTON_TEXT.get(req.model, req.model)
                try:
                    model_btn = page.locator('[data-cy="tti-mode-selector-v3-trigger"]').first
                    if await model_btn.count() > 0:
                        current_model = (await model_btn.text_content() or '').strip().split('\n')[0]
                        if current_model.lower() != model_text.lower():
                            await model_btn.click()
                            await page.wait_for_timeout(800)
                            popover = page.locator('[data-state="open"][role="dialog"]').last
                            if await popover.count() > 0:
                                option = popover.locator('button').filter(
                                    has_text=re.compile(re.escape(model_text), re.IGNORECASE)
                                ).first
                                if await option.count() > 0:
                                    await option.click()
                                    await page.wait_for_timeout(600)
                                else:
                                    await page.keyboard.press('Escape')
                except Exception:
                    try:
                        await page.keyboard.press('Escape')
                    except Exception:
                        pass

                # ── Dismiss style panel if it appeared after model change ──
                try:
                    await page.wait_for_timeout(500)
                    style_panel = page.locator('[data-cy="style-selector"], [data-cy="style-panel"], [data-cy="tti-style-selector"]').first
                    if await style_panel.count() > 0:
                        if req.style:
                            style_option = style_panel.locator(f'button:has-text("{req.style}")').first
                            if await style_option.count() > 0:
                                await style_option.click()
                                await page.wait_for_timeout(600)
                            else:
                                await page.keyboard.press('Escape')
                                await page.wait_for_timeout(300)
                        else:
                            for skip_sel in ['button:has-text("None")', 'button:has-text("No style")', 'button:has-text("Skip")', 'button:has-text("Close")', '[data-cy="style-none"]', '[data-cy="no-style"]']:
                                btn = page.locator(skip_sel).first
                                if await btn.count() > 0:
                                    await btn.click()
                                    await page.wait_for_timeout(500)
                                    break
                            else:
                                await page.keyboard.press('Escape')
                                await page.wait_for_timeout(300)
                    open_dialog = page.locator('[data-state="open"][role="dialog"]').first
                    if await open_dialog.count() > 0:
                        await page.keyboard.press('Escape')
                        await page.wait_for_timeout(400)
                except Exception:
                    try:
                        await page.keyboard.press('Escape')
                        await page.wait_for_timeout(200)
                    except Exception:
                        pass

                # ── Set aspect ratio ──
                try:
                    ratio_btn = page.locator('[data-cy="image-aspect-ratio-input"]').first
                    if await ratio_btn.count() > 0:
                        current_ratio = (await ratio_btn.text_content() or '').strip()
                        if current_ratio != req.aspect_ratio:
                            await ratio_btn.click()
                            await page.wait_for_timeout(600)
                            option = page.locator(f'button:has-text("{req.aspect_ratio}")').first
                            if await option.count() > 0:
                                await option.click()
                                await page.wait_for_timeout(400)
                            else:
                                await page.keyboard.press('Escape')
                except Exception:
                    try:
                        await page.keyboard.press('Escape')
                    except Exception:
                        pass

                # ── Set count ──
                try:
                    count_el = page.locator('[data-cy="number-images-value"]').first
                    if await count_el.count() > 0:
                        current_count = int((await count_el.text_content() or '1').strip())
                        if current_count != req.count:
                            btn_sel = 'increase-number-images-button' if req.count > current_count else 'decrease-number-images-button'
                            btn = page.locator(f'[data-cy="{btn_sel}"]').first
                            for _ in range(abs(req.count - current_count)):
                                if await btn.count() > 0 and not await btn.is_disabled():
                                    await btn.click()
                                    await page.wait_for_timeout(200)
                except Exception:
                    pass

                # ── Upload reference images ──
                if clean_refs:
                    yield _ndjson('progress', message=f'Preloading: uploading {ref_count} ref(s)...')
                    import tempfile

                    slot_selectors = [
                        '[data-cy="reference-style-placeholder"]',
                        '[data-cy="reference-character-placeholder"]',
                        '[data-cy="reference-upload-box"]',
                    ]

                    for idx, img_b64 in enumerate(clean_refs):
                        try:
                            raw_b64 = img_b64.split(',')[1] if ',' in img_b64 else img_b64
                            img_bytes = base64.b64decode(raw_b64)
                            uploaded = False

                            tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
                            tmp.write(img_bytes)
                            tmp_path = tmp.name
                            tmp.close()

                            target_sel = slot_selectors[idx] if idx < len(slot_selectors) else None

                            if target_sel is None or await page.locator(target_sel).count() == 0:
                                add_btn = page.locator('[data-cy="add-reference-button"]')
                                if await add_btn.count() > 0:
                                    await add_btn.click()
                                    await page.wait_for_timeout(400)
                                    target_sel = '[data-cy="reference-upload-box"]'

                            if target_sel and await page.locator(target_sel).count() > 0:
                                try:
                                    target = page.locator(target_sel).first
                                    await target.click()
                                    await page.wait_for_timeout(400)

                                    modal = page.locator('div.fixed.inset-0').first
                                    if await modal.count() > 0:
                                        for upload_sel in ['input[type="file"]', 'button:has-text("Upload")']:
                                            try:
                                                upload_el = modal.locator(upload_sel).first
                                                if await upload_el.count() > 0:
                                                    if upload_sel == 'input[type="file"]':
                                                        await upload_el.set_input_files(tmp_path)
                                                    else:
                                                        async with page.expect_file_chooser(timeout=5000) as fc_info:
                                                            await upload_el.click()
                                                        fc = await fc_info.value
                                                        await fc.set_files(tmp_path)
                                                    await page.wait_for_timeout(1200)
                                                    uploaded = True
                                                    break
                                            except Exception:
                                                continue
                                except Exception:
                                    pass

                            if not uploaded:
                                try:
                                    await page.keyboard.press('Escape')
                                    await page.wait_for_timeout(250)
                                    file_inputs = page.locator('input[type="file"]')
                                    count = await file_inputs.count()
                                    if count > 0:
                                        fi = file_inputs.nth(count - 1)
                                        await fi.set_input_files(tmp_path)
                                        await page.wait_for_timeout(1200)
                                        uploaded = True
                                except Exception:
                                    pass

                            try:
                                os.unlink(tmp_path)
                            except Exception:
                                pass
                            try:
                                await page.keyboard.press('Escape')
                                await page.wait_for_timeout(250)
                            except Exception:
                                pass

                            yield _ndjson('progress', message=f'Ref {idx+1}/{ref_count} {"uploaded" if uploaded else "failed"}')
                        except Exception as e:
                            yield _ndjson('progress', message=f'Ref {idx+1} error: {e}')
                            try:
                                await page.keyboard.press('Escape')
                                await page.wait_for_timeout(200)
                            except Exception:
                                pass

                    # Final modal cleanup
                    try:
                        modal_overlay = page.locator('div.fixed.inset-0')
                        if await modal_overlay.count() > 0:
                            await page.keyboard.press('Escape')
                            await page.wait_for_timeout(250)
                    except Exception:
                        pass

                # ── Store preloaded state ──
                _preloaded_page = page
                _preloaded_context = context
                _preloaded_prompt_el = prompt_el
                _preloaded_config = {
                    'model': req.model,
                    'aspect_ratio': req.aspect_ratio,
                    'count': req.count,
                    'style': req.style,
                    'ref_count': ref_count,
                }

                yield _ndjson('complete', message=f'Preloaded: {ref_count} refs, model={req.model}, ratio={req.aspect_ratio}')

            except Exception as e:
                yield _ndjson('error', message=f'Preload failed: {e}')
                try:
                    await context.close()
                except Exception:
                    pass

    return StreamingResponse(stream(), media_type='application/x-ndjson')


@app.post('/api/generate')
async def generate(req: GenerateRequest):
    """Generate image via Freepik Pikaso. Streams NDJSON progress events."""

    # Pre-filter reference images — drop empty/corrupt ones
    # Style reference always goes FIRST (into Freepik's Style slot)
    style_ref_list = _filter_reference_images([req.style_reference]) if req.style_reference else []
    other_refs = _filter_reference_images(req.reference_images)
    clean_refs = style_ref_list + other_refs  # Style slot first, then Character/Upload slots
    ref_count = len(clean_refs)
    total_input = (1 if req.style_reference else 0) + len(req.reference_images)
    if ref_count != total_input:
        print(f'[freepik] Filtered {total_input} → {ref_count} valid reference images (style_ref: {len(style_ref_list)})')

    async def stream():
        global _last_gen_time, _consecutive_failures
        global _preloaded_page, _preloaded_context, _preloaded_prompt_el, _preloaded_config
        async with _lock:
            # ── Check for preloaded page ──
            use_preloaded = False
            if _preloaded_page and _preloaded_config and not req.skip_preloaded:
                cfg = _preloaded_config
                if (cfg['model'] == req.model and
                    cfg['aspect_ratio'] == req.aspect_ratio and
                    cfg['ref_count'] == ref_count):
                    use_preloaded = True
                else:
                    yield _ndjson('progress', message='Preloaded config mismatch — full setup')
                    try:
                        await _preloaded_context.close()
                    except Exception:
                        pass
                    _preloaded_page = _preloaded_context = _preloaded_prompt_el = _preloaded_config = None

            # ── Auto-restart after consecutive failures ──
            if _consecutive_failures >= MAX_FAILURES_BEFORE_RESTART:
                yield _ndjson('progress', message=f'{_consecutive_failures} consecutive failures — restarting browser...')
                await _kill_browser()
                _consecutive_failures = 0

            # ── Rate limit ──
            wait = MIN_INTERVAL - (time.time() - _last_gen_time)
            if wait > 0:
                yield _ndjson('progress', message=f'Rate limit — waiting {wait:.0f}s...')
                await asyncio.sleep(wait)

            page = None
            context = None
            prompt_el = None

            if use_preloaded:
                # ── FAST PATH: claim preloaded page (refs already uploaded) ──
                page = _preloaded_page
                context = _preloaded_context
                prompt_el = _preloaded_prompt_el
                _preloaded_page = _preloaded_context = _preloaded_prompt_el = _preloaded_config = None
                yield _ndjson('progress', message='Using preloaded page (refs already uploaded)')

            prompt_selectors = [
                '[data-cy="image-prompt-input"] [contenteditable="true"]',
                '[data-cy="image-prompt-input"] [data-placeholder="Describe your image"]',
                '[data-cy="image-generator-form"] [contenteditable="true"]',
                '[contenteditable="true"][data-placeholder="Describe your image"]',
                '[contenteditable="true"]',
            ]

            try:
                if not use_preloaded:
                    yield _ndjson('progress', message='Launching browser...')
                    page, context = await _new_page_with_cookies()

                    # ── 1. Navigate to Pikaso ──
                    yield _ndjson('progress', message='Opening Freepik Pikaso...')
                    await page.goto(PIKASO_URL, wait_until='domcontentloaded', timeout=30000)

                    # Wait for the generator form to appear (confirms page is fully loaded)
                    try:
                        await page.wait_for_selector('[data-cy="image-generator-form"]', timeout=15000)
                        yield _ndjson('progress', message='Generator form loaded')
                    except Exception:
                        # Fallback: just wait a bit
                        await page.wait_for_timeout(4000)
                        yield _ndjson('progress', message='Waited for page load')

                    # ── 2. Access check ──
                    title = await page.title()
                    if '403' in title or 'denied' in title.lower():
                        yield _ndjson('error', message=f'Freepik blocked access: {title}')
                        return
                    if '/log-in' in page.url or '/login' in page.url:
                        yield _ndjson('error', message='Not logged in. Log in to freepik.com in Chrome first.')
                        return

                    # ── 2b. Open "Personal project" dropdown → click "History" ──
                    # In the top bar: [Personal project ▼] [Community] [Templates] [Tutorials]
                    # The dropdown trigger is [data-cy="selector-folder-popover"].
                    # Inside the dropdown, click [data-cy="history"] to switch feed to History.
                    # This keeps the generator form visible while showing past generations in the feed.
                    try:
                        dropdown_trigger = page.locator('[data-cy="selector-folder-popover"]')
                        if await dropdown_trigger.count() > 0:
                            current_text = (await dropdown_trigger.text_content() or '').strip()
                            if 'History' in current_text:
                                yield _ndjson('progress', message='Already on History view')
                            else:
                                yield _ndjson('progress', message='Opening project dropdown...')
                                await dropdown_trigger.click()
                                await page.wait_for_timeout(800)

                                # Click History in the dropdown
                                history_item = page.locator('[data-cy="history"]')
                                if await history_item.count() > 0:
                                    await history_item.click()
                                    await page.wait_for_timeout(1000)
                                    yield _ndjson('progress', message='History view selected')
                                else:
                                    yield _ndjson('progress', message='History item not in dropdown — closing')
                                    await page.keyboard.press('Escape')
                        else:
                            yield _ndjson('progress', message='Project dropdown not found — continuing')
                    except Exception as e:
                        yield _ndjson('progress', message=f'History switch: {e} — continuing')
                        try:
                            await page.keyboard.press('Escape')
                        except Exception:
                            pass

                    # ── 3. Wait for prompt input ──
                    yield _ndjson('progress', message='Waiting for Pikaso UI...')
                    prompt_el = None
                    # Priority order: exact data-cy, then contenteditable inside form, then generic
                    prompt_selectors = [
                        '[data-cy="image-prompt-input"] [contenteditable="true"]',
                        '[data-cy="image-prompt-input"] [data-placeholder="Describe your image"]',
                        '[data-cy="image-generator-form"] [contenteditable="true"]',
                        '[contenteditable="true"][data-placeholder="Describe your image"]',
                        '[contenteditable="true"]',
                    ]
                    for sel in prompt_selectors:
                        try:
                            await page.wait_for_selector(sel, timeout=6000)
                            el = page.locator(sel).first
                            if await el.count() > 0:
                                prompt_el = el
                                yield _ndjson('progress', message=f'Prompt input found via: {sel}')
                                break
                        except Exception:
                            continue
                    if not prompt_el:
                        yield _ndjson('error', message=f'Could not find prompt input. Page: "{title}"')
                        return

                    # ── 4. Select model ──
                    model_text = MODEL_BUTTON_TEXT.get(req.model, req.model)
                    yield _ndjson('progress', message=f'Selecting model: {model_text}...')
                    try:
                        # Primary: use data-cy selector (verified against live UI)
                        model_btn = page.locator('[data-cy="tti-mode-selector-v3-trigger"]').first
                        found = None
                        if await model_btn.count() > 0:
                            found = (await model_btn.text_content() or '').strip().split('\n')[0]
                        else:
                            # Fallback: walk from "Model" label
                            found = await page.evaluate('''() => {
                                const labels = document.querySelectorAll('label');
                                for (const label of labels) {
                                    if (label.textContent.trim().toLowerCase() === 'model') {
                                        let parent = label.parentElement;
                                        for (let i = 0; i < 4 && parent; i++) {
                                            const btn = parent.querySelector('button[aria-haspopup]') || parent.querySelector('button');
                                            if (btn && btn !== label) {
                                                btn.setAttribute('data-pikaso-model-btn', '1');
                                                return btn.innerText.trim().split('\\n')[0];
                                            }
                                            parent = parent.parentElement;
                                        }
                                    }
                                }
                                return null;
                            }''')
                            if found:
                                model_btn = page.locator('[data-pikaso-model-btn="1"]').first

                        if found:
                            current_model = found
                            if current_model.lower() == model_text.lower():
                                yield _ndjson('progress', message=f'Model already set to {model_text}')
                            else:
                                await model_btn.click()
                                await page.wait_for_timeout(1000)

                                popover = page.locator('[data-state="open"][role="dialog"]').last
                                if await popover.count() > 0:
                                    option = popover.locator('button').filter(
                                        has_text=re.compile(re.escape(model_text), re.IGNORECASE)
                                    ).first
                                    if await option.count() > 0:
                                        await option.click()
                                        await page.wait_for_timeout(800)
                                        yield _ndjson('progress', message=f'Model set to {model_text}')
                                    else:
                                        yield _ndjson('progress', message=f'"{model_text}" not in dropdown, using {current_model}')
                                        await page.keyboard.press('Escape')
                                else:
                                    yield _ndjson('progress', message='Model dropdown did not open')
                        else:
                            yield _ndjson('progress', message='MODEL label not found on page')
                    except Exception as e:
                        yield _ndjson('progress', message=f'Model selection failed: {e}')
                        try:
                            await page.keyboard.press('Escape')
                        except Exception:
                            pass

                    # ── 4b. Dismiss style selection if it appeared after model change ──
                    # Freepik sometimes shows a mandatory style picker after model selection.
                    # If user has no style selected, we need to skip/dismiss it.
                    try:
                        await page.wait_for_timeout(500)
                        # Check for style panel/modal that may have appeared
                        style_panel = page.locator('[data-cy="style-selector"], [data-cy="style-panel"], [data-cy="tti-style-selector"]').first
                        if await style_panel.count() > 0:
                            if req.style:
                                yield _ndjson('progress', message=f'Style panel detected — looking for: {req.style}')
                                style_option = style_panel.locator(f'button:has-text("{req.style}")').first
                                if await style_option.count() > 0:
                                    await style_option.click()
                                    await page.wait_for_timeout(600)
                                    yield _ndjson('progress', message=f'Style "{req.style}" selected')
                                else:
                                    yield _ndjson('progress', message=f'Style "{req.style}" not found — skipping')
                                    await page.keyboard.press('Escape')
                                    await page.wait_for_timeout(300)
                            else:
                                yield _ndjson('progress', message='Style panel detected — no style needed, dismissing...')
                                # Try clicking "None" / "No style" / skip button first
                                for skip_sel in [
                                    'button:has-text("None")',
                                    'button:has-text("No style")',
                                    'button:has-text("Skip")',
                                    'button:has-text("Close")',
                                    '[data-cy="style-none"]',
                                    '[data-cy="no-style"]',
                                ]:
                                    btn = page.locator(skip_sel).first
                                    if await btn.count() > 0:
                                        await btn.click()
                                        await page.wait_for_timeout(500)
                                        yield _ndjson('progress', message='Style panel dismissed')
                                        break
                                else:
                                    # Fallback: just Escape
                                    await page.keyboard.press('Escape')
                                    await page.wait_for_timeout(300)
                                    yield _ndjson('progress', message='Style panel escaped')

                        # Also check for any open dialog/popover that might be blocking
                        open_dialog = page.locator('[data-state="open"][role="dialog"]').first
                        if await open_dialog.count() > 0:
                            yield _ndjson('progress', message='Open dialog detected after model — dismissing...')
                            await page.keyboard.press('Escape')
                            await page.wait_for_timeout(400)
                    except Exception as e:
                        yield _ndjson('progress', message=f'Style dismiss check: {e} — continuing')
                        try:
                            await page.keyboard.press('Escape')
                            await page.wait_for_timeout(200)
                        except Exception:
                            pass

                    # ── 5. Select aspect ratio ──
                    yield _ndjson('progress', message=f'Setting aspect ratio to {req.aspect_ratio}...')
                    try:
                        # Use data-cy selector for the aspect ratio input
                        ratio_btn = page.locator('[data-cy="image-aspect-ratio-input"]').first
                        if await ratio_btn.count() == 0:
                            # Fallback: find any button with ratio text
                            ratio_btn = page.locator('button').filter(
                                has_text=re.compile(r'^\d+:\d+$')
                            ).first

                        if await ratio_btn.count() > 0:
                            current_ratio = (await ratio_btn.text_content() or '').strip()
                            if req.aspect_ratio in current_ratio:
                                yield _ndjson('progress', message=f'Aspect ratio already {req.aspect_ratio}')
                            else:
                                await ratio_btn.click()
                                await page.wait_for_timeout(800)

                                # Look in dropdown/popover for target ratio
                                target_ratio = page.locator(f'text="{req.aspect_ratio}"').first
                                if await target_ratio.count() > 0:
                                    await target_ratio.click()
                                    await page.wait_for_timeout(500)
                                    yield _ndjson('progress', message=f'Aspect ratio set to {req.aspect_ratio}')
                                else:
                                    yield _ndjson('progress', message=f'Ratio {req.aspect_ratio} not found, using current')
                                    await page.keyboard.press('Escape')
                        else:
                            yield _ndjson('progress', message='Ratio button not found')
                    except Exception as e:
                        yield _ndjson('progress', message=f'Ratio selection failed: {e}')
                        try:
                            await page.keyboard.press('Escape')
                        except Exception:
                            pass

                    # ── 5a½. Set image count ──
                    try:
                        count_el = page.locator('[data-cy="number-images-value"]')
                        if await count_el.count() > 0:
                            current_count = int(await count_el.text_content() or '1')
                            if current_count != req.count:
                                yield _ndjson('progress', message=f'Setting image count from {current_count} to {req.count}...')
                                if req.count < current_count:
                                    minus_btn = page.locator('[data-cy="decrease-number-images-button"]')
                                    for i in range(current_count - req.count):
                                        # Wait for button to be enabled (max 2s per click)
                                        try:
                                            await minus_btn.wait_for(state='visible', timeout=2000)
                                            if await minus_btn.is_disabled():
                                                yield _ndjson('progress', message=f'Decrease button disabled at count {current_count - i}')
                                                break
                                            await minus_btn.click(timeout=3000)
                                            await page.wait_for_timeout(250)
                                        except Exception:
                                            yield _ndjson('progress', message=f'Decrease click failed at step {i+1}')
                                            break
                                else:
                                    plus_btn = page.locator('[data-cy="increase-number-images-button"]')
                                    for i in range(req.count - current_count):
                                        try:
                                            await plus_btn.wait_for(state='visible', timeout=2000)
                                            if await plus_btn.is_disabled():
                                                yield _ndjson('progress', message=f'Increase button disabled at count {current_count + i}')
                                                break
                                            await plus_btn.click(timeout=3000)
                                            await page.wait_for_timeout(250)
                                        except Exception:
                                            yield _ndjson('progress', message=f'Increase click failed at step {i+1}')
                                            break
                                await page.wait_for_timeout(300)
                                final_count = int(await count_el.text_content() or '0')
                                yield _ndjson('progress', message=f'Image count: {final_count}')
                            else:
                                yield _ndjson('progress', message=f'Image count already {req.count}')
                    except Exception as e:
                        yield _ndjson('progress', message=f'Count setting: {e} — continuing')

                    # ── 5b. Upload reference images ──
                    # Freepik reference upload flow:
                    #   Clicking a slot (Style/Character/Upload) opens a MODAL dialog.
                    #   Best approach: use hidden file input directly, then dismiss any modal.
                    #   Slot order: Style → Character → Upload (via + Add)
                    if clean_refs:
                        yield _ndjson('progress', message=f'Uploading {ref_count} reference image(s)...')
                        import tempfile

                        slot_selectors = [
                            '[data-cy="reference-style-placeholder"]',
                            '[data-cy="reference-character-placeholder"]',
                            '[data-cy="reference-upload-box"]',
                        ]

                        for idx, img_b64 in enumerate(clean_refs):
                            try:
                                raw_b64 = img_b64.split(',')[1] if ',' in img_b64 else img_b64
                                img_bytes = base64.b64decode(raw_b64)
                                uploaded = False

                                tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
                                tmp.write(img_bytes)
                                tmp_path = tmp.name
                                tmp.close()
                                yield _ndjson('progress', message=f'Image {idx+1}: {len(img_bytes)} bytes')

                                # Pick the slot to click (to prime the upload context)
                                target_sel = slot_selectors[idx] if idx < len(slot_selectors) else None

                                # For images beyond slots, click "+ Add" first
                                if target_sel is None or await page.locator(target_sel).count() == 0:
                                    add_btn = page.locator('[data-cy="add-reference-button"]')
                                    if await add_btn.count() > 0:
                                        await add_btn.click()
                                        await page.wait_for_timeout(400)
                                        target_sel = '[data-cy="reference-upload-box"]'

                                # Method 1: Click slot → intercept file chooser from the MODAL
                                if target_sel and await page.locator(target_sel).count() > 0:
                                    try:
                                        target = page.locator(target_sel).first
                                        # Click to open the upload modal
                                        await target.click()
                                        await page.wait_for_timeout(400)

                                        # The modal should now be open. Look for upload button/area inside it.
                                        modal = page.locator('div.fixed.inset-0').first
                                        if await modal.count() > 0:
                                            for upload_sel in [
                                                'input[type="file"]',
                                                'button:has-text("Upload")',
                                                'button:has-text("select file")',
                                                '[role="button"]:has-text("upload")',
                                                'div:has-text("Drop or select")',
                                            ]:
                                                try:
                                                    upload_el = modal.locator(upload_sel).first
                                                    if await upload_el.count() > 0:
                                                        if upload_sel == 'input[type="file"]':
                                                            await upload_el.set_input_files(tmp_path)
                                                        else:
                                                            async with page.expect_file_chooser(timeout=5000) as fc_info:
                                                                await upload_el.click()
                                                            fc = await fc_info.value
                                                            await fc.set_files(tmp_path)
                                                        await page.wait_for_timeout(1200)
                                                        uploaded = True
                                                        yield _ndjson('progress', message=f'Reference {idx+1} uploaded via modal')
                                                        break
                                                except Exception:
                                                    continue
                                    except Exception as e1:
                                        yield _ndjson('progress', message=f'Modal upload: {e1}')

                                # Method 2: Direct hidden file input (bypasses modal)
                                if not uploaded:
                                    try:
                                        await page.keyboard.press('Escape')
                                        await page.wait_for_timeout(250)

                                        file_inputs = page.locator('input[type="file"]')
                                        count = await file_inputs.count()
                                        if count > 0:
                                            fi = file_inputs.nth(count - 1)
                                            await fi.set_input_files(tmp_path)
                                            yield _ndjson('progress', message=f'Direct file input for image {idx+1}...')
                                            await page.wait_for_timeout(1200)
                                            uploaded = True
                                            yield _ndjson('progress', message=f'Reference {idx+1} added ✓')
                                    except Exception as e2:
                                        yield _ndjson('progress', message=f'Direct input: {e2}')

                                # Clean up temp file
                                try:
                                    os.unlink(tmp_path)
                                except Exception:
                                    pass

                                # Dismiss any modal/dialog that might be open
                                try:
                                    await page.keyboard.press('Escape')
                                    await page.wait_for_timeout(250)
                                except Exception:
                                    pass

                                if not uploaded:
                                    yield _ndjson('progress', message=f'Could not upload image {idx+1} — continuing')
                            except Exception as e:
                                yield _ndjson('progress', message=f'Image {idx+1} error: {e}')
                                try:
                                    await page.keyboard.press('Escape')
                                    await page.wait_for_timeout(200)
                                except Exception:
                                    pass

                        # Final cleanup: make sure no modal is blocking
                        try:
                            modal_overlay = page.locator('div.fixed.inset-0')
                            if await modal_overlay.count() > 0:
                                await page.keyboard.press('Escape')
                                await page.wait_for_timeout(250)
                        except Exception:
                            pass

                # ── 6. Check server busy warnings ──
                busy_patterns = [
                    r'servers?\s+(?:are\s+)?busy[.\s]*(?:~?\s*(\d+)\s*m\s*(?:(\d+)\s*s)?)?',
                    r'wait\s*(?:time)?[:\s]*~?\s*(\d+)\s*m\s*(?:(\d+)\s*s)?',
                    r'queue.*?(\d+)\s*m',
                ]
                try:
                    page_text = await page.inner_text('body')
                    for pat in busy_patterns:
                        m = re.search(pat, page_text, re.IGNORECASE)
                        if m:
                            s = max(0, m.start() - 20)
                            e = min(len(page_text), m.end() + 30)
                            ctx = page_text[s:e].strip().replace('\n', ' ')
                            yield _ndjson('warning', message=ctx)
                            mins = int(m.group(1)) if m.group(1) else 0
                            secs = int(m.group(2)) if m.lastindex and m.lastindex >= 2 and m.group(2) else 0
                            if mins > 0 or secs > 0:
                                yield _ndjson('eta_update', seconds=mins * 60 + secs)
                            break
                except Exception:
                    pass

                # ── 7. Fill prompt ──
                yield _ndjson('progress', message=f'Filling prompt: "{req.prompt[:60]}..."' if len(req.prompt) > 60 else f'Filling prompt: "{req.prompt}"')

                # Re-find prompt element (may have changed after uploads)
                prompt_el = None
                for sel in prompt_selectors:
                    try:
                        el = page.locator(sel).first
                        if await el.count() > 0:
                            prompt_el = el
                            break
                    except Exception:
                        continue
                if not prompt_el:
                    yield _ndjson('error', message='Could not find prompt input after upload')
                    return

                # Clear existing text via JS — target the prompt container specifically
                await page.evaluate('''() => {
                    const container = document.querySelector('[data-cy="image-prompt-input"]');
                    if (container) {
                        const ce = container.querySelector('[contenteditable="true"]');
                        if (ce) {
                            ce.textContent = '';
                            ce.innerHTML = '';
                            ce.dispatchEvent(new Event('input', {bubbles: true}));
                            return;
                        }
                    }
                    // Fallback: generic contenteditable
                    const ce = document.querySelector('[contenteditable="true"]');
                    if (ce) {
                        ce.textContent = '';
                        ce.innerHTML = '';
                        ce.dispatchEvent(new Event('input', {bubbles: true}));
                    }
                }''')
                await page.wait_for_timeout(200)

                # Click to focus
                await prompt_el.click()
                await page.wait_for_timeout(150)

                # ── Disable AI prompt toggle ("AI prompt" / "Smart prompt") ──
                yield _ndjson('progress', message='Checking AI prompt toggle...')
                try:
                    toggle_btn = page.locator('[data-cy="smart-prompt-toggle"]')
                    if await toggle_btn.count() > 0:
                        # Check state via aria-checked, data-state, or class inspection
                        is_on = await page.evaluate('''() => {
                            const btn = document.querySelector('[data-cy="smart-prompt-toggle"]');
                            if (!btn) return false;
                            // Check aria-checked first
                            if (btn.getAttribute('aria-checked') === 'true') return true;
                            if (btn.getAttribute('data-state') === 'checked') return true;
                            // Fallback: look for active class on any child span
                            const spans = btn.querySelectorAll('span');
                            for (const span of spans) {
                                const cls = span.className || '';
                                if (cls.includes('blue') || cls.includes('active') || cls.includes('checked')) return true;
                            }
                            return false;
                        }''')

                        if is_on:
                            yield _ndjson('progress', message='AI prompt toggle is ON — disabling...')
                            await toggle_btn.click()
                            await page.wait_for_timeout(500)
                            yield _ndjson('progress', message='AI prompt toggle disabled')
                        else:
                            yield _ndjson('progress', message='AI prompt toggle already off')
                    else:
                        yield _ndjson('progress', message='Smart prompt toggle not found — continuing')
                except Exception as e:
                    yield _ndjson('progress', message=f'AI toggle check: {e} — continuing')

                # Re-focus and clear prompt
                await prompt_el.click()
                await page.wait_for_timeout(200)
                await page.keyboard.press('Meta+a')
                await page.wait_for_timeout(80)
                await page.keyboard.press('Backspace')
                await page.wait_for_timeout(80)
                await page.keyboard.press('Meta+a')
                await page.keyboard.press('Backspace')
                await page.wait_for_timeout(150)

                # Build full prompt: style tag + user prompt
                full_prompt = req.prompt
                if req.style:
                    style_tag = req.style if req.style.startswith('#') else f'#{req.style}'
                    full_prompt = f'{style_tag} {req.prompt}'
                    yield _ndjson('progress', message=f'Style: {style_tag}')

                # Type the actual prompt (handle @img1, @img2 mention system)
                import re as _re
                parts = _re.split(r'(@img\d+)', full_prompt)
                for part in parts:
                    if not part:
                        continue
                    img_match = _re.match(r'^@img(\d+)$', part)
                    if img_match:
                        # Type @ to trigger autocomplete, then imgN, then Enter
                        await _human_type(page, '@')
                        await page.wait_for_timeout(400)  # was 500
                        await page.keyboard.type(f'img{img_match.group(1)}', delay=25)
                        await page.wait_for_timeout(200)  # was 300
                        await page.keyboard.press('Enter')
                        await page.wait_for_timeout(200)  # was 300
                    else:
                        await _human_type(page, part)
                await page.wait_for_timeout(200)

                # Verify prompt
                try:
                    actual_text = await page.evaluate('''() => {
                        const container = document.querySelector('[data-cy="image-prompt-input"]');
                        if (container) {
                            const ce = container.querySelector('[contenteditable="true"]');
                            if (ce) return ce.textContent;
                        }
                        const ce = document.querySelector('[contenteditable="true"]');
                        if (ce) return ce.textContent;
                        return null;
                    }''')
                    if actual_text:
                        yield _ndjson('progress', message=f'Prompt set ({len(actual_text)} chars)')
                except Exception:
                    pass

                # ── 8. Snapshot ALL images before Generate ──
                existing_srcs = set(await page.evaluate('''
                    () => Array.from(document.querySelectorAll('img'))
                        .map(i => i.src)
                        .filter(s => s && (s.startsWith('http') || s.startsWith('blob:') || s.startsWith('data:')))
                '''))
                existing_count = len(existing_srcs)
                yield _ndjson('progress', message=f'Snapshot: {existing_count} images on page')

                # ── 9. Click Generate ──
                gen_btn = page.locator('[data-cy="generate-button"]').first
                if await gen_btn.count() == 0:
                    gen_btn = page.locator('button:has-text("Generate")').first
                if await gen_btn.count() == 0:
                    yield _ndjson('error', message='Could not find Generate button')
                    return

                # Wait up to 15 min for button to become enabled (server queue)
                gen_wait_start = time.time()
                gen_wait_timeout = 900
                last_queue_msg = 0
                while await gen_btn.is_disabled():
                    if time.time() - gen_wait_start > gen_wait_timeout:
                        yield _ndjson('error', message='Generate button still disabled after 15 min — giving up')
                        return
                    elapsed = int(time.time() - gen_wait_start)
                    if time.time() - last_queue_msg > 15:
                        yield _ndjson('progress', message=f'Waiting for server queue... ({elapsed}s)')
                        last_queue_msg = time.time()
                        try:
                            body_text = await page.inner_text('body')
                            for pat in busy_patterns:
                                m = re.search(pat, body_text, re.IGNORECASE)
                                if m:
                                    mins = int(m.group(1)) if m.group(1) else 0
                                    secs_val = int(m.group(2)) if m.lastindex and m.lastindex >= 2 and m.group(2) else 0
                                    eta = mins * 60 + secs_val
                                    if eta > 0:
                                        yield _ndjson('eta_update', seconds=eta)
                                    break
                        except Exception:
                            pass
                    await page.wait_for_timeout(2000)

                yield _ndjson('progress', message='Clicking Generate...')
                await gen_btn.click()
                yield _ndjson('progress', message='Generating image...')

                # ── 10. Wait for generation ──
                gen_start = time.time()
                timeout = 900  # 15 min base
                last_progress = gen_start

                # Phase A: Wait for loading indicator
                gen_started = False
                for _ in range(20):
                    body_text = await page.inner_text('body')
                    if any(kw in body_text for kw in ['Generating', 'Final touches', 'Loading']):
                        gen_started = True
                        yield _ndjson('progress', message='Generation in progress...')
                        break
                    await page.wait_for_timeout(500)

                # Phase B: Wait for loading to finish + detect new image
                while time.time() - gen_start < timeout:
                    elapsed = int(time.time() - gen_start)

                    if time.time() - last_progress > 10:
                        yield _ndjson('progress', message=f'Generating... ({elapsed}s)')
                        last_progress = time.time()

                        # Re-check busy warnings
                        try:
                            body_text = await page.inner_text('body')
                            for pat in busy_patterns:
                                m = re.search(pat, body_text, re.IGNORECASE)
                                if m:
                                    s = max(0, m.start() - 20)
                                    e = min(len(body_text), m.end() + 30)
                                    yield _ndjson('warning', message=body_text[s:e].strip().replace('\n', ' '))
                                    mins = int(m.group(1)) if m.group(1) else 0
                                    secs_val = int(m.group(2)) if m.lastindex and m.lastindex >= 2 and m.group(2) else 0
                                    eta_secs = mins * 60 + secs_val
                                    if eta_secs > 0:
                                        yield _ndjson('eta_update', seconds=eta_secs)
                                        needed = (time.time() - gen_start) + eta_secs + 180
                                        if needed > timeout:
                                            timeout = needed
                                            yield _ndjson('progress', message=f'Queue detected — timeout extended to {int(timeout)}s')
                                    break
                        except Exception:
                            pass

                    # Check if still loading
                    if gen_started:
                        still_loading = await page.evaluate('''() => {
                            const body = document.body.innerText;
                            return body.includes('Generating') || body.includes('Final touches') || body.includes('Loading');
                        }''')
                        if still_loading:
                            await page.wait_for_timeout(1500)
                            continue
                        await page.wait_for_timeout(1500)

                    # Scan for new images (feed items = newest first)
                    new_imgs = await page.evaluate('''
                        (existingSet) => {
                            const results = [];
                            const feedImgs = document.querySelectorAll('[data-cy="image-creation-feed-item"] img');
                            for (const img of feedImgs) {
                                const src = img.src;
                                if (!src) continue;
                                if (!(src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:'))) continue;
                                if (existingSet.includes(src)) continue;
                                const w = Math.max(img.naturalWidth || 0, img.width || 0);
                                const h = Math.max(img.naturalHeight || 0, img.height || 0);
                                if (w < 400 && h < 400) continue;
                                const rect = img.getBoundingClientRect();
                                results.push({ src, x: rect.x, y: rect.y, w: rect.width, h: rect.height, nw: img.naturalWidth, nh: img.naturalHeight, feed: true });
                            }
                            if (results.length === 0) {
                                const allImgs = document.querySelectorAll('img');
                                for (const img of allImgs) {
                                    const src = img.src;
                                    if (!src) continue;
                                    if (!(src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:'))) continue;
                                    if (existingSet.includes(src)) continue;
                                    const w = Math.max(img.naturalWidth || 0, img.width || 0);
                                    const h = Math.max(img.naturalHeight || 0, img.height || 0);
                                    if (w < 400 && h < 400) continue;
                                    const rect = img.getBoundingClientRect();
                                    results.push({ src, x: rect.x, y: rect.y, w: rect.width, h: rect.height, nw: img.naturalWidth, nh: img.naturalHeight, feed: false });
                                }
                            }
                            return results;
                        }
                    ''', list(existing_srcs))

                    if new_imgs and len(new_imgs) > 0:
                        # Wait for all expected images if count > 1
                        if req.count > 1 and len(new_imgs) < req.count:
                            yield _ndjson('progress', message=f'Found {len(new_imgs)}/{req.count} images, waiting...')
                            await page.wait_for_timeout(2000)
                            new_imgs = await page.evaluate('''
                                (existingSet) => {
                                    const results = [];
                                    const feedImgs = document.querySelectorAll('[data-cy="image-creation-feed-item"] img');
                                    for (const img of feedImgs) {
                                        const src = img.src;
                                        if (!src) continue;
                                        if (!(src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:'))) continue;
                                        if (existingSet.includes(src)) continue;
                                        const w = Math.max(img.naturalWidth || 0, img.width || 0);
                                        const h = Math.max(img.naturalHeight || 0, img.height || 0);
                                        if (w < 400 && h < 400) continue;
                                        const rect = img.getBoundingClientRect();
                                        results.push({ src, x: rect.x, y: rect.y, w: rect.width, h: rect.height, nw: img.naturalWidth, nh: img.naturalHeight, feed: true });
                                    }
                                    return results;
                                }
                            ''', list(existing_srcs))

                        yield _ndjson('progress', message=f'{len(new_imgs)} image(s) detected. Stabilizing...')
                        await page.wait_for_timeout(1500)

                        # Re-scan for stable full-res versions
                        stable_imgs = await page.evaluate('''
                            (existingSet) => {
                                const results = [];
                                const feedImgs = document.querySelectorAll('[data-cy="image-creation-feed-item"] img');
                                for (const img of feedImgs) {
                                    const src = img.src;
                                    if (!src) continue;
                                    if (!(src.startsWith('http') || src.startsWith('blob:') || src.startsWith('data:'))) continue;
                                    if (existingSet.includes(src)) continue;
                                    const w = Math.max(img.naturalWidth || 0, img.width || 0);
                                    const h = Math.max(img.naturalHeight || 0, img.height || 0);
                                    if (w < 400 && h < 400) continue;
                                    const rect = img.getBoundingClientRect();
                                    results.push({ src, x: rect.x, y: rect.y, w: rect.width, h: rect.height, nw: img.naturalWidth, nh: img.naturalHeight, feed: true });
                                }
                                return results;
                            }
                        ''', list(existing_srcs))
                        if stable_imgs and len(stable_imgs) > 0:
                            new_imgs = stable_imgs

                        yield _ndjson('progress', message=f'{len(new_imgs)} image(s) confirmed. Downloading...')

                        # Download ALL new images
                        downloaded_b64s = []
                        for idx, img_info in enumerate(new_imgs):
                            yield _ndjson('progress', message=f'Downloading image {idx + 1}/{len(new_imgs)}...')
                            img_b64 = None

                            # Try download via feed item Download button
                            try:
                                await page.evaluate('''() => {
                                    document.querySelectorAll('[data-pikaso-target]').forEach(el => el.removeAttribute('data-pikaso-target'));
                                }''')
                                await page.evaluate('''(targetSrc) => {
                                    const imgs = document.querySelectorAll('[data-cy="image-creation-feed-item"] img');
                                    for (const img of imgs) {
                                        if (img.src === targetSrc) {
                                            const feedItem = img.closest('[data-cy="image-creation-feed-item"]');
                                            if (feedItem) feedItem.setAttribute('data-pikaso-target', '1');
                                            break;
                                        }
                                    }
                                }''', img_info['src'])

                                feed_item = page.locator('[data-pikaso-target="1"]').first
                                if await feed_item.count() > 0:
                                    await feed_item.scroll_into_view_if_needed()
                                    await page.wait_for_timeout(300)
                                    await feed_item.hover()
                                    await page.wait_for_timeout(500)

                                    dl_btn = feed_item.locator('button[aria-label="Download"]').first
                                    if await dl_btn.count() > 0:
                                        async with page.expect_download(timeout=30000) as dl_info:
                                            await dl_btn.click()
                                        download = await dl_info.value
                                        dl_path = await download.path()
                                        if dl_path:
                                            with open(dl_path, 'rb') as f:
                                                img_bytes = f.read()
                                            img_b64 = base64.b64encode(img_bytes).decode('utf-8')
                            except Exception as e:
                                yield _ndjson('progress', message=f'Download button failed for image {idx + 1}: {e}, trying fetch...')

                            # Fallback: fetch URL directly
                            if not img_b64:
                                try:
                                    if img_info['src'].startswith('data:'):
                                        img_b64 = img_info['src'].split(',')[1]
                                    elif img_info['src'].startswith('blob:'):
                                        img_b64 = await page.evaluate('''async (blobUrl) => {
                                            const resp = await fetch(blobUrl);
                                            const blob = await resp.blob();
                                            return new Promise(resolve => {
                                                const reader = new FileReader();
                                                reader.onloadend = () => resolve(reader.result.split(",")[1]);
                                                reader.readAsDataURL(blob);
                                            });
                                        }''', img_info['src'])
                                    else:
                                        resp = await context.request.get(img_info['src'])
                                        buf = await resp.body()
                                        img_b64 = base64.b64encode(buf).decode('utf-8')
                                except Exception as e:
                                    yield _ndjson('progress', message=f'Fetch failed for image {idx + 1}: {e}')

                            if img_b64:
                                downloaded_b64s.append(img_b64)

                        if downloaded_b64s:
                            _last_gen_time = time.time()
                            _consecutive_failures = 0
                            yield _ndjson('complete', success=True,
                                         image_base64=downloaded_b64s[0],
                                         images_base64=downloaded_b64s)
                            return
                        else:
                            _consecutive_failures += 1
                            yield _ndjson('error', message='All image downloads failed')
                            return

                    await page.wait_for_timeout(1500)

                _consecutive_failures += 1
                yield _ndjson('error', message=f'Generation timed out after {timeout}s')

            except Exception as e:
                _consecutive_failures += 1
                import traceback
                tb = traceback.format_exc()
                print(f'[freepik] Generation error ({_consecutive_failures} consecutive): {e}\n{tb}')
                yield _ndjson('error', message=f'{e}')
                if 'Target page, context or browser has been closed' in str(e) or 'Browser has been closed' in str(e) or 'Connection closed' in str(e):
                    print('[freepik] Browser crash detected — will restart on next request')
                    await _kill_browser()
            finally:
                if context:
                    try:
                        await context.close()
                    except Exception:
                        pass

    return StreamingResponse(stream(), media_type='application/x-ndjson')


@app.on_event('shutdown')
async def shutdown():
    global _browser, _playwright
    if _browser:
        await _browser.close()
    if _playwright:
        await _playwright.stop()
