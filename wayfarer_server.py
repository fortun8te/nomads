# Wayfarer HTTP Server — FastAPI wrapper around wayfarer.research()
# Run: uvicorn wayfarer_server:app --host 0.0.0.0 --port 8889

import asyncio
import base64
import os
import traceback
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from wayfarer import research

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://100.74.135.83:11435")

# ── Playwright browser singleton + persistent context ──
_browser = None
_playwright = None
_context = None  # Persistent context for page reuse


async def _get_browser():
    """Lazy-init Playwright browser on first request."""
    global _browser, _playwright, _context
    if _browser is None:
        try:
            from playwright.async_api import async_playwright
            _playwright = await async_playwright().start()
            _browser = await _playwright.chromium.launch(headless=True)
            _context = await _browser.new_context(
                viewport={"width": 1280, "height": 720},
                ignore_https_errors=True,
                java_script_enabled=True,
            )
        except Exception as e:
            print(f"[Wayfarer] Playwright init failed: {e}")
            raise
    return _browser


async def _get_context(width: int = 1280, height: int = 720):
    """Get persistent browser context. Creates new one if viewport differs."""
    global _context
    await _get_browser()
    # Reuse existing context (viewport set per-page now)
    return _context


# ── Active page sessions for agentic use ──
_active_pages: dict[str, any] = {}  # session_id -> page
_page_counter = 0


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm browser on startup so first screenshot is fast
    try:
        await _get_browser()
        print("[Wayfarer] Playwright browser pre-warmed")
    except Exception as e:
        print(f"[Wayfarer] Browser pre-warm failed (will retry on first request): {e}")
    yield
    # Cleanup on shutdown
    global _browser, _playwright, _context
    # Close all active pages
    for sid, page in _active_pages.items():
        try:
            await page.close()
        except Exception:
            pass
    _active_pages.clear()
    if _context:
        await _context.close()
    if _browser:
        await _browser.close()
    if _playwright:
        await _playwright.stop()


