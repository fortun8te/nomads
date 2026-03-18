"""
Browser Service — Playwright CDP connection to local Chromium.
Manages page lifecycle, element interaction, screenshots.
"""

import asyncio
import base64
import logging
from typing import Optional

from playwright.async_api import async_playwright, Browser, Page, Playwright

from .element_indexer import INDEX_ELEMENTS_JS, REMOVE_BADGES_JS, EXTRACT_TEXT_JS

logger = logging.getLogger(__name__)

CDP_URL = "http://127.0.0.1:9222"
MAX_CONNECT_RETRIES = 10
RETRY_DELAY = 2.0


class BrowserService:
    """Singleton browser service connected to local Chromium via CDP."""

    _instance: Optional["BrowserService"] = None
    _pw: Optional[Playwright] = None
    _browser: Optional[Browser] = None
    _page: Optional[Page] = None
    _elements: list[dict] = []

    @classmethod
    async def get_instance(cls) -> "BrowserService":
        if cls._instance is None:
            cls._instance = cls()
            await cls._instance._connect()
        return cls._instance

    async def _connect(self):
        """Connect to Chromium via CDP with retry."""
        self._pw = await async_playwright().start()
        for attempt in range(MAX_CONNECT_RETRIES):
            try:
                self._browser = await self._pw.chromium.connect_over_cdp(CDP_URL)
                logger.info(f"Connected to Chrome CDP on attempt {attempt + 1}")
                # Get the default page (about:blank)
                contexts = self._browser.contexts
                if contexts and contexts[0].pages:
                    self._page = contexts[0].pages[-1]
                else:
                    ctx = await self._browser.new_context(
                        viewport={"width": 1280, "height": 900}
                    )
                    self._page = await ctx.new_page()
                return
            except Exception as e:
                logger.warning(f"CDP connect attempt {attempt + 1} failed: {e}")
                await asyncio.sleep(RETRY_DELAY)
        raise RuntimeError(f"Failed to connect to Chrome CDP at {CDP_URL}")

    def _get_page(self) -> Page:
        """Get the active page, switching to most recent tab if needed."""
        if self._browser and self._browser.contexts:
            pages = self._browser.contexts[0].pages
            if pages:
                self._page = pages[-1]
        if not self._page:
            raise RuntimeError("No active browser page")
        return self._page

    async def navigate(self, url: str) -> dict:
        """Navigate to URL, return page info."""
        page = self._get_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(800)  # settle time
        except Exception as e:
            logger.warning(f"Navigation error: {e}")

        return await self._page_info()

    async def view(self) -> dict:
        """Inject element IDs, return interactive elements + page text."""
        page = self._get_page()

        # Index elements
        try:
            self._elements = await page.evaluate(INDEX_ELEMENTS_JS)
        except Exception as e:
            logger.warning(f"Element indexing failed: {e}")
            self._elements = []

        # Extract page text
        try:
            page_text = await page.evaluate(EXTRACT_TEXT_JS)
        except Exception:
            page_text = ""

        info = await self._page_info()
        info["elements"] = self._elements
        info["pageText"] = page_text
        return info

    async def click(self, index: Optional[int] = None, x: Optional[int] = None, y: Optional[int] = None) -> dict:
        """Click element by index or coordinates."""
        page = self._get_page()

        # Remove badges before clicking (they can intercept clicks)
        try:
            await page.evaluate(REMOVE_BADGES_JS)
        except:
            pass

        if index is not None:
            selector = f'[data-nomad-id="nomad-{index}"]'
            try:
                el = page.locator(selector)
                await el.click(timeout=3000)
            except Exception as e:
                # Fallback: use stored rect center coords
                if index < len(self._elements):
                    rect = self._elements[index]["rect"]
                    cx = rect["x"] + rect["w"] // 2
                    cy = rect["y"] + rect["h"] // 2
                    await page.mouse.click(cx, cy)
                else:
                    return {"error": f"Element {index} not found: {e}"}
        elif x is not None and y is not None:
            await page.mouse.click(x, y)
        else:
            return {"error": "Must provide index or x,y coordinates"}

        await page.wait_for_timeout(200)
        return await self._page_info()

    async def input_text(self, index: int, text: str, press_enter: bool = False) -> dict:
        """Type text into element by index."""
        page = self._get_page()

        # Remove badges
        try:
            await page.evaluate(REMOVE_BADGES_JS)
        except:
            pass

        selector = f'[data-nomad-id="nomad-{index}"]'
        try:
            el = page.locator(selector)
            await el.click(timeout=3000)
            await el.fill(text)
            if press_enter:
                await page.keyboard.press("Enter")
                await page.wait_for_timeout(500)
        except Exception as e:
            # Fallback: click rect center + keyboard.type
            if index < len(self._elements):
                rect = self._elements[index]["rect"]
                cx = rect["x"] + rect["w"] // 2
                cy = rect["y"] + rect["h"] // 2
                await page.mouse.click(cx, cy)
                await page.wait_for_timeout(100)
                # Triple-click to select all, then type replacement
                await page.mouse.click(cx, cy, click_count=3)
                await page.keyboard.type(text, delay=20)
                if press_enter:
                    await page.keyboard.press("Enter")
                    await page.wait_for_timeout(500)
            else:
                return {"error": f"Element {index} not found: {e}"}

        await page.wait_for_timeout(200)
        return await self._page_info()

    async def scroll(self, direction: str = "down", amount: int = 500) -> dict:
        """Scroll page up or down."""
        page = self._get_page()

        # Remove badges before scroll
        try:
            await page.evaluate(REMOVE_BADGES_JS)
        except:
            pass

        delta = amount if direction == "down" else -amount
        await page.mouse.wheel(0, delta)
        await page.wait_for_timeout(200)
        return await self._page_info()

    async def press_key(self, key: str) -> dict:
        """Press a keyboard key."""
        page = self._get_page()
        await page.keyboard.press(key)
        await page.wait_for_timeout(100)
        return await self._page_info()

    async def back(self) -> dict:
        """Go back."""
        page = self._get_page()
        await page.go_back(wait_until="domcontentloaded", timeout=10000)
        await page.wait_for_timeout(500)
        return await self._page_info()

    async def forward(self) -> dict:
        """Go forward."""
        page = self._get_page()
        await page.go_forward(wait_until="domcontentloaded", timeout=10000)
        await page.wait_for_timeout(500)
        return await self._page_info()

    async def screenshot(self, quality: int = 60) -> dict:
        """Take a screenshot, return base64 JPEG."""
        page = self._get_page()
        img_bytes = await page.screenshot(type="jpeg", quality=quality)
        b64 = base64.b64encode(img_bytes).decode("utf-8")
        info = await self._page_info()
        info["image_base64"] = b64
        return info

    async def console_exec(self, js: str) -> dict:
        """Execute JavaScript on page."""
        page = self._get_page()
        try:
            result = await page.evaluate(js)
            return {"error": None, "result": str(result)}
        except Exception as e:
            return {"error": str(e), "result": None}

    async def _page_info(self) -> dict:
        """Get current page info."""
        page = self._get_page()
        try:
            title = await page.title()
        except:
            title = ""
        url = page.url
        try:
            scroll_y = await page.evaluate("window.scrollY")
            page_height = await page.evaluate("document.body.scrollHeight")
        except:
            scroll_y = 0
            page_height = 0

        return {
            "error": None,
            "title": title,
            "url": url,
            "scroll_y": scroll_y,
            "page_height": page_height,
        }
