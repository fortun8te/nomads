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

# ── Playwright browser singleton ──
_browser = None
_playwright = None


async def _get_browser():
    """Lazy-init Playwright browser on first screenshot request."""
    global _browser, _playwright
    if _browser is None:
        try:
            from playwright.async_api import async_playwright
            _playwright = await async_playwright().start()
            _browser = await _playwright.chromium.launch(headless=True)
        except Exception as e:
            print(f"[Wayfarer] Playwright init failed: {e}")
            raise
    return _browser


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield
    # Cleanup on shutdown
    global _browser, _playwright
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
    """Capture a single URL screenshot. Returns dict with base64 image or error."""
    try:
        browser = await _get_browser()
        page = await browser.new_page(viewport={"width": width, "height": height})
        try:
            # Try networkidle first (30s), fall back to domcontentloaded if slow
            try:
                await page.goto(url, wait_until="networkidle", timeout=30000)
            except Exception:
                # Page is slow — retry with just domcontentloaded + extra wait
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                    await page.wait_for_timeout(3000)  # Let JS render
                except Exception:
                    pass  # Take screenshot of whatever loaded

            # Dismiss popups, modals, overlays, cookie banners before screenshot
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
                    '.klaviyo-form', '.privy-popup',       // Common Shopify popups
                    '#shopify-section-popup',
                    '.needsclick',                          // Email signup popups
                ];
                for (const sel of selectors) {
                    document.querySelectorAll(sel).forEach(el => {
                        // Only remove if it looks like an overlay (fixed/absolute positioned)
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
        # Brief wait for DOM to settle
        await page.wait_for_timeout(500)
    except Exception:
        pass  # Don't fail screenshot if popup dismissal fails


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


# ── Crawl endpoint — extract all links from a page ──


# ── Smart screenshot — agentic popup dismissal via JS execution ──


class SmartScreenshotRequest(BaseModel):
    url: str
    viewport_width: int = 1280
    viewport_height: int = 1080
    quality: int = 70
    dismiss_js: str = ""  # JavaScript to execute before screenshot (e.g., popup dismissal)


@app.post("/screenshot/smart")
async def smart_screenshot(req: SmartScreenshotRequest):
    """Take screenshot with optional JS execution before capture.
    Used by the agentic vision loop: vision detects popup → GLM generates JS → execute here.
    """
    try:
        browser = await _get_browser()
        page = await browser.new_page(viewport={"width": req.viewport_width, "height": req.viewport_height})
        try:
            try:
                await page.goto(req.url, wait_until="networkidle", timeout=30000)
            except Exception:
                try:
                    await page.goto(req.url, wait_until="domcontentloaded", timeout=15000)
                    await page.wait_for_timeout(3000)
                except Exception:
                    pass

            # Always try generic popup dismissal first
            await _dismiss_popups(page)

            # Execute custom dismiss JS if provided (from agentic vision loop)
            if req.dismiss_js:
                try:
                    await page.evaluate(req.dismiss_js)
                    await page.wait_for_timeout(1000)
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
        return {
            "url": req.url,
            "image_base64": "",
            "width": 0,
            "height": 0,
            "error": str(e),
        }


# ── Scrape + screenshot combo (text + visual in one call) ──


class ScrapeAndScreenshotRequest(BaseModel):
    url: str
    viewport_width: int = 1280
    viewport_height: int = 1080
    quality: int = 70


@app.post("/analyze-page")
async def analyze_page(req: ScrapeAndScreenshotRequest):
    """Combined text scraping + screenshot in a single Playwright session.
    Returns both the page text content AND the screenshot.
    """
    try:
        browser = await _get_browser()
        page = await browser.new_page(viewport={"width": req.viewport_width, "height": req.viewport_height})
        try:
            try:
                await page.goto(req.url, wait_until="networkidle", timeout=30000)
            except Exception:
                try:
                    await page.goto(req.url, wait_until="domcontentloaded", timeout=15000)
                    await page.wait_for_timeout(3000)
                except Exception:
                    pass

            # Extract page text BEFORE dismissing popups (popups may have useful text too)
            page_text = await page.evaluate("""
                () => {
                    // Get main content text, structured by sections
                    const getTextContent = (selector) => {
                        const el = document.querySelector(selector);
                        return el ? el.innerText.trim() : '';
                    };

                    const sections = {};

                    // Try common product page selectors
                    sections.title = document.title;
                    sections.h1 = getTextContent('h1');
                    sections.price = getTextContent('[class*="price"], .price, [data-price]');
                    sections.description = getTextContent(
                        '[class*="description"], .product-description, [data-product-description], .product__description'
                    );
                    sections.ingredients = getTextContent(
                        '[class*="ingredient"], .ingredients, [data-ingredients]'
                    );

                    // Get all visible text
                    sections.fullText = document.body.innerText.slice(0, 15000);

                    // Get meta tags
                    const metaDesc = document.querySelector('meta[name="description"]');
                    if (metaDesc) sections.metaDescription = metaDesc.getAttribute('content');

                    // Get JSON-LD structured data (Shopify, WooCommerce use this)
                    const jsonLd = document.querySelectorAll('script[type="application/ld+json"]');
                    sections.structuredData = [];
                    jsonLd.forEach(script => {
                        try { sections.structuredData.push(JSON.parse(script.textContent)); } catch(e) {}
                    });

                    return sections;
                }
            """)

            # Dismiss popups, then screenshot
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
        return {
            "url": req.url,
            "image_base64": "",
            "width": 0,
            "height": 0,
            "page_text": {},
            "error": str(e),
        }


class CrawlRequest(BaseModel):
    url: str
    link_pattern: str = ""  # Optional regex filter for links


@app.post("/crawl")
async def crawl_links(req: CrawlRequest):
    """Navigate to a page with Playwright, scroll to load dynamic content, extract all links."""
    import re

    try:
        browser = await _get_browser()
        page = await browser.new_page(viewport={"width": 1280, "height": 4000})
        try:
            try:
                await page.goto(req.url, wait_until="networkidle", timeout=30000)
            except Exception:
                try:
                    await page.goto(req.url, wait_until="domcontentloaded", timeout=15000)
                    await page.wait_for_timeout(3000)
                except Exception:
                    pass

            # Scroll down to trigger lazy-loaded content
            for _ in range(5):
                await page.evaluate("window.scrollBy(0, window.innerHeight)")
                await page.wait_for_timeout(800)

            # Close any modals/popups that might be blocking
            try:
                await page.evaluate("""
                    document.querySelectorAll('[class*="modal"], [class*="popup"], [class*="overlay"]')
                        .forEach(el => el.remove());
                """)
            except Exception:
                pass

            # Extract all links (including onclick handlers that navigate)
            links = await page.evaluate("""
                () => {
                    const results = [];
                    // Standard <a> tags
                    document.querySelectorAll('a[href]').forEach(el => {
                        results.push({ href: el.href, text: (el.textContent || '').trim().slice(0, 200) });
                    });
                    // Elements with data-href or onclick navigation
                    document.querySelectorAll('[data-href], [data-url]').forEach(el => {
                        const href = el.getAttribute('data-href') || el.getAttribute('data-url');
                        if (href) {
                            const fullHref = href.startsWith('http') ? href : window.location.origin + href;
                            results.push({ href: fullHref, text: (el.textContent || '').trim().slice(0, 200) });
                        }
                    });
                    // Shopify-style product cards (clickable divs wrapping product info)
                    document.querySelectorAll('[class*="product"] a, [class*="card"] a, [data-product-id] a').forEach(el => {
                        if (el.href) results.push({ href: el.href, text: (el.textContent || '').trim().slice(0, 200) });
                    });
                    return results;
                }
            """)

            # Optional regex filter
            if req.link_pattern:
                pat = re.compile(req.link_pattern, re.IGNORECASE)
                links = [l for l in links if pat.search(l["href"])]

            # Deduplicate by href
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


# ── Batch crawl — crawl multiple URLs simultaneously ──


class BatchCrawlRequest(BaseModel):
    urls: list[str]
    concurrency: int = 10
    extract_mode: str = "article"


@app.post("/crawl/batch")
async def batch_crawl(req: BatchCrawlRequest):
    """Crawl multiple URLs simultaneously with configurable concurrency.
    Returns scraped text content for each URL.
    """
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
                return {
                    "url": url,
                    "content": content,
                    "content_length": len(content),
                    "error": None,
                }
            except Exception as e:
                return {
                    "url": url,
                    "content": "",
                    "content_length": 0,
                    "error": str(e),
                }

    results = await asyncio.gather(*[_fetch_one(u) for u in req.urls])
    success = sum(1 for r in results if not r["error"])
    return {
        "results": list(results),
        "total": len(req.urls),
        "success": success,
    }


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
