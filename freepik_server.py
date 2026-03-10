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
PIKASO_URL = 'https://www.freepik.com/pikaso/ai-image-generator'
MIN_INTERVAL = 5  # seconds between generations

# Exact button text in Freepik's model dropdown
MODEL_BUTTON_TEXT = {
    'nano-banana-2': 'Google Nano Banana 2',
    'seedream-5-lite': 'Seedream 5 Lite',
    'flux-2-pro': 'Flux.2 Pro',
    'cinematic': 'Cinematic',
    'auto': 'Auto',
}

# ── Global state ──
_playwright = None
_browser = None
_lock = asyncio.Lock()
_last_gen_time = 0
_consecutive_failures = 0
MAX_FAILURES_BEFORE_RESTART = 2


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


class GenerateRequest(BaseModel):
    prompt: str
    model: str = 'nano-banana-2'
    aspect_ratio: str = '1:1'
    count: int = 1  # number of images per generation (Freepik default is often 2)
    reference_images: list[str] = []  # base64-encoded images


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

    print('[freepik] Launching browser (minimized)...')
    _browser = await _playwright.chromium.launch(
        headless=False,
        args=[
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--no-default-browser-check',
            '--window-position=-9999,-9999',
            '--window-size=1,1',
        ],
    )

    # Minimize via CDP so it stays hidden
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

    return _browser


async def _new_page_with_cookies():
    """Create a new page with Chrome cookies and stealth patches."""
    browser = await _ensure_browser()
    context = await browser.new_context(
        viewport={'width': 1920, 'height': 1080},
        user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        accept_downloads=True,
    )

    try:
        from playwright_stealth import stealth_async
        page = await context.new_page()
        await stealth_async(page)
    except Exception:
        page = await context.new_page()

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
    return {'ok': True, 'browser_ready': _browser is not None, 'has_cookies': has_cookies, 'consecutive_failures': _consecutive_failures}


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