app = FastAPI(title="Wayfarer", description="Async web research API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResearchRequest(BaseModel):
    query: str
    num_results: int = 10
    concurrency: int = 20
    extract_mode: str = "article"


class BatchQuery(BaseModel):
    query: str
    num_results: int = 10


class BatchRequest(BaseModel):
    queries: list[BatchQuery]
    concurrency: int = 20
    extract_mode: str = "article"


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/research")
async def do_research(req: ResearchRequest):
    result = await research(
        query=req.query,
        num_results=req.num_results,
        concurrency=req.concurrency,
        extract_mode=req.extract_mode,
    )
    return result


@app.post("/batch")
async def do_batch(req: BatchRequest):
    tasks = [
        research(
            query=q.query,
            num_results=q.num_results,
            concurrency=req.concurrency,
            extract_mode=req.extract_mode,
        )
        for q in req.queries
    ]
    results = await asyncio.gather(*tasks)
    return {"results": list(results)}


# ── Screenshot endpoints ──


class ScreenshotRequest(BaseModel):
    url: str
    viewport_width: int = 1280
    viewport_height: int = 720
    quality: int = 60  # JPEG quality (0-100)


class ScreenshotBatchRequest(BaseModel):
    urls: list[str]
    viewport_width: int = 1280
    viewport_height: int = 720
    quality: int = 60
    concurrency: int = 3


async def _take_screenshot(url: str, width: int, height: int, quality: int) -> dict:
    """Capture a single URL screenshot. Fast: reuses context, domcontentloaded + brief settle."""
    try:
        ctx = await _get_context(width, height)
        page = await ctx.new_page()
        try:
            await page.set_viewport_size({"width": width, "height": height})

            # Fast: domcontentloaded is enough for most pages (skip networkidle which
            # waits for ALL requests including ads/trackers/analytics = 10-30s wasted)
            try:
                await page.goto(url, wait_until="domcontentloaded", timeout=10000)
            except Exception:
                pass  # Take screenshot of whatever loaded

            # Brief settle for JS-rendered content
            await page.wait_for_timeout(800)

            # Dismiss popups/overlays (non-blocking, fast)
            await _dismiss_popups(page)

            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            return {
                "url": url,
                "image_base64": img_b64,
                "width": width,
                "height": height,
                "error": None,
            }
        finally:
            await page.close()
    except Exception as e:
        return {
            "url": url,
            "image_base64": "",
            "width": 0,
            "height": 0,
            "error": str(e),
        }


async def _dismiss_popups(page) -> None:
    """Aggressively dismiss all popups, modals, overlays, cookie banners."""
    try:
        await page.evaluate("""
            () => {
                // 1. Remove modal/popup/overlay elements by class or role
                const selectors = [
                    '[class*="modal"]', '[class*="Modal"]',
                    '[class*="popup"]', '[class*="Popup"]', '[class*="pop-up"]',
                    '[class*="overlay"]', '[class*="Overlay"]',
                    '[class*="cookie"]', '[class*="Cookie"]',
                    '[class*="banner"]',
                    '[class*="newsletter"]', '[class*="Newsletter"]',
                    '[class*="subscribe"]', '[class*="Subscribe"]',
                    '[class*="discount"]', '[class*="Discount"]',
                    '[class*="promo-"]', '[class*="announcement"]',
                    '[role="dialog"]', '[role="alertdialog"]',
                    '[data-modal]', '[data-popup]',
                    '.klaviyo-form', '.privy-popup',
                    '#shopify-section-popup',
                    '.needsclick',
                ];
                for (const sel of selectors) {
                    document.querySelectorAll(sel).forEach(el => {
                        const style = window.getComputedStyle(el);
                        if (style.position === 'fixed' || style.position === 'absolute') {
                            el.remove();
                        }
                    });
                }

                // 2. Click any visible close/dismiss buttons
                const closeSelectors = [
                    'button[aria-label*="close" i]', 'button[aria-label*="dismiss" i]',
                    '[class*="close"]', '[class*="Close"]',
                    'button[class*="dismiss"]',
                    '.modal-close', '.popup-close',
                ];
                for (const sel of closeSelectors) {
                    document.querySelectorAll(sel).forEach(btn => {
                        try { btn.click(); } catch(e) {}
                    });
                }

                // 3. Remove any fixed/absolute elements covering >50% of viewport
                document.querySelectorAll('*').forEach(el => {
                    const style = window.getComputedStyle(el);
                    if ((style.position === 'fixed' || style.position === 'absolute') &&
                        style.zIndex && parseInt(style.zIndex) > 100) {
                        const rect = el.getBoundingClientRect();
                        const viewW = window.innerWidth;
                        const viewH = window.innerHeight;
                        const coverage = (rect.width * rect.height) / (viewW * viewH);
                        if (coverage > 0.3) {
                            el.remove();
                        }
                    }
                });

                // 4. Reset body overflow (some popups disable scrolling)
                document.body.style.overflow = 'auto';
                document.documentElement.style.overflow = 'auto';
            }
        """)
        await page.wait_for_timeout(100)
    except Exception:
        pass


@app.post("/screenshot")
async def take_screenshot(req: ScreenshotRequest):
    return await _take_screenshot(req.url, req.viewport_width, req.viewport_height, req.quality)


@app.post("/screenshot/batch")
async def take_screenshots(req: ScreenshotBatchRequest):
    sem = asyncio.Semaphore(req.concurrency)

    async def bounded(url: str):
        async with sem:
            return await _take_screenshot(url, req.viewport_width, req.viewport_height, req.quality)

    results = await asyncio.gather(*[bounded(u) for u in req.urls])
    return {"screenshots": list(results)}


# ══════════════════════════════════════════════════════════════
# ── Agentic page session endpoints ──
# Keep a page alive across multiple actions (navigate, scroll,
# click, evaluate JS, take screenshot). This is what makes
# Wayfarer Plus "smart" — the model can drive the browser.
# ══════════════════════════════════════════════════════════════


class SessionOpenRequest(BaseModel):
    url: str
    viewport_width: int = 1280
    viewport_height: int = 900


class SessionActionRequest(BaseModel):
    session_id: str
    action: str  # "screenshot" | "scroll" | "click" | "evaluate" | "extract_text" | "find" | "hover" | "back" | "forward" | "reload" | "type"
    selector: str = ""  # CSS selector for click/find
    js: str = ""  # JavaScript for evaluate, URL for navigate, text for type
    scroll_y: int = 0  # Pixels to scroll (positive=down)
    click_x: int = -1  # Viewport X coordinate for click (-1 = use selector)
    click_y: int = -1  # Viewport Y coordinate for click (-1 = use selector)
    quality: int = 60


@app.post("/session/open")
async def session_open(req: SessionOpenRequest):
    """Open a persistent browser page. Returns session_id for subsequent actions."""
    global _page_counter
    try:
        ctx = await _get_context()
        page = await ctx.new_page()
        await page.set_viewport_size({"width": req.viewport_width, "height": req.viewport_height})

        try:
            await page.goto(req.url, wait_until="domcontentloaded", timeout=10000)
        except Exception:
            pass

        await page.wait_for_timeout(600)
        await _dismiss_popups(page)

        _page_counter += 1
        sid = f"s{_page_counter}"
        _active_pages[sid] = page

        # Take initial screenshot
        screenshot_bytes = await page.screenshot(type="jpeg", quality=60)
        img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

        title = await page.title()
        current_url = page.url

        return {
            "session_id": sid,
            "url": req.url,
            "image_base64": img_b64,
            "width": req.viewport_width,
            "height": req.viewport_height,
            "title": title,
            "current_url": current_url,
            "error": None,
        }
    except Exception as e:
        return {"session_id": "", "url": req.url, "image_base64": "", "width": 0, "height": 0, "title": "", "error": str(e)}


@app.post("/session/action")
async def session_action(req: SessionActionRequest):
    """Perform an action on an active session page."""
    page = _active_pages.get(req.session_id)
    if not page:
        return {"error": f"No active session: {req.session_id}", "result": None, "image_base64": ""}

    try:
        result = None

        if req.action == "screenshot":
            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            scroll_pos = await page.evaluate("window.scrollY")
            page_height = await page.evaluate("document.body.scrollHeight")
            return {"error": None, "result": "screenshot taken", "image_base64": img_b64, "title": title, "current_url": current_url, "scroll_y": scroll_pos, "page_height": page_height}

        elif req.action == "scroll":
            await page.evaluate(f"window.scrollBy(0, {req.scroll_y})")
            await page.wait_for_timeout(100)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            scroll_pos = await page.evaluate("window.scrollY")
            current_url = page.url
            return {"error": None, "result": f"scrolled to y={scroll_pos}", "image_base64": img_b64, "current_url": current_url}

        elif req.action == "click":
            # Support coordinate-based clicking (from UI click on screenshot)
            if req.click_x >= 0 and req.click_y >= 0:
                try:
                    await page.mouse.click(req.click_x, req.click_y)
                except Exception as e:
                    return {"error": f"click at ({req.click_x},{req.click_y}) failed: {e}", "result": None, "image_base64": ""}
                await page.wait_for_timeout(80)
                screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
                img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
                title = await page.title()
                return {"error": None, "result": f"clicked at ({req.click_x},{req.click_y})", "image_base64": img_b64, "title": title}
            elif not req.selector:
                return {"error": "selector or coordinates required for click", "result": None, "image_base64": ""}
            try:
                await page.click(req.selector, timeout=3000)
            except Exception as e:
                return {"error": f"click failed: {e}", "result": None, "image_base64": ""}
            await page.wait_for_timeout(200)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            return {"error": None, "result": f"clicked {req.selector}", "image_base64": img_b64, "title": title}

        elif req.action == "hover":
            if req.click_x >= 0 and req.click_y >= 0:
                await page.mouse.move(req.click_x, req.click_y)
                await page.wait_for_timeout(200)
                screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
                img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
                return {"error": None, "result": f"hovered at ({req.click_x},{req.click_y})", "image_base64": img_b64}
            return {"error": "coordinates required for hover", "result": None, "image_base64": ""}

        elif req.action == "evaluate":
            if not req.js:
                return {"error": "js required for evaluate", "result": None, "image_base64": ""}
            result = await page.evaluate(req.js)
            return {"error": None, "result": result, "image_base64": ""}

        elif req.action == "extract_text":
            text = await page.evaluate("""
                () => {
                    const h1 = document.querySelector('h1')?.innerText || '';
                    const title = document.title || '';
                    const meta = document.querySelector('meta[name="description"]')?.content || '';
                    const body = document.body.innerText.slice(0, 8000);
                    return { title, h1, meta, body };
                }
            """)
            return {"error": None, "result": text, "image_base64": ""}

        elif req.action == "find":
            # Find elements matching selector, return text + bounding boxes
            if not req.selector:
                return {"error": "selector required for find", "result": None, "image_base64": ""}
            elements = await page.evaluate(f"""
                () => {{
                    const els = document.querySelectorAll({repr(req.selector)});
                    return Array.from(els).slice(0, 20).map(el => {{
                        const rect = el.getBoundingClientRect();
                        return {{
                            tag: el.tagName.toLowerCase(),
                            text: (el.innerText || el.textContent || '').trim().slice(0, 200),
                            href: el.href || '',
                            rect: {{ x: rect.x, y: rect.y, w: rect.width, h: rect.height }},
                        }};
                    }});
                }}
            """)
            return {"error": None, "result": elements, "image_base64": ""}

        elif req.action == "navigate":
            if not req.js:  # reuse js field for URL
                return {"error": "js field should contain URL for navigate", "result": None, "image_base64": ""}
            try:
                await page.goto(req.js, wait_until="domcontentloaded", timeout=10000)
            except Exception:
                pass
            await page.wait_for_timeout(600)
            await _dismiss_popups(page)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            return {"error": None, "result": f"navigated to {req.js}", "image_base64": img_b64, "title": title, "current_url": current_url}

        elif req.action == "back":
            try:
                await page.go_back(wait_until="domcontentloaded", timeout=8000)
            except Exception:
                pass
            await page.wait_for_timeout(400)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            return {"error": None, "result": "went back", "image_base64": img_b64, "title": title, "current_url": current_url}

        elif req.action == "forward":
            try:
                await page.go_forward(wait_until="domcontentloaded", timeout=8000)
            except Exception:
                pass
            await page.wait_for_timeout(400)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            return {"error": None, "result": "went forward", "image_base64": img_b64, "title": title, "current_url": current_url}

        elif req.action == "reload":
            try:
                await page.reload(wait_until="domcontentloaded", timeout=10000)
            except Exception:
                pass
            await page.wait_for_timeout(600)
            await _dismiss_popups(page)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            return {"error": None, "result": "reloaded", "image_base64": img_b64, "title": title, "current_url": current_url}

        elif req.action == "type":
            if not req.js:
                return {"error": "js field should contain text to type", "result": None, "image_base64": ""}
            await page.keyboard.type(req.js, delay=30)
            await page.wait_for_timeout(200)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            return {"error": None, "result": f"typed '{req.js}'", "image_base64": img_b64, "title": title, "current_url": current_url}

        elif req.action == "keypress":
            # Send special keys: Enter, Tab, Escape, Backspace, etc.
            key = req.js or "Enter"
            await page.keyboard.press(key)
            await page.wait_for_timeout(300)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            return {"error": None, "result": f"pressed {key}", "image_base64": img_b64, "title": title, "current_url": current_url}

        else:
            return {"error": f"Unknown action: {req.action}", "result": None, "image_base64": ""}

    except Exception as e:
        return {"error": str(e), "result": None, "image_base64": ""}


@app.post("/session/close")
async def session_close(session_id: str = ""):
    """Close an active session page."""
    page = _active_pages.pop(session_id, None)
    if page:
        try:
            await page.close()
        except Exception:
            pass
        return {"closed": True}
    return {"closed": False, "error": "No such session"}


# ── Smart screenshot — agentic popup dismissal via JS execution ──


class SmartScreenshotRequest(BaseModel):
    url: str
    viewport_width: int = 1280
    viewport_height: int = 1080
    quality: int = 70
    dismiss_js: str = ""


@app.post("/screenshot/smart")
async def smart_screenshot(req: SmartScreenshotRequest):
    """Take screenshot with optional JS execution before capture."""
    try:
        ctx = await _get_context()
        page = await ctx.new_page()
        try:
            await page.set_viewport_size({"width": req.viewport_width, "height": req.viewport_height})
            try:
                await page.goto(req.url, wait_until="domcontentloaded", timeout=10000)
            except Exception:
                pass

            await page.wait_for_timeout(800)
            await _dismiss_popups(page)

            if req.dismiss_js:
                try:
                    await page.evaluate(req.dismiss_js)
                    await page.wait_for_timeout(500)
                except Exception as e:
                    print(f"[Smart Screenshot] Custom JS failed: {e}")

            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            return {
                "url": req.url,
                "image_base64": img_b64,
                "width": req.viewport_width,
                "height": req.viewport_height,
                "error": None,
            }
        finally:
            await page.close()
    except Exception as e:
        return {"url": req.url, "image_base64": "", "width": 0, "height": 0, "error": str(e)}


# ── Scrape + screenshot combo ──


class ScrapeAndScreenshotRequest(BaseModel):
    url: str
    viewport_width: int = 1280
    viewport_height: int = 1080
    quality: int = 70


@app.post("/analyze-page")
async def analyze_page(req: ScrapeAndScreenshotRequest):
    """Combined text scraping + screenshot in a single Playwright session."""
    try:
        ctx = await _get_context()
        page = await ctx.new_page()
        try:
            await page.set_viewport_size({"width": req.viewport_width, "height": req.viewport_height})
            try:
                await page.goto(req.url, wait_until="domcontentloaded", timeout=10000)
            except Exception:
                pass

            await page.wait_for_timeout(800)

            page_text = await page.evaluate("""
                () => {
                    const getTextContent = (selector) => {
                        const el = document.querySelector(selector);
                        return el ? el.innerText.trim() : '';
                    };
                    const sections = {};
                    sections.title = document.title;
                    sections.h1 = getTextContent('h1');
                    sections.price = getTextContent('[class*="price"], .price, [data-price]');
                    sections.description = getTextContent(
                        '[class*="description"], .product-description, [data-product-description], .product__description'
                    );
                    sections.ingredients = getTextContent(
                        '[class*="ingredient"], .ingredients, [data-ingredients]'
                    );
                    sections.fullText = document.body.innerText.slice(0, 15000);
                    const metaDesc = document.querySelector('meta[name="description"]');
                    if (metaDesc) sections.metaDescription = metaDesc.getAttribute('content');
                    const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
                    sections.structuredData = [];
                    jsonLd.forEach(script => {
                        try { sections.structuredData.push(JSON.parse(script.textContent)); } catch(e) {}
                    });
                    return sections;
                }
            """)

            await _dismiss_popups(page)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=req.quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")

            return {
                "url": req.url,
                "image_base64": img_b64,
                "width": req.viewport_width,
                "height": req.viewport_height,
                "page_text": page_text,
                "error": None,
            }
        finally:
            await page.close()
    except Exception as e:
        return {"url": req.url, "image_base64": "", "width": 0, "height": 0, "page_text": {}, "error": str(e)}


class CrawlRequest(BaseModel):
    url: str
    link_pattern: str = ""


@app.post("/crawl")
async def crawl_links(req: CrawlRequest):
    """Navigate to a page, scroll to load dynamic content, extract all links."""
    import re

    try:
        ctx = await _get_context()
        page = await ctx.new_page()
        try:
            await page.set_viewport_size({"width": 1280, "height": 4000})
            try:
                await page.goto(req.url, wait_until="domcontentloaded", timeout=10000)
            except Exception:
                pass

            await page.wait_for_timeout(800)

            # Scroll down to trigger lazy-loaded content
            for _ in range(5):
                await page.evaluate("window.scrollBy(0, window.innerHeight)")
                await page.wait_for_timeout(400)

            try:
                await page.evaluate("""
                    document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="overlay"]')
                        .forEach(el => el.remove());
                """)
            except Exception:
                pass

            links = await page.evaluate("""
                () => {
                    const results = [];
                    document.querySelectorAll('a[href]').forEach(el => {
                        results.push({ href: el.href, text: (el.textContent || '').trim().slice(0, 200) });
                    });
                    document.querySelectorAll('[data-href], [data-url]').forEach(el => {
                        const href = el.getAttribute('data-href') || el.getAttribute('data-url');
                        if (href) {
                            const fullHref = href.startsWith('http') ? href : window.location.origin + href;
                            results.push({ href: fullHref, text: (el.textContent || '').trim().slice(0, 200) });
                        }
                    });
                    document.querySelectorAll('[class*="product"] a, [class*="card"] a, [data-product-id] a').forEach(el => {
                        if (el.href) results.push({ href: el.href, text: (el.textContent || '').trim().slice(0, 200) });
                    });
                    return results;
                }
            """)

            if req.link_pattern:
                pat = re.compile(req.link_pattern, re.IGNORECASE)
                links = [l for l in links if pat.search(l["href"])]

            seen = set()
            unique = []
            for l in links:
                if l["href"] not in seen:
                    seen.add(l["href"])
                    unique.append(l)

            return {"url": req.url, "links": unique, "total": len(unique), "error": None}
        finally:
            await page.close()
    except Exception as e:
        return {"url": req.url, "links": [], "total": 0, "error": str(e)}


# ── Batch crawl ──


class BatchCrawlRequest(BaseModel):
    urls: list[str]
    concurrency: int = 10
    extract_mode: str = "article"


@app.post("/crawl/batch")
async def batch_crawl(req: BatchCrawlRequest):
    """Crawl multiple URLs simultaneously with configurable concurrency."""
    sem = asyncio.Semaphore(req.concurrency)

    async def _fetch_one(url: str) -> dict:
        async with sem:
            try:
                from pvlwebtools import web_fetch, FetchConfig
                page = await web_fetch(
                    url,
                    extract_mode=req.extract_mode,
                    rate_limit=False,
                    config=FetchConfig(request_timeout=15.0),
                )
                content = page.content if page else ""
                return {"url": url, "content": content, "content_length": len(content), "error": None}
            except Exception as e:
                return {"url": url, "content": "", "content_length": 0, "error": str(e)}

    results = await asyncio.gather(*[_fetch_one(u) for u in req.urls])
    success = sum(1 for r in results if not r["error"])
    return {"results": list(results), "total": len(req.urls), "success": success}


# ── Ollama proxy (bypasses browser CORS) ──
@app.api_route("/ollama/{path:path}", methods=["GET", "POST", "DELETE"])
async def ollama_proxy(path: str, request: Request):
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")}
    url = f"{OLLAMA_HOST}/{path}"

    async def stream_response():
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream(request.method, url, content=body, headers=headers) as resp:
                async for chunk in resp.aiter_bytes():
                    yield chunk

    return StreamingResponse(stream_response(), media_type="application/x-ndjson")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8889)
