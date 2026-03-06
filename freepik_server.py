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


class GenerateRequest(BaseModel):
    prompt: str
    model: str = 'nano-banana-2'
    aspect_ratio: str = '1:1'
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


async def _ensure_browser():
    """Launch browser with stealth patches."""
    global _playwright, _browser
    if _browser is not None:
        return _browser

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
        viewport={'width': 1440, 'height': 900},
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
    return {'ok': True, 'browser_ready': _browser is not None, 'has_cookies': has_cookies}


@app.post('/api/generate')
async def generate(req: GenerateRequest):
    """Generate image via Freepik Pikaso. Streams NDJSON progress events."""

    async def stream():
        global _last_gen_time
        async with _lock:
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

                # ── 5b. Upload reference images ──
                if req.reference_images:
                    yield _ndjson('progress', message=f'Uploading {len(req.reference_images)} reference image(s)...')
                    import tempfile

                    # First, try to find and click a "Reference" or "Image" button to reveal upload area
                    try:
                        ref_btn = None
                        for text_pattern in ['Reference', 'Image reference', 'Style', 'Upload image', 'Add image']:
                            btn = page.locator('button').filter(has_text=re.compile(re.escape(text_pattern), re.IGNORECASE)).first
                            if await btn.count() > 0:
                                ref_btn = btn
                                break
                        if ref_btn:
                            await ref_btn.click()
                            await page.wait_for_timeout(1500)
                            yield _ndjson('progress', message='Opened reference image panel')
                    except Exception as e:
                        yield _ndjson('progress', message=f'Could not find reference panel button: {e}')

                    for idx, img_b64 in enumerate(req.reference_images):
                        try:
                            # Strip data URL prefix if present
                            raw_b64 = img_b64.split(',')[1] if ',' in img_b64 else img_b64
                            img_bytes = base64.b64decode(raw_b64)

                            # Write to temp file
                            tmp = tempfile.NamedTemporaryFile(suffix='.png', delete=False)
                            tmp.write(img_bytes)
                            tmp_path = tmp.name
                            tmp.close()

                            uploaded = False

                            # Strategy 1: find file inputs that accept images
                            file_inputs = page.locator('input[type="file"][accept*="image"]')
                            input_count = await file_inputs.count()

                            # Strategy 2: any file input
                            if input_count == 0:
                                file_inputs = page.locator('input[type="file"]')
                                input_count = await file_inputs.count()

                            if input_count > 0:
                                # Try each file input (some might be for other purposes)
                                for fi_idx in range(input_count):
                                    try:
                                        target_input = file_inputs.nth(fi_idx)
                                        await target_input.set_input_files(tmp_path)
                                        await page.wait_for_timeout(2000)
                                        uploaded = True
                                        yield _ndjson('progress', message=f'Reference image {idx+1}/{len(req.reference_images)} uploaded')
                                        break
                                    except Exception:
                                        continue

                            # Strategy 3: drag and drop onto the page
                            if not uploaded:
                                try:
                                    # Look for a drop zone
                                    drop_zone = page.locator('[class*="drop"], [class*="upload"], [data-testid*="drop"]').first
                                    if await drop_zone.count() > 0:
                                        # Use Playwright's file chooser
                                        async with page.expect_file_chooser(timeout=5000) as fc_info:
                                            await drop_zone.click()
                                        file_chooser = await fc_info.value
                                        await file_chooser.set_files(tmp_path)
                                        await page.wait_for_timeout(2000)
                                        uploaded = True
                                        yield _ndjson('progress', message=f'Reference image {idx+1}/{len(req.reference_images)} uploaded via drop zone')
                                except Exception:
                                    pass

                            if not uploaded:
                                yield _ndjson('progress', message=f'Could not upload reference image {idx+1} — no upload target found')

                            # Clean up temp file
                            try:
                                os.unlink(tmp_path)
                            except Exception:
                                pass
                        except Exception as e:
                            yield _ndjson('progress', message=f'Reference image {idx+1} upload failed: {e}')

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

                # ── 7. Snapshot existing images (before generation) ──
                existing_srcs = set(await page.evaluate('''
                    () => Array.from(document.querySelectorAll('img'))
                        .map(i => i.src)
                        .filter(s => s && s.startsWith('http'))
                '''))

                # ── 8. Fill prompt ──
                yield _ndjson('progress', message=f'Filling prompt: "{req.prompt[:60]}..."' if len(req.prompt) > 60 else f'Filling prompt: "{req.prompt}"')

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

                # Click, select all, delete as backup
                await prompt_el.click()
                await page.wait_for_timeout(200)
                await page.keyboard.press('Meta+a')
                await page.wait_for_timeout(100)
                await page.keyboard.press('Backspace')
                await page.wait_for_timeout(100)
                await page.keyboard.press('Meta+a')
                await page.keyboard.press('Backspace')
                await page.wait_for_timeout(200)

                # Type the actual prompt
                await page.keyboard.type(req.prompt, delay=15)
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

                # ── 9. Click Generate ──
                yield _ndjson('progress', message='Clicking Generate...')
                gen_btn = page.locator('button:has-text("Generate")').first
                if await gen_btn.count() == 0:
                    yield _ndjson('error', message='Could not find Generate button')
                    return
                await gen_btn.click()
                yield _ndjson('progress', message='Generating image...')

                # ── 10. Wait for new image, then download it ──
                gen_start = time.time()
                timeout = 360
                last_progress = gen_start

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
                                    if mins > 0 or secs_val > 0:
                                        yield _ndjson('eta_update', seconds=mins * 60 + secs_val)
                                    break
                        except Exception:
                            pass

                    # Look for new images not in the original set
                    new_img = await page.evaluate('''
                        (existingSet) => {
                            const imgs = document.querySelectorAll('img');
                            for (const img of imgs) {
                                const src = img.src;
                                if (src && src.startsWith('http') && !existingSet.includes(src)) {
                                    if (img.naturalWidth > 200 || img.width > 200) {
                                        const rect = img.getBoundingClientRect();
                                        return { src, x: rect.x, y: rect.y, w: rect.width, h: rect.height };
                                    }
                                }
                            }
                            return null;
                        }
                    ''', list(existing_srcs))

                    if new_img:
                        yield _ndjson('progress', message='Image generated! Downloading...')

                        # Scroll image into view and hover to reveal download button
                        try:
                            img_locator = page.locator(f'img[src="{new_img["src"][:200]}"]').first
                            if await img_locator.count() > 0:
                                await img_locator.scroll_into_view_if_needed()
                                await page.wait_for_timeout(500)
                                await img_locator.hover()
                                await page.wait_for_timeout(800)

                                # Click the download button (aria-label="Download")
                                dl_btn = page.locator('button[aria-label="Download"]').first
                                if await dl_btn.count() > 0:
                                    async with page.expect_download(timeout=30000) as dl_info:
                                        await dl_btn.click()
                                    download = await dl_info.value
                                    dl_path = await download.path()

                                    if dl_path:
                                        with open(dl_path, 'rb') as f:
                                            img_bytes = f.read()
                                        img_b64 = base64.b64encode(img_bytes).decode('utf-8')
                                        _last_gen_time = time.time()
                                        yield _ndjson('complete', success=True, image_base64=img_b64)
                                        return
                                    else:
                                        yield _ndjson('progress', message='Download path empty, falling back to fetch...')
                                else:
                                    yield _ndjson('progress', message='Download button not found, falling back to fetch...')
                        except Exception as e:
                            yield _ndjson('progress', message=f'Download via button failed: {e}, falling back...')

                        # Fallback: fetch the image URL directly
                        try:
                            if new_img['src'].startswith('data:'):
                                img_b64 = new_img['src'].split(',')[1]
                            else:
                                resp = await context.request.get(new_img['src'])
                                buf = await resp.body()
                                img_b64 = base64.b64encode(buf).decode('utf-8')

                            _last_gen_time = time.time()
                            yield _ndjson('complete', success=True, image_base64=img_b64)
                            return
                        except Exception as e:
                            yield _ndjson('error', message=f'Failed to download image: {e}')
                            return

                    await page.wait_for_timeout(3000)

                yield _ndjson('error', message=f'Generation timed out after {timeout}s')

            except Exception as e:
                yield _ndjson('error', message=str(e))
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