@app.post('/api/generate')
async def generate(req: GenerateRequest):
    """Generate image via Freepik Pikaso. Streams NDJSON progress events."""

    # Pre-filter reference images — drop empty/corrupt ones
    clean_refs = _filter_reference_images(req.reference_images)
    ref_count = len(clean_refs)
    if ref_count != len(req.reference_images):
        print(f'[freepik] Filtered {len(req.reference_images)} → {ref_count} valid reference images')

    async def stream():
        global _last_gen_time, _consecutive_failures
        async with _lock:
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
            try:
                yield _ndjson('progress', message='Launching browser...')
                page, context = await _new_page_with_cookies()

                # ── 1. Navigate to Pikaso ──
                yield _ndjson('progress', message='Opening Freepik Pikaso...')
                await page.goto(PIKASO_URL, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(2500)

                # ── 2. Access check ──
                title = await page.title()
                if '403' in title or 'denied' in title.lower():
                    yield _ndjson('error', message=f'Freepik blocked access: {title}')
                    return
                if '/log-in' in page.url or '/login' in page.url:
                    yield _ndjson('error', message='Not logged in. Log in to freepik.com in Chrome first.')
                    return

                # ── 2b. Navigate to Personal project → History ──
                # Pikaso may show a project selector or have sidebar navigation.
                # Click "Personal project" if visible, then "History" to load workspace.
                yield _ndjson('progress', message='Looking for Personal project...')
                try:
                    # Try multiple selectors for "Personal project" button/link
                    personal_found = False
                    for sel in [
                        'text="Personal project"',
                        'text="Personal Project"',
                        'button:has-text("Personal")',
                        'a:has-text("Personal project")',
                        '[data-cy="personal-project"]',
                    ]:
                        try:
                            el = page.locator(sel).first
                            if await el.count() > 0 and await el.is_visible():
                                await el.click()
                                await page.wait_for_timeout(1500)
                                personal_found = True
                                yield _ndjson('progress', message='Personal project selected ✓')
                                break
                        except Exception:
                            continue

                    if not personal_found:
                        # Try JS approach — find any element containing "Personal project" text
                        clicked = await page.evaluate('''() => {
                            const els = document.querySelectorAll('button, a, div[role="button"], span');
                            for (const el of els) {
                                const text = el.textContent?.trim() || '';
                                if (text.toLowerCase().includes('personal project') || text.toLowerCase().includes('personal')) {
                                    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                                        el.click();
                                        return text;
                                    }
                                }
                            }
                            return null;
                        }''')
                        if clicked:
                            await page.wait_for_timeout(1500)
                            yield _ndjson('progress', message=f'Clicked: "{clicked}" ✓')
                        else:
                            yield _ndjson('progress', message='Personal project not found — continuing anyway')

                    # Now look for "History" tab/button
                    yield _ndjson('progress', message='Looking for History...')
                    history_found = False
                    for sel in [
                        'text="History"',
                        'button:has-text("History")',
                        'a:has-text("History")',
                        '[data-cy="history-tab"]',
                        '[role="tab"]:has-text("History")',
                    ]:
                        try:
                            el = page.locator(sel).first
                            if await el.count() > 0 and await el.is_visible():
                                await el.click()
                                await page.wait_for_timeout(1000)
                                history_found = True
                                yield _ndjson('progress', message='History selected ✓')
                                break
                        except Exception:
                            continue

                    if not history_found:
                        clicked = await page.evaluate('''() => {
                            const els = document.querySelectorAll('button, a, div[role="button"], span, [role="tab"]');
                            for (const el of els) {
                                const text = el.textContent?.trim() || '';
                                if (text.toLowerCase() === 'history') {
                                    if (el.offsetWidth > 0 && el.offsetHeight > 0) {
                                        el.click();
                                        return true;
                                    }
                                }
                            }
                            return false;
                        }''')
                        if clicked:
                            await page.wait_for_timeout(1000)
                            yield _ndjson('progress', message='History clicked via JS ✓')
                        else:
                            yield _ndjson('progress', message='History tab not found — continuing anyway')

                except Exception as e:
                    yield _ndjson('progress', message=f'Project/History nav: {e} — continuing')

                # ── 3. Wait for prompt input ──
                yield _ndjson('progress', message='Waiting for Pikaso UI...')
                prompt_el = None
                for sel in ['[placeholder="Describe your image"]', 'textarea', '[contenteditable="true"]']:
                    try:
                        await page.wait_for_selector(sel, timeout=8000)
                        el = page.locator(sel).first
                        if await el.count() > 0:
                            prompt_el = el
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

                # ── 5. Select aspect ratio ──
                yield _ndjson('progress', message=f'Setting aspect ratio to {req.aspect_ratio}...')
                try:
                    ratio_btn = page.locator('button').filter(
                        has_text=re.compile(r'^\d+:\d+$')
                    ).first
                    if await ratio_btn.count() > 0:
                        await ratio_btn.click()
                        await page.wait_for_timeout(800)

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
                for count_attempt in range(3):
                    try:
                        count_el = page.locator('[data-cy="number-images-value"]')
                        if await count_el.count() > 0:
                            current_count = int(await count_el.text_content() or '1')
                            if current_count != req.count:
                                yield _ndjson('progress', message=f'Setting image count from {current_count} to {req.count}...')
                                if req.count < current_count:
                                    minus_btn = page.locator('[data-cy="decrease-number-images-button"]')
                                    for _ in range(current_count - req.count):
                                        await minus_btn.click()
                                        await page.wait_for_timeout(200)
                                else:
                                    plus_btn = page.locator('[data-cy="increase-number-images-button"]')
                                    for _ in range(req.count - current_count):
                                        await plus_btn.click()
                                        await page.wait_for_timeout(200)
                                await page.wait_for_timeout(200)
                                verify_count = int(await count_el.text_content() or '0')
                                if verify_count == req.count:
                                    yield _ndjson('progress', message=f'Image count set to {verify_count}')
                                    break
                                else:
                                    yield _ndjson('progress', message=f'Count verify failed ({verify_count} != {req.count}), retrying...')
                            else:
                                yield _ndjson('progress', message=f'Image count already {req.count}')
                                break
                        else:
                            if count_attempt < 2:
                                await page.wait_for_timeout(300)
                                continue
                            break
                    except Exception as e:
                        if count_attempt < 2:
                            yield _ndjson('progress', message=f'Count attempt {count_attempt+1} failed: {e}, retrying...')
                            await page.wait_for_timeout(300)
                        else:
                            yield _ndjson('progress', message=f'Count setting failed after 3 attempts: {e}')

                # ── 5b. Upload reference images ──
                # New Freepik UI: inline drop zone (no dialog).
                #   1. Click [data-cy="reference-upload-box"] → expands to "Drop or select file"
                #   2. Click again with file chooser intercept → triggers native file picker
                #   3. Image uploads directly as reference (no confirmation dialog)
                #   Fallback: if old dialog flow still exists, handle that too.
                if clean_refs:
                    yield _ndjson('progress', message=f'Uploading {ref_count} reference image(s)...')
                    import tempfile

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

                            # Find the upload card
                            upload_card = page.locator('[data-cy="reference-upload-box"]')
                            if await upload_card.count() == 0:
                                yield _ndjson('progress', message='Upload card not found — skipping')
                                os.unlink(tmp_path)
                                continue

                            # Click to expand the drop zone
                            await upload_card.click()
                            await page.wait_for_timeout(800)

                            # Try file chooser intercept on the drop zone click
                            try:
                                async with page.expect_file_chooser(timeout=5000) as fc_info:
                                    await upload_card.click()
                                fc = await fc_info.value
                                await fc.set_files(tmp_path)
                                yield _ndjson('progress', message=f'File selected, uploading...')
                                await page.wait_for_timeout(2500)
                                uploaded = True
                                yield _ndjson('progress', message=f'Reference image {idx+1} added ✓')
                            except Exception as e1:
                                yield _ndjson('progress', message=f'Drop zone upload failed: {e1}, trying fallback...')

                                # Fallback: try old dialog flow (upload-button or upload-image-button)
                                for btn_sel in ['[data-cy="upload-button"]', '[data-cy="upload-image-button"]']:
                                    fallback_btn = page.locator(btn_sel)
                                    if await fallback_btn.count() > 0:
                                        try:
                                            async with page.expect_file_chooser(timeout=5000) as fc_info:
                                                await fallback_btn.click()
                                            fc = await fc_info.value
                                            await fc.set_files(tmp_path)
                                            yield _ndjson('progress', message=f'Fallback upload via {btn_sel}...')
                                            await page.wait_for_timeout(2500)

                                            # Check for old-style "Add media" confirmation
                                            add_btn = page.locator('[data-cy="upload-modal-use-button"]')
                                            if await add_btn.count() > 0:
                                                for _ in range(20):
                                                    if not await add_btn.is_disabled():
                                                        break
                                                    await page.wait_for_timeout(250)
                                                if not await add_btn.is_disabled():
                                                    await add_btn.click()
                                                    await page.wait_for_timeout(1000)
                                            uploaded = True
                                            yield _ndjson('progress', message=f'Reference image {idx+1} added ✓')
                                            break
                                        except Exception as e2:
                                            yield _ndjson('progress', message=f'{btn_sel} failed: {e2}')

                                # Last resort: try hidden file input directly
                                if not uploaded:
                                    try:
                                        file_input = page.locator('input[type="file"]').first
                                        if await file_input.count() > 0:
                                            await file_input.set_input_files(tmp_path)
                                            yield _ndjson('progress', message=f'Direct file input upload...')
                                            await page.wait_for_timeout(2500)
                                            uploaded = True
                                            yield _ndjson('progress', message=f'Reference image {idx+1} added ✓')
                                    except Exception as e3:
                                        yield _ndjson('progress', message=f'Direct file input failed: {e3}')

                            # Clean up temp file
                            try:
                                os.unlink(tmp_path)
                            except Exception:
                                pass

                            # Close any dialog if upload failed
                            if not uploaded:
                                try:
                                    await page.keyboard.press('Escape')
                                    await page.wait_for_timeout(300)
                                except Exception:
                                    pass
                                yield _ndjson('progress', message=f'Could not upload image {idx+1} — continuing without it')
                        except Exception as e:
                            yield _ndjson('progress', message=f'Image {idx+1} upload error: {e}')
                            try:
                                await page.keyboard.press('Escape')
                                await page.wait_for_timeout(300)
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
                for sel in ['[contenteditable="true"]', 'textarea', '[placeholder*="image"]']:
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

                # Clear existing text via JS
                await page.evaluate('''() => {
                    const ta = document.querySelector('textarea');
                    if (ta) {
                        ta.value = '';
                        ta.dispatchEvent(new Event('input', {bubbles: true}));
                        ta.dispatchEvent(new Event('change', {bubbles: true}));
                    }
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

                # ── Disable AI prompt toggle ──
                yield _ndjson('progress', message='Checking AI prompt toggle...')
                try:
                    await prompt_el.click()
                    await page.wait_for_timeout(600)

                    toggle_btn = page.locator('[data-cy="smart-prompt-toggle"]')
                    if await toggle_btn.count() > 0:
                        is_on = await page.evaluate('''() => {
                            const btn = document.querySelector('[data-cy="smart-prompt-toggle"]');
                            if (!btn) return false;
                            const track = btn.querySelector('span');
                            return track && track.className.includes('piki-blue');
                        }''')

                        if is_on:
                            yield _ndjson('progress', message='AI prompt toggle is ON — disabling...')
                            await toggle_btn.click()
                            await page.wait_for_timeout(500)

                            still_on = await page.evaluate('''() => {
                                const btn = document.querySelector('[data-cy="smart-prompt-toggle"]');
                                if (!btn) return false;
                                const track = btn.querySelector('span');
                                return track && track.className.includes('piki-blue');
                            }''')

                            if still_on:
                                await toggle_btn.click()
                                await page.wait_for_timeout(300)
                            else:
                                yield _ndjson('progress', message='AI prompt toggle disabled ✓')
                        else:
                            yield _ndjson('progress', message='AI prompt toggle already off ✓')
                    else:
                        yield _ndjson('progress', message='Smart prompt toggle not found')
                except Exception as e:
                    yield _ndjson('progress', message=f'AI toggle check failed: {e}')

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

                # Type the actual prompt (handle @img1, @img2 mention system)
                import re as _re
                parts = _re.split(r'(@img\d+)', req.prompt)
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
                        const ta = document.querySelector('textarea');
                        if (ta) return ta.value;
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
