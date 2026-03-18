"""
Sandbox API — FastAPI endpoints for browser control + DOM element indexing.
Runs inside the Docker sandbox container on port 8080.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from .browser_service import BrowserService

app = FastAPI(title="NOMAD Sandbox", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request models ──

class NavigateRequest(BaseModel):
    url: str

class ClickRequest(BaseModel):
    index: Optional[int] = None
    x: Optional[int] = None
    y: Optional[int] = None

class InputRequest(BaseModel):
    index: int
    text: str
    press_enter: bool = False

class ScrollRequest(BaseModel):
    direction: str = "down"  # "up" or "down"
    amount: int = 500

class KeyRequest(BaseModel):
    key: str  # e.g. "Enter", "Escape", "Tab", "ArrowDown"

class ConsoleRequest(BaseModel):
    js: str

class ScreenshotRequest(BaseModel):
    quality: int = 60


# ── Endpoints ──

@app.get("/health")
async def health():
    """Readiness check."""
    try:
        browser = await BrowserService.get_instance()
        info = await browser._page_info()
        return {"status": "ok", "page": info.get("url", "unknown")}
    except Exception as e:
        return {"status": "starting", "error": str(e)}


@app.post("/browser/navigate")
async def navigate(req: NavigateRequest):
    """Navigate to URL."""
    browser = await BrowserService.get_instance()
    return await browser.navigate(req.url)


@app.post("/browser/view")
async def view():
    """Inject element IDs, return interactive elements + page text."""
    browser = await BrowserService.get_instance()
    return await browser.view()


@app.post("/browser/click")
async def click(req: ClickRequest):
    """Click element by index or coordinates."""
    browser = await BrowserService.get_instance()
    return await browser.click(index=req.index, x=req.x, y=req.y)


@app.post("/browser/input")
async def input_text(req: InputRequest):
    """Type text into element by index."""
    browser = await BrowserService.get_instance()
    return await browser.input_text(req.index, req.text, req.press_enter)


@app.post("/browser/scroll")
async def scroll(req: ScrollRequest):
    """Scroll page."""
    browser = await BrowserService.get_instance()
    return await browser.scroll(req.direction, req.amount)


@app.post("/browser/press_key")
async def press_key(req: KeyRequest):
    """Press keyboard key."""
    browser = await BrowserService.get_instance()
    return await browser.press_key(req.key)


@app.post("/browser/back")
async def back():
    """Go back."""
    browser = await BrowserService.get_instance()
    return await browser.back()


@app.post("/browser/forward")
async def forward():
    """Go forward."""
    browser = await BrowserService.get_instance()
    return await browser.forward()


@app.post("/browser/screenshot")
async def screenshot(req: ScreenshotRequest = ScreenshotRequest()):
    """Take screenshot."""
    browser = await BrowserService.get_instance()
    return await browser.screenshot(req.quality)


@app.post("/browser/console_exec")
async def console_exec(req: ConsoleRequest):
    """Execute JavaScript."""
    browser = await BrowserService.get_instance()
    return await browser.console_exec(req.js)
