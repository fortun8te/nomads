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
    Base delay varies per character with occasional micro-pauses
    after punctuation, spaces, and at random intervals."""
    for i, ch in enumerate(text):
        # Base delay: 8-25ms per character (fast but variable)
        delay = random.uniform(8, 25)
        # Slightly slower after punctuation
        if ch in '.,!?;:':
            delay = random.uniform(30, 60)
        # Small pause after spaces (word boundary)
        elif ch == ' ':
            delay = random.uniform(15, 40)
        # Occasional micro-pause mid-word (thinking hesitation)
        elif random.random() < 0.03:
            delay = random.uniform(50, 120)
        # Slightly faster during common letter sequences
        elif i > 0 and text[i-1:i+1].lower() in ('th', 'he', 'in', 'er', 'an', 'on', 'at', 'en', 'nd', 'ti'):
            delay = random.uniform(5, 15)
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
        # Get the window ID for the first target
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


@app.post('/api/generate')
async def generate(req: GenerateRequest):
    """Generate image via Freepik Pikaso. Streams NDJSON progress events."""

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

                # ── 1. Navigate ──
                yield _ndjson('progress', message='Opening Freepik Pikaso...')
                await page.goto(PIKASO_URL, wait_until='domcontentloaded', timeout=30000)
                await page.wait_for_timeout(4000)

                # ── 2. Access check ──
                title = await page.title()
                if '403' in title or 'denied' in title.lower():
                    yield _ndjson('error', message=f'Freepik blocked access: {title}')
                    return
                if '/log-in' in page.url or '/login' in page.url:
                    yield _ndjson('error', message='Not logged in. Log in to freepik.com in Chrome first.')
                    return

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
                    # Tag the model button via JS — find label "Model", then next sibling button
                    found = await page.evaluate('''() => {
                        const labels = document.querySelectorAll('label');
                        for (const label of labels) {
                            if (label.textContent.trim().toLowerCase() === 'model') {
                                // Walk next siblings to find the button
                                let el = label.nextElementSibling;
                                while (el) {
                                    if (el.tagName === 'BUTTON') {
                                        el.setAttribute('data-pikaso-model-btn', '1');
                                        return el.innerText.trim().split('\\n')[0];
                                    }
                                    const btn = el.querySelector('button');
                                    if (btn) {
                                        btn.setAttribute('data-pikaso-model-btn', '1');
                                        return btn.innerText.trim().split('\\n')[0];
                                    }
                                    el = el.nextElementSibling;
                                }
                                // Also try parent container
                                let parent = label.parentElement;
                                for (let i = 0; i < 3 && parent; i++) {
                                    const btn = parent.querySelector('button');
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
                        current_model = found
                        if current_model.lower() == model_text.lower():
                            yield _ndjson('progress', message=f'Model already set to {model_text}')
                        else:
                            await model_btn.click()
                            await page.wait_for_timeout(1000)

                            # Find and click the target model in the popover
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
                    # The ratio button shows the current ratio (e.g. "1:1")
                    ratio_btn = page.locator('button').filter(
                        has_text=re.compile(r'^\d+:\d+$')
                    ).first
                    if await ratio_btn.count() > 0:
                        await ratio_btn.click()
                        await page.wait_for_timeout(800)

                        # Click the desired ratio
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
                # Freepik Pikaso image count control (verified in live browser):
                #   [data-cy="number-images-value"] — displays current count
                #   [data-cy="decrease-number-images-button"] — minus button
                #   [data-cy="increase-number-images-button"] — plus button
                # Retry up to 3 times since UI can be slow to respond
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
                                        await page.wait_for_timeout(300)
                                else:
                                    plus_btn = page.locator('[data-cy="increase-number-images-button"]')
                                    for _ in range(req.count - current_count):
                                        await plus_btn.click()
                                        await page.wait_for_timeout(300)
                                # Verify the count was set correctly
                                await page.wait_for_timeout(300)
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
                            # Count element not found — might not be visible yet
                            if count_attempt < 2:
                                await page.wait_for_timeout(500)
                                continue
                            break
                    except Exception as e:
                        if count_attempt < 2:
                            yield _ndjson('progress', message=f'Count setting attempt {count_attempt+1} failed: {e}, retrying...')
                            await page.wait_for_timeout(500)
                        else:
                            yield _ndjson('progress', message=f'Count setting failed after 3 attempts: {e}')

                # ── 5b. Upload reference images ──
                # Freepik Pikaso "Add media" dialog flow (verified in live browser):
                #   1. Click [data-cy="reference-upload-box"] → opens "Add media" dialog
                #   2. Click [data-cy="upload-button"] ("Upload media") → triggers native file chooser
                #   3. Intercept file chooser with expect_file_chooser, set file
                #   4. Wait for [data-cy="upload-modal-use-button"] ("Add media") to enable
                #   5. Click it → dialog closes, image becomes a reference
                #   CRITICAL: ALWAYS close dialog (Escape) before continuing, even on failure
                if req.reference_images:
                    yield _ndjson('progress', message=f'Uploading {len(req.reference_images)} reference image(s)...')
                    import tempfile

                    for idx, img_b64 in enumerate(req.reference_images):
                        try:
                            raw_b64 = img_b64.split(',')[1] if ',' in img_b64 else img_b64
                            img_bytes = base64.b64decode(raw_b64)
                            uploaded = False

                            tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
                            tmp.write(img_bytes)
                            tmp_path = tmp.name
                            tmp.close()
                            yield _ndjson('progress', message=f'Image {idx+1}: {len(img_bytes)} bytes')

                            # Step 1: Click the Upload reference card to open dialog
                            upload_card = page.locator('[data-cy="reference-upload-box"]')
                            if await upload_card.count() == 0:
                                yield _ndjson('progress', message='Upload card not found — skipping')
                                os.unlink(tmp_path)
                                continue

                            await upload_card.click()
                            yield _ndjson('progress', message='Opening Add media dialog...')
                            await page.wait_for_timeout(2000)

                            # Step 2: Click "Upload media" button with file chooser intercept
                            # This is the proper flow — set_input_files on hidden input
                            # does NOT trigger React's upload handler
                            upload_media_btn = page.locator('[data-cy="upload-button"]')
                            if await upload_media_btn.count() > 0:
                                try:
                                    await upload_media_btn.scroll_into_view_if_needed()
                                    await page.wait_for_timeout(300)
                                    async with page.expect_file_chooser(timeout=5000) as fc_info:
                                        await upload_media_btn.click()
                                    fc = await fc_info.value
                                    await fc.set_files(tmp_path)
                                    yield _ndjson('progress', message='File selected via chooser, uploading...')
                                    # Wait for upload to complete (file goes to Freepik servers)
                                    await page.wait_for_timeout(5000)

                                    # Step 3: Wait for "Add media" to enable (image uploaded & selected)
                                    add_btn = page.locator('[data-cy="upload-modal-use-button"]')
                                    if await add_btn.count() > 0:
                                        for _ in range(20):  # up to 10s
                                            if not await add_btn.is_disabled():
                                                break
                                            await page.wait_for_timeout(500)

                                        if not await add_btn.is_disabled():
                                            await add_btn.click()
                                            await page.wait_for_timeout(2000)
                                            uploaded = True
                                            yield _ndjson('progress', message=f'Reference image {idx+1} added ✓')
                                        else:
                                            yield _ndjson('progress', message='Add media still disabled — image may need selecting')
                                except Exception as e:
                                    yield _ndjson('progress', message=f'File chooser upload failed: {e}')
                            else:
                                yield _ndjson('progress', message='Upload media button not found in dialog')

                            # Clean up temp file
                            try:
                                os.unlink(tmp_path)
                            except Exception:
                                pass

                            # CRITICAL: Close dialog ONLY if upload failed
                            # If upload succeeded, "Add media" click already closed the dialog.
                            # Pressing Escape on the main page would collapse the prompt area.
                            if not uploaded:
                                try:
                                    close_btn = page.locator('[data-cy="video-modal-close-button-desktop"]')
                                    if await close_btn.count() > 0:
                                        await close_btn.click()
                                        await page.wait_for_timeout(500)
                                    else:
                                        await page.keyboard.press('Escape')
                                        await page.wait_for_timeout(500)
                                except Exception:
                                    try:
                                        await page.keyboard.press('Escape')
                                        await page.wait_for_timeout(500)
                                    except Exception:
                                        pass

                            if not uploaded:
                                yield _ndjson('progress', message=f'Could not upload image {idx+1} — continuing without it')
                        except Exception as e:
                            yield _ndjson('progress', message=f'Image {idx+1} upload error: {e}')
                            # Ensure dialog is closed even on exception
                            try:
                                await page.keyboard.press('Escape')
                                await page.wait_for_timeout(500)
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

                # ── 7. (snapshot moved to step 9 — right before Generate click) ──

                # ── 8. Fill prompt ──
                yield _ndjson('progress', message=f'Filling prompt: "{req.prompt[:60]}..."' if len(req.prompt) > 60 else f'Filling prompt: "{req.prompt}"')

                # Re-find prompt element — after uploading references, the textarea
                # may have been replaced with a contenteditable div, and the old
                # placeholder selector ("Describe your image") no longer exists.
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

                # Clear existing text via JS (more reliable than keyboard shortcuts)
                await page.evaluate('''() => {
                    // Clear textarea
                    const ta = document.querySelector('textarea');
                    if (ta) {
                        ta.value = '';
                        ta.dispatchEvent(new Event('input', {bubbles: true}));
                        ta.dispatchEvent(new Event('change', {bubbles: true}));
                    }
                    // Clear contenteditable
                    const ce = document.querySelector('[contenteditable="true"]');
                    if (ce) {
                        ce.textContent = '';
                        ce.innerHTML = '';
                        ce.dispatchEvent(new Event('input', {bubbles: true}));
                    }
                }''')
                await page.wait_for_timeout(300)

                # Click to focus
                await prompt_el.click()
                await page.wait_for_timeout(200)

                # ── Disable AI prompt toggle ──
                # Verified against live Freepik Pikaso UI:
                #   - Selector: [data-cy="smart-prompt-toggle"]
                #   - ON state:  track has class "bg-piki-blue-500", dot has "translate-x-4"
                #   - OFF state: track has class "bg-surface-4", no translate
                #   - Clicking the prompt textarea first to expand it and reveal the toggle
                #   - Must use Playwright .click() (not DOM click) for React events
                yield _ndjson('progress', message='Checking AI prompt toggle...')
                try:
                    # Click prompt to expand it and reveal the toggle
                    await prompt_el.click()
                    await page.wait_for_timeout(1000)

                    toggle_btn = page.locator('[data-cy="smart-prompt-toggle"]')
                    if await toggle_btn.count() > 0:
                        # Check if toggle is ON by looking at the track's class
                        is_on = await page.evaluate('''() => {
                            const btn = document.querySelector('[data-cy="smart-prompt-toggle"]');
                            if (!btn) return false;
                            const track = btn.querySelector('span');
                            return track && track.className.includes('piki-blue');
                        }''')

                        if is_on:
                            yield _ndjson('progress', message='AI prompt toggle is ON — clicking to disable...')
                            await toggle_btn.click()
                            await page.wait_for_timeout(800)

                            # Verify it toggled off
                            still_on = await page.evaluate('''() => {
                                const btn = document.querySelector('[data-cy="smart-prompt-toggle"]');
                                if (!btn) return false;
                                const track = btn.querySelector('span');
                                return track && track.className.includes('piki-blue');
                            }''')

                            if still_on:
                                yield _ndjson('progress', message='Still on after click, retrying...')
                                await toggle_btn.click()
                                await page.wait_for_timeout(500)
                            else:
                                yield _ndjson('progress', message='AI prompt toggle disabled ✓')
                        else:
                            yield _ndjson('progress', message='AI prompt toggle already off ✓')
                    else:
                        yield _ndjson('progress', message='Toggle [data-cy="smart-prompt-toggle"] not found on page')
                except Exception as e:
                    yield _ndjson('progress', message=f'AI toggle check failed: {e}')

                # Re-focus the prompt textarea (toggle click moved focus away)
                await prompt_el.click()
                await page.wait_for_timeout(300)
                await page.keyboard.press('Meta+a')
                await page.wait_for_timeout(100)
                await page.keyboard.press('Backspace')
                await page.wait_for_timeout(100)
                await page.keyboard.press('Meta+a')
                await page.keyboard.press('Backspace')
                await page.wait_for_timeout(200)

                # Type the actual prompt
                # Handle @img1, @img2, etc. — Freepik's mention system requires:
                #   type "@" → autocomplete popup appears → type "img1" → Enter to select
                import re as _re
                parts = _re.split(r'(@img\d+)', req.prompt)
                for part in parts:
                    if not part:
                        continue
                    img_match = _re.match(r'^@img(\d+)$', part)
                    if img_match:
                        # Type @ to trigger autocomplete, then imgN, then Enter to select
                        await _human_type(page, '@')
                        await page.wait_for_timeout(500)  # wait for dropdown
                        await page.keyboard.type(f'img{img_match.group(1)}', delay=30)
                        await page.wait_for_timeout(300)
                        await page.keyboard.press('Enter')
                        await page.wait_for_timeout(300)
                    else:
                        await _human_type(page, part)
                await page.wait_for_timeout(300)

                # Verify prompt was entered correctly
                try:
                    actual_text = await page.evaluate('''() => {
                        const ta = document.querySelector('textarea');
                        if (ta) return ta.value;
                        const ce = document.querySelector('[contenteditable="true"]');
                        if (ce) return ce.textContent;
                        return null;
                    }''')
                    if actual_text and req.prompt not in actual_text:
                        yield _ndjson('progress', message=f'Warning: prompt may not have been set correctly. Got: "{(actual_text or "")[:50]}"')
                except Exception:
                    pass

                # ── 9. Snapshot ALL images RIGHT before Generate ──
                # Captures http, blob:, and data: URLs so detection won't false-positive
                existing_srcs = set(await page.evaluate('''
                    () => Array.from(document.querySelectorAll('img'))
                        .map(i => i.src)
                        .filter(s => s && (s.startsWith('http') || s.startsWith('blob:') || s.startsWith('data:')))
                '''))
                existing_count = len(existing_srcs)
                yield _ndjson('progress', message=f'Snapshot: {existing_count} images on page before Generate')

                # ── 10. Click Generate ──
                # Button may be disabled during server queue — wait for it to enable
                gen_btn = page.locator('[data-cy="generate-button"]').first
                if await gen_btn.count() == 0:
                    # Fallback selector
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
                        # Check for updated ETA
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
                    await page.wait_for_timeout(3000)

                yield _ndjson('progress', message='Clicking Generate...')
                await gen_btn.click()
                yield _ndjson('progress', message='Generating image...')

                # ── 11. Wait for generation: loading indicator → complete ──
                gen_start = time.time()
                timeout = 900  # 15 min base — Freepik queues can be 10+ min when busy
                last_progress = gen_start

                # Phase A: Wait for loading indicator to appear (confirms generation kicked off)
                gen_started = False
                for _ in range(20):
                    body_text = await page.inner_text('body')
                    if any(kw in body_text for kw in ['Generating', 'Final touches', 'Loading']):
                        gen_started = True
                        yield _ndjson('progress', message='Generation in progress...')
                        break
                    await page.wait_for_timeout(500)

                # Phase B: Wait for loading to finish, then detect new image
                while time.time() - gen_start < timeout:
                    elapsed = int(time.time() - gen_start)

                    if time.time() - last_progress > 10:
                        yield _ndjson('progress', message=f'Generating... ({elapsed}s)')
                        last_progress = time.time()

                        # Re-check busy warnings — extend timeout if ETA is longer
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
                                        # Extend timeout to ETA + 3 min buffer from now
                                        needed = (time.time() - gen_start) + eta_secs + 180
                                        if needed > timeout:
                                            timeout = needed
                                            yield _ndjson('progress', message=f'Queue detected — timeout extended to {int(timeout)}s')
                                    break
                        except Exception:
                            pass

                    # If we saw loading, check if it's still loading before looking for images
                    if gen_started:
                        still_loading = await page.evaluate('''() => {
                            const body = document.body.innerText;
                            return body.includes('Generating') || body.includes('Final touches') || body.includes('Loading');
                        }''')
                        if still_loading:
                            await page.wait_for_timeout(1500)
                            continue
                        # Loading just finished — wait for image to render
                        await page.wait_for_timeout(2000)

                    # Look for new images not in the original snapshot
                    # Pikaso feed is NEWEST-FIRST — first feed item = top = just generated
                    # Returns ALL new images (for count > 1 support)
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
                                // Fallback: scan all imgs
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

                    # Wait for expected count of images (if count > 1, wait a bit longer for all)
                    if new_imgs and len(new_imgs) > 0:
                        # If we expect more images (count > 1), wait for them
                        if req.count > 1 and len(new_imgs) < req.count:
                            yield _ndjson('progress', message=f'Found {len(new_imgs)}/{req.count} images, waiting for rest...')
                            await page.wait_for_timeout(3000)
                            # Re-scan
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

                        # Stabilization: wait for Freepik to swap low-res preview → full-res
                        await page.wait_for_timeout(2000)

                        # Re-scan for stable versions
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
                                # Clear any previous target tag
                                await page.evaluate('''() => {
                                    document.querySelectorAll('[data-pikaso-target]').forEach(el => el.removeAttribute('data-pikaso-target'));
                                }''')
                                # Tag this image's parent feed item
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
                                    await page.wait_for_timeout(500)
                                    await feed_item.hover()
                                    await page.wait_for_timeout(800)

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
                            _consecutive_failures = 0  # Reset on success
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
                # If browser itself crashed, kill it so next request gets a fresh one
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
