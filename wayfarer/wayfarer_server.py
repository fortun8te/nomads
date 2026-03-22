# Wayfarer HTTP Server — FastAPI wrapper around wayfarer.research()
# Run: uvicorn wayfarer_server:app --host 0.0.0.0 --port 8889

import asyncio
import base64
import json
import math as _math
import os
import random as _random
import time as _time
import traceback
import uuid
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from wayfarer import research

try:
    from playwright_stealth import stealth_async
    _STEALTH_AVAILABLE = True
except ImportError:
    _STEALTH_AVAILABLE = False
    print("[Wayfarer] playwright-stealth not available — using manual stealth patches only")

try:
    from camoufox.async_api import AsyncCamoufox
    _CAMOUFOX_AVAILABLE = True
except ImportError:
    _CAMOUFOX_AVAILABLE = False

try:
    import nodriver as uc
    _NODRIVER_AVAILABLE = True
except ImportError:
    _NODRIVER_AVAILABLE = False

try:
    import pyautogui as _pyautogui
    _pyautogui.FAILSAFE = False
    _pyautogui.PAUSE = 0
    _PYAUTOGUI = True
except Exception:
    _PYAUTOGUI = False

# USE_NODRIVER=true  → Chrome via nodriver (no chromedriver, no navigator.webdriver leak)
# USE_CAMOUFOX=false → force standard Playwright/Chromium path
USE_NODRIVER = os.getenv("USE_NODRIVER", "false").lower() == "true"
USE_CAMOUFOX = os.getenv("USE_CAMOUFOX", "true").lower() == "true"

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://100.74.135.83:11440")

USER_DATA_DIR = "/tmp/wayfarer_browser_profile"
os.makedirs(USER_DATA_DIR, exist_ok=True)

# Comprehensive stealth init script — patches all common bot-detection vectors
STEALTH_SCRIPT = """
// Remove webdriver flag — prevents CDP Runtime.enable leak detection
Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

// Add chrome runtime (missing in headless Chrome)
window.chrome = { runtime: {}, loadTimes: function(){}, csi: function(){}, app: {} };

// Fix chrome.app — headless leaves this incomplete, triggering fingerprinting
if (window.chrome) {
  window.chrome.app = {
    InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
    RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
    getDetails: () => null,
    getIsInstalled: () => false,
    isInstalled: false
  };
}

// Fix permissions API (headless returns 'denied' for notifications by default)
const _origPermQuery = window.navigator.permissions.query;
window.navigator.permissions.query = (parameters) => (
  parameters.name === 'notifications'
    ? Promise.resolve({ state: Notification.permission })
    : _origPermQuery(parameters)
);

// Fix plugins (headless has none)
Object.defineProperty(navigator, 'plugins', {
  get: () => [
    { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
    { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
    { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
  ]
});

// Fix languages — headless often returns [] which is a strong signal
Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });

// Fix connection.rtt — headless returns 0, real Chrome reports ~50-200ms
if (navigator.connection) {
  Object.defineProperty(navigator.connection, 'rtt', { get: () => 150 });
}

// Mouse tracking for human-move helper
window._nomad_mouse_x = 640;
window._nomad_mouse_y = 400;

// Fix hardware concurrency
Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });

// Fix device memory
Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });

// Fix platform
Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' });
"""

# Realistic browser fingerprint shared across all context creation calls
_CONTEXT_KWARGS = dict(
    user_agent=(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) '
        'AppleWebKit/537.36 (KHTML, like Gecko) '
        'Chrome/131.0.0.0 Safari/537.36'
    ),
    viewport={'width': 1280, 'height': 800},
    locale='en-US',
    timezone_id='America/New_York',
    permissions=['geolocation'],
    color_scheme='dark',
    extra_http_headers={'Accept-Language': 'en-US,en;q=0.9'},
    ignore_https_errors=True,
    java_script_enabled=True,
)


async def _apply_stealth(page) -> None:
    """Apply playwright-stealth (if available) + manual STEALTH_SCRIPT to a page."""
    if _STEALTH_AVAILABLE:
        try:
            await stealth_async(page)
        except Exception as e:
            print(f"[Wayfarer] stealth_async failed: {e}")
    # Manual patches run unconditionally as belt-and-suspenders
    try:
        await page.add_init_script(STEALTH_SCRIPT)
    except Exception:
        pass


def _decelerate_curve(total: float, steps: int) -> list:
    """Return `steps` values that sum to `total` and decrease (simulate scroll inertia).

    Uses an exponential decay so the first chunk is the largest and each
    subsequent one shrinks — mimicking a real mouse-wheel flick slowing down.
    """
    if steps <= 1:
        return [total]
    decay = 0.6  # each step is 60% of the previous
    raw = [decay ** i for i in range(steps)]
    factor = total / sum(raw)
    return [max(1.0, r * factor) for r in raw]


async def _human_scroll(page, delta_y: float, direction: str = 'down'):
    """Scroll with realistic wheel inertia.

    Splits the total scroll distance into 3-6 wheel events with a decelerating
    distribution, each separated by a small random pause — matching how a real
    mouse wheel gradually slows down after a flick.
    """
    total = abs(delta_y)
    steps = _random.randint(3, 6)
    deltas = _decelerate_curve(total, steps)
    sign = 1 if direction == 'down' else -1
    for d in deltas:
        await page.mouse.wheel(0, sign * d)
        await asyncio.sleep(_random.uniform(0.02, 0.05))


async def _human_type(page, text: str):
    """Type text with realistic per-character timing.

    Timing model:
    - Common letters (etaoin shrdlu): 40-80ms
    - Uppercase / symbols (shift combos): +50-100ms extra
    - After punctuation (,.!?;:): 100-300ms pause (humans briefly hesitate)
    - Word boundary (space): 50-150ms between words
    - 2% chance per word of a typo: type wrong char, pause 300ms, backspace, type correct
    """
    if not text:
        return
    _COMMON = set('etaoinshrdlu ')
    _PUNCT  = set(',.!?;:')
    _SHIFT  = set('ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+{}|:"<>?')

    words = text.split(' ')
    for word_idx, word in enumerate(words):
        # 2% chance of typo on this word (only if word is non-empty)
        do_typo = len(word) > 0 and _random.random() < 0.02
        typo_pos = _random.randint(0, len(word) - 1) if do_typo and len(word) > 0 else -1

        for ci, ch in enumerate(word):
            base_ms = _random.uniform(40, 80) if ch.lower() in _COMMON else _random.uniform(60, 110)
            if ch in _SHIFT:
                base_ms += _random.uniform(50, 100)

            # Inject typo before this character
            if ci == typo_pos:
                wrong_keys = 'qwertyuiopasdfghjklzxcvbnm'
                wrong = _random.choice([k for k in wrong_keys if k != ch.lower()])
                await page.keyboard.type(wrong)
                await asyncio.sleep(_random.uniform(0.25, 0.40))  # realise mistake
                await page.keyboard.press('Backspace')
                await asyncio.sleep(_random.uniform(0.08, 0.15))  # recover

            await page.keyboard.type(ch)

            if ch in _PUNCT:
                await asyncio.sleep(_random.uniform(0.10, 0.30))
            else:
                await asyncio.sleep(base_ms / 1000)

        # Word boundary space (unless last word)
        if word_idx < len(words) - 1:
            await page.keyboard.type(' ')
            await asyncio.sleep(_random.uniform(0.05, 0.15))


async def _human_click(page, x: float, y: float, session_id: str = ""):
    """Move to (x,y), hover briefly, then click — matching how a real user
    positions the cursor before pressing the mouse button."""
    await _sync_physical_cursor(page, x, y, session_id)
    await _human_move(page, x, y)
    await asyncio.sleep(_random.uniform(0.08, 0.25))  # hover pause
    await page.mouse.down()
    await asyncio.sleep(_random.uniform(0.04, 0.09))
    await page.mouse.up()


async def _human_move(page, x: float, y: float, steps: int = 0, drag: bool = False):
    """Move mouse to (x,y) with a human-like curved path.

    Uses a bezier curve with slight random control point offset,
    ease-in-out timing, and micro-jitter on each step.

    If drag=True, dispatches mousedown at the start position before moving
    and mouseup at the end position after — enabling real human-like drags.
    """
    # Get current position (default to center if unknown)
    try:
        cur = await page.evaluate("() => ({ x: window._nomad_mouse_x ?? 640, y: window._nomad_mouse_y ?? 400 })")
        cur_x, cur_y = float(cur.get('x', 640)), float(cur.get('y', 400))
    except Exception:
        cur_x, cur_y = 640.0, 400.0

    dist = _math.hypot(x - cur_x, y - cur_y)
    if dist < 2 and not drag:
        return  # Already there

    # Auto-scale steps with distance: 8-25 steps
    if steps == 0:
        steps = max(8, min(25, int(dist / 20)))

    # Random bezier control point: perpendicular offset ±15% of distance
    perp_offset = dist * _random.uniform(-0.15, 0.15)
    mid_x = (cur_x + x) / 2 + perp_offset
    mid_y = (cur_y + y) / 2 + perp_offset

    # For drag: move to start position first, then press mousedown
    if drag:
        await page.mouse.move(cur_x, cur_y)
        await asyncio.sleep(_random.uniform(0.03, 0.07))
        await page.mouse.down()
        await asyncio.sleep(_random.uniform(0.04, 0.08))

    for i in range(1, steps + 1):
        t = i / steps
        # Ease in-out: smoothstep
        t_smooth = t * t * (3 - 2 * t)
        # Quadratic bezier
        bx = (1 - t_smooth)**2 * cur_x + 2 * (1 - t_smooth) * t_smooth * mid_x + t_smooth**2 * x
        by = (1 - t_smooth)**2 * cur_y + 2 * (1 - t_smooth) * t_smooth * mid_y + t_smooth**2 * y
        # Micro-jitter (less near target)
        jitter = max(0, 1.5 * (1 - t))
        bx += _random.uniform(-jitter, jitter)
        by += _random.uniform(-jitter, jitter)
        await page.mouse.move(bx, by)
        # Variable delay: faster in middle, slower at start/end
        delay_ms = int(8 + 12 * (1 - abs(2 * t - 1)))  # 8-20ms per step
        await asyncio.sleep(delay_ms / 1000)

    # For drag: release mouseup at end position
    if drag:
        await asyncio.sleep(_random.uniform(0.03, 0.07))
        await page.mouse.up()

    # Track position in page context
    try:
        await page.evaluate(f"() => {{ window._nomad_mouse_x = {x}; window._nomad_mouse_y = {y}; }}")
    except Exception:
        pass


async def _human_drag(page, start_x: float, start_y: float, end_x: float, end_y: float, session_id: str = ""):
    """Human-like drag: Bezier path with mousedown held throughout, plus slight overshoot.

    1. Move to start position with a natural curved approach
    2. Brief pause before grabbing
    3. Press and hold mousedown
    4. Brief settle before dragging
    5. Bezier curve along drag path with mouse held, micro-jitter easing off near target
    6. Overshoot 5-10px past target, then correct back
    7. Release mouseup
    """
    await _sync_physical_cursor(page, start_x, start_y, session_id)
    dist = _math.hypot(end_x - start_x, end_y - start_y)

    # Step 1: Move to start position (natural approach)
    await _human_move(page, start_x, start_y)
    await asyncio.sleep(_random.uniform(0.05, 0.12))  # brief pause before grab

    # Step 2: Press and hold
    await page.mouse.down()
    await asyncio.sleep(_random.uniform(0.08, 0.15))  # settle before drag

    # Step 3: Drag along bezier curve with mouse held
    drag_steps = max(12, min(35, int(dist / 15)))

    # Random bezier control point: perpendicular offset ±12% of distance
    perp_offset = dist * _random.uniform(-0.12, 0.12)
    mid_x = (start_x + end_x) / 2 + perp_offset
    mid_y = (start_y + end_y) / 2 + perp_offset

    for i in range(1, drag_steps + 1):
        t = i / drag_steps
        # Ease in-out: smoothstep — slower start/end, faster middle
        t_smooth = t * t * (3 - 2 * t)
        bx = (1 - t_smooth)**2 * start_x + 2 * (1 - t_smooth) * t_smooth * mid_x + t_smooth**2 * end_x
        by = (1 - t_smooth)**2 * start_y + 2 * (1 - t_smooth) * t_smooth * mid_y + t_smooth**2 * end_y
        # Micro-jitter — tapers off near the target so drop is precise
        jitter = max(0, 2.0 * (1 - t))
        bx += _random.uniform(-jitter, jitter)
        by += _random.uniform(-jitter, jitter)
        await page.mouse.move(bx, by)
        # Drag pacing: slightly slower than normal move to feel deliberate
        delay_ms = int(10 + 15 * (1 - abs(2 * t - 1)))  # 10-25ms per step
        await asyncio.sleep(delay_ms / 1000)

    # Step 4: Overshoot 5-10px past target, then correct back
    if dist > 20:
        dx = end_x - start_x
        dy = end_y - start_y
        mag = _math.hypot(dx, dy) or 1.0
        overshoot = _random.uniform(5, 10)
        over_x = max(0, min(1280, end_x + (dx / mag) * overshoot))
        over_y = max(0, min(800, end_y + (dy / mag) * overshoot))
        await page.mouse.move(over_x, over_y)
        await asyncio.sleep(_random.uniform(0.03, 0.06))
        # Correct back to exact target
        await page.mouse.move(end_x, end_y)
        await asyncio.sleep(_random.uniform(0.02, 0.05))

    # Step 5: Release at target
    await asyncio.sleep(_random.uniform(0.05, 0.10))
    await page.mouse.up()

    # Track final position
    try:
        await page.evaluate(f"() => {{ window._nomad_mouse_x = {end_x}; window._nomad_mouse_y = {end_y}; }}")
    except Exception:
        pass


# ── Playwright browser singleton + persistent context ──
_browser = None
_playwright = None
_context = None  # Persistent context for page reuse

# Camoufox async context manager handle (kept open for the server lifetime)
_camoufox_instance = None
_camoufox_browser = None  # The playwright-compatible browser object from Camoufox


async def _get_browser():
    """Lazy-init browser (+ persistent context) on first request.

    Tries Camoufox (hardened Firefox fork) when USE_CAMOUFOX=true and the
    package is installed — it is fundamentally harder to fingerprint than
    Chromium. Falls back to the existing Playwright/Chromium persistent
    context if Camoufox is unavailable or fails to launch.

    _browser is set to a sentinel object so callers that do
    `await _get_browser()` and then use `_browser.new_context(...)` still work —
    those callers create their own isolated contexts (session/open) and do NOT
    use the shared _context.
    """
    global _browser, _playwright, _context, _camoufox_instance, _camoufox_browser

    if _browser is not None:
        return _browser

    # ── Option A: Nodriver (Chrome, no chromedriver — zero navigator.webdriver leak) ──
    if USE_NODRIVER and _NODRIVER_AVAILABLE:
        try:
            _nd_browser = await uc.start(
                headless=False,  # NEVER use headless with nodriver — it is trivially detected
                user_data_dir="/tmp/wayfarer_nodriver_profile",
                browser_args=[
                    "--window-position=9999,9999",
                    "--window-size=1,1",
                    "--start-minimized",
                    "--disable-notifications",
                    "--disable-blink-features=AutomationControlled",
                    "--no-first-run",
                    "--no-default-browser-check",
                    "--disable-popup-blocking",
                ],
            )

            # nodriver's browser.get() returns a tab, not a page.
            # Build a thin adapter so the rest of the server can call
            # new_context() / new_page() / add_init_script() as usual.
            class _NodriverContext:
                """Minimal BrowserContext adapter wrapping a nodriver browser."""
                def __init__(self, browser):
                    self._nd = browser

                async def new_page(self):
                    tab = await self._nd.get("about:blank")
                    # Inject stealth script via CDP evaluate on first load
                    try:
                        await tab.evaluate(STEALTH_SCRIPT)
                    except Exception:
                        pass
                    return tab

                async def add_init_script(self, script: str):
                    # nodriver doesn't support context-level init scripts;
                    # STEALTH_SCRIPT is injected per-page in new_page() above.
                    pass

                async def close(self):
                    try:
                        self._nd.stop()
                    except Exception:
                        pass

            class _NodriverSentinel:
                """Thin wrapper so nodriver looks like the Chromium sentinel."""
                def __init__(self, nd_browser):
                    self._nd = nd_browser

                async def new_context(self, **kwargs):
                    return _NodriverContext(self._nd)

                async def close(self):
                    try:
                        self._nd.stop()
                    except Exception:
                        pass

            _context = _NodriverContext(_nd_browser)
            _browser = _NodriverSentinel(_nd_browser)
            print("[Wayfarer] Browser: Nodriver (Chrome — direct CDP, no chromedriver, no webdriver leak)")
            return _browser
        except Exception as e:
            print(f"[Wayfarer] Nodriver init failed ({e}), falling back to Camoufox/Playwright")
            _browser = None
            _context = None

    # ── Option B: Camoufox ──────────────────────────────────────────────────
    if USE_CAMOUFOX and _CAMOUFOX_AVAILABLE:
        try:
            # headless="virtual" uses Xvfb virtual display — avoids the easily-detectable
            # navigator.languages/WebGL/headless fingerprint that headless=True exposes.
            # On macOS a real display is available so headless=False works too, but
            # "virtual" is portable across headless Linux CI as well.
            # geoip=True patches geolocation APIs to match a real IP.
            _camoufox_instance = AsyncCamoufox(headless="virtual", humanize=True, geoip=True)
            _camoufox_browser = await _camoufox_instance.__aenter__()

            # Camoufox returns a Playwright-compatible Browser object.
            # Wrap it in the same sentinel interface the rest of the server expects.
            class _CamoufoxSentinel:
                """Thin wrapper so Camoufox browser looks like the Chromium sentinel."""
                def __init__(self, pw_browser):
                    self._b = pw_browser

                async def new_context(self, **kwargs):
                    # Strip kwargs Camoufox/Firefox doesn't support
                    _unsupported = {"color_scheme", "extra_http_headers", "ignore_https_errors",
                                    "java_script_enabled", "permissions", "timezone_id",
                                    "locale", "user_agent", "viewport"}
                    clean = {k: v for k, v in kwargs.items() if k not in _unsupported}
                    return await self._b.new_context(**clean)

                async def close(self):
                    try:
                        await _camoufox_instance.__aexit__(None, None, None)
                    except Exception:
                        pass

            # Create the default shared persistent-ish context via a new_context
            _context = await _camoufox_browser.new_context()
            await _context.add_init_script(STEALTH_SCRIPT)
            _browser = _CamoufoxSentinel(_camoufox_browser)
            print("[Wayfarer] Browser: Camoufox headful/virtual (Firefox — CAPTCHA resistant, geoip patched)")
            return _browser
        except Exception as e:
            print(f"[Wayfarer] Camoufox init failed ({e}), falling back to Playwright/Chromium")
            # Clean up partial state before falling through
            try:
                if _camoufox_instance:
                    await _camoufox_instance.__aexit__(None, None, None)
            except Exception:
                pass
            _camoufox_instance = None
            _camoufox_browser = None
            _context = None
            _browser = None

    # ── Option C: Playwright/Chromium with stealth args ─────────────────────
    try:
        try:
            from patchright.async_api import async_playwright
            _PATCHRIGHT = True
        except ImportError:
            from playwright.async_api import async_playwright
            _PATCHRIGHT = False

        class _BrowserSentinel:
            """Wraps the underlying browser exposed by launch_persistent_context."""
            def __init__(self, ctx):
                self._ctx = ctx

            async def new_context(self, **kwargs):
                """Create a fresh isolated context with full stealth applied."""
                return await self._ctx.browser.new_context(**kwargs)

            async def close(self):
                try:
                    await self._ctx.close()
                except Exception:
                    pass

        _playwright = await async_playwright().start()

        # launch_persistent_context returns a BrowserContext directly.
        # It saves cookies, localStorage, IndexedDB between restarts.
        _context = await _playwright.chromium.launch_persistent_context(
            USER_DATA_DIR,
            headless=False,
            args=[
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-setuid-sandbox',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--window-position=9999,9999',
                '--window-size=1,1',
                '--start-minimized',
                '--no-default-browser-check',
                '--disable-popup-blocking',
                '--disable-plugins-discovery',
            ],
            ignore_default_args=['--enable-automation', '--enable-blink-features=IdleDetection'],
            **_CONTEXT_KWARGS,
        )
        # Inject stealth script into every page opened via this context
        await _context.add_init_script(STEALTH_SCRIPT)

        _browser = _BrowserSentinel(_context)
        mode = (
            "Patchright/Chromium headful (CDP leak patches, offscreen)"
            if _PATCHRIGHT
            else "Playwright/Chromium headful (offscreen, CDP streamed to UI)"
        )
        print(f"[Wayfarer] Browser: {mode}")
    except Exception as e:
        print(f"[Wayfarer] Playwright init failed: {e}")
        raise
    return _browser


async def _ensure_browser():
    """Check browser is alive, restart if crashed."""
    global _browser, _context
    try:
        if _browser is not None:
            # For Playwright browsers, check if context is still usable
            if _context is not None:
                try:
                    # Try a lightweight operation to verify the browser is alive
                    _ = _context.pages
                    return
                except Exception:
                    pass
            else:
                return
    except Exception:
        pass
    # Browser died or context is broken — restart
    print("[Wayfarer] Browser crashed or unresponsive, restarting...")
    _browser = None
    _context = None
    await _get_browser()


async def _get_context(width: int = 1280, height: int = 720):
    """Get persistent browser context. Creates new one if viewport differs."""
    global _context
    await _get_browser()
    # Reuse existing context (viewport set per-page now)
    return _context


_chrome_win_cache: dict = {}  # session_id -> (left, top, content_w, content_h, cached_at)


async def _sync_physical_cursor(page, vx: float, vy: float, session_id: str = "") -> None:
    """Move the real OS cursor to match the Playwright viewport coordinate."""
    if not _PYAUTOGUI:
        return
    import time as _time_mod
    cache = _chrome_win_cache.get(session_id)
    now = _time_mod.time()
    if not cache or now - cache[4] > 5:  # refresh every 5 seconds
        try:
            b = await page.evaluate("""() => ({
                sx: window.screenX, sy: window.screenY,
                ow: window.outerWidth, oh: window.outerHeight,
                iw: window.innerWidth, ih: window.innerHeight
            })""")
            toolbar_h = b['oh'] - b['ih']
            _chrome_win_cache[session_id] = (b['sx'], b['sy'] + toolbar_h, b['iw'], b['ih'], now)
            cache = _chrome_win_cache[session_id]
        except Exception:
            return
    left, top, w, h, _ = cache
    sx = int(left + vx * (w / 1280))
    sy = int(top + vy * (h / 800))
    try:
        _pyautogui.moveTo(sx, sy, duration=0.18, _pause=False)
    except Exception:
        pass


# ── Active page sessions for agentic use ──
# Each entry stores {'page': <Page>, 'context': <BrowserContext>} so contexts
# are isolated between sessions (prevents cookie/auth leakage — BUG-08).
_active_pages: dict[str, dict] = {}  # session_id -> {'page': page, 'context': context}

# Pre-warmed session context+page held in standby so session_open is instant.
# Format: {'page': <Page>, 'context': <BrowserContext>} | None
_warm_session: dict | None = None
_warm_session_lock: asyncio.Lock = asyncio.Lock()  # prevents race when two session_open calls claim/replenish simultaneously
_session_last_active: dict[str, float] = {}  # session_id -> last activity timestamp
_downloads: list[dict] = []  # [{session_id, filename, path, size, timestamp}]

# WebSocket clients per session — for live screencast streaming
_ws_clients: dict[str, list] = {}  # session_id -> [WebSocket, ...]
# CDP sessions per browser session — for screencast control
_cdp_sessions: dict[str, object] = {}
# Adaptive stream quality tracking
from collections import OrderedDict, defaultdict, deque as _deque
_frame_ack_times: dict = {}  # session_id -> deque of send timestamps (last 10)
_stream_quality: dict = {}  # session_id -> int quality (40-85)


SESSION_IDLE_TIMEOUT = 300  # 5 minutes


async def _close_session_gracefully(session_id: str):
    """Gracefully close a session: stop CDP first, then close WS, then page."""
    # 1. Stop CDP screencast — clear flag BEFORE calling stopScreencast so
    #    any in-flight frame callbacks early-return instead of crashing.
    cdp = _cdp_sessions.pop(session_id, None)
    if cdp:
        try:
            cdp._screencasting = False  # Fix 1: disable frame handler first
            await cdp.send("Page.stopScreencast")
            await asyncio.sleep(0.1)  # 100ms for in-flight frames to flush
        except Exception:
            pass

    # 2. Close WebSocket clients
    for ws in _ws_clients.pop(session_id, []):
        try:
            await ws.close()
        except Exception:
            pass

    # 3. Close page and context
    session = _active_pages.pop(session_id, None)
    if session:
        try:
            await session['page'].close()
        except Exception:
            pass
        try:
            await session['context'].close()
        except Exception:
            pass

    # 4. Clean up idle tracking + adaptive quality + cursor cache
    _session_last_active.pop(session_id, None)
    _frame_ack_times.pop(session_id, None)
    _stream_quality.pop(session_id, None)
    _chrome_win_cache.pop(session_id, None)


async def cleanup_idle_sessions():
    """Close browser sessions that have been idle for SESSION_IDLE_TIMEOUT seconds."""
    while True:
        await asyncio.sleep(60)
        now = _time.time()
        to_close = [
            sid for sid, last_active in list(_session_last_active.items())
            if now - last_active > SESSION_IDLE_TIMEOUT
        ]
        for sid in to_close:
            await _close_session_gracefully(sid)
            print(f"[cleanup] Closed idle session {sid}")


async def _prewarm_session() -> None:
    """Pre-create one isolated BrowserContext + Page so the first session_open is instant.

    Stores the result in _warm_session. Called from lifespan after _get_browser()
    and also re-called after each session_open consumes the warm slot.

    Guarded by _warm_session_lock to prevent two concurrent session_open calls
    from both spawning a prewarm (the second would leak a context+page).
    """
    global _warm_session
    async with _warm_session_lock:
        # If another task already replenished while we waited, skip
        if _warm_session is not None:
            return
        try:
            browser = await _get_browser()
            warm_kwargs = dict(_CONTEXT_KWARGS)
            warm_kwargs['viewport'] = {'width': 1280, 'height': 800}
            ctx = await browser.new_context(**warm_kwargs)
            await ctx.add_init_script(STEALTH_SCRIPT)
            page = await ctx.new_page()
            await _apply_stealth(page)
            await page.set_viewport_size({"width": 1280, "height": 800})
            # Navigate to blank so the page is ready but not loading anything heavy
            try:
                await page.goto("about:blank", wait_until="domcontentloaded", timeout=5000)
            except Exception:
                pass
            _warm_session = {"page": page, "context": ctx}
            print("[Wayfarer] Warm session pre-created and ready")
        except Exception as e:
            _warm_session = None
            print(f"[Wayfarer] Warm session pre-create failed: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm browser on startup so first screenshot is fast
    try:
        await _get_browser()
        print("[Wayfarer] Playwright browser pre-warmed")
        # Pre-create a warm session context+page so first session_open is instant
        await _prewarm_session()
    except Exception as e:
        print(f"[Wayfarer] Browser pre-warm failed (will retry on first request): {e}")
    asyncio.create_task(cleanup_idle_sessions())
    # Start Neuro API task workers + cleanup
    for _ in range(_MAX_CONCURRENT_TASKS):
        asyncio.create_task(_task_worker())
    asyncio.create_task(_cleanup_old_tasks())
    yield
    # Cleanup on shutdown
    global _browser, _playwright, _context, _camoufox_instance, _camoufox_browser
    # Stop all CDP screencasts and close WebSocket clients
    for sid, cdp in list(_cdp_sessions.items()):
        try:
            cdp._screencasting = False  # Fix 1: disable frame handler before stopping
            await cdp.send("Page.stopScreencast")
        except Exception:
            pass
    _cdp_sessions.clear()
    for sid, clients in list(_ws_clients.items()):
        for ws in clients:
            try:
                await ws.close()
            except Exception:
                pass
    _ws_clients.clear()
    # Close all active sessions (each has its own page + context — BUG-08)
    for sid, ctx in _active_pages.items():
        try:
            await ctx['page'].close()
        except Exception:
            pass
        try:
            await ctx['context'].close()
        except Exception:
            pass
    _active_pages.clear()
    # Close pre-warmed session if unused
    global _warm_session
    warm = _warm_session
    _warm_session = None
    if warm:
        try:
            await warm["page"].close()
        except Exception:
            pass
        try:
            await warm["context"].close()
        except Exception:
            pass
    if _context:
        try:
            await _context.close()
        except Exception:
            pass
    if _camoufox_instance:
        try:
            await _camoufox_instance.__aexit__(None, None, None)
        except Exception:
            pass
    elif _browser:
        try:
            await _browser.close()
        except Exception:
            pass
    if _playwright:
        try:
            await _playwright.stop()
        except Exception:
            pass


app = FastAPI(title="Wayfarer", description="Async web research API", lifespan=lifespan)


# ── Global exception handler — crash-proof: always returns JSON, never 500 HTML ──
from fastapi.responses import JSONResponse as _JSONResponse

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    traceback.print_exc()
    return _JSONResponse(
        status_code=500,
        content={"error": str(exc), "type": type(exc).__name__}
    )


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
    # Input sanitization: cap query length
    req.query = req.query.strip()[:2000]
    if not req.query:
        return {"error": "query is required", "results": []}
    try:
        result = await research(
            query=req.query,
            num_results=req.num_results,
            concurrency=req.concurrency,
            extract_mode=req.extract_mode,
        )
        return result
    except Exception as e:
        return {"error": str(e), "results": []}


@app.post("/batch")
async def do_batch(req: BatchRequest):
    try:
        tasks = [
            research(
                query=q.query,
                num_results=q.num_results,
                concurrency=req.concurrency,
                extract_mode=req.extract_mode,
            )
            for q in req.queries
        ]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        # Convert exceptions to error dicts so one failing query doesn't kill the batch
        cleaned = []
        for r in results:
            if isinstance(r, Exception):
                cleaned.append({"error": str(r)})
            else:
                cleaned.append(r)
        return {"results": cleaned}
    except Exception as e:
        return {"error": str(e), "results": []}


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
        await _apply_stealth(page)
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


import re as _re

def _is_valid_uuid(s: str) -> bool:
    """Check if a string is a valid UUID4."""
    try:
        uuid.UUID(s, version=4)
        return True
    except (ValueError, AttributeError):
        return False


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
    # Input sanitization
    req.url = req.url.strip()
    if not req.url or not (req.url.startswith("http://") or req.url.startswith("https://")):
        return {"session_id": "", "url": req.url, "image_base64": "", "width": 0, "height": 0, "title": "", "error": "Invalid URL: must start with http:// or https://"}

    try:
        # Ensure browser is alive before opening a session
        await _ensure_browser()
        global _warm_session

        # Claim the pre-warmed session under the lock so two concurrent
        # session_open calls cannot both grab the same warm session.
        async with _warm_session_lock:
            warm = _warm_session
            _warm_session = None  # Claim it atomically

        if warm is not None:
            context = warm["context"]
            page = warm["page"]
            # Resize viewport if needed
            if req.viewport_width != 1280 or req.viewport_height != 800:
                await page.set_viewport_size({"width": req.viewport_width, "height": req.viewport_height})
            # Navigate the warm page to the requested URL
            try:
                await page.goto(req.url, wait_until="domcontentloaded", timeout=10000)
            except Exception:
                pass
            await page.wait_for_timeout(600)
            await _dismiss_popups(page)
            # Replenish warm slot in background
            asyncio.create_task(_prewarm_session())
        else:
            # BUG-08: create a new isolated BrowserContext per session to prevent
            # cookie/auth leakage between sessions.
            browser = await _get_browser()
            session_ctx_kwargs = dict(_CONTEXT_KWARGS)
            session_ctx_kwargs['viewport'] = {'width': req.viewport_width, 'height': req.viewport_height}
            # Route through the sentinel's new_context() so both Camoufox and
            # Chromium paths filter unsupported kwargs correctly.
            context = await browser.new_context(**session_ctx_kwargs)
            # Inject stealth init script into every page created in this context
            await context.add_init_script(STEALTH_SCRIPT)
            page = await context.new_page()
            # Apply playwright-stealth on the live page object as well
            await _apply_stealth(page)
            await page.set_viewport_size({"width": req.viewport_width, "height": req.viewport_height})

            try:
                await page.goto(req.url, wait_until="domcontentloaded", timeout=10000)
            except Exception:
                pass

            await page.wait_for_timeout(600)
            await _dismiss_popups(page)

        # BUG-15: use UUID for collision-resistant session IDs
        sid = str(uuid.uuid4())
        _active_pages[sid] = {"page": page, "context": context}
        _session_last_active[sid] = _time.time()

        # Fix 4: Intercept new-tab / target="_blank" page creation — redirect to main page instead.
        # Keeps everything in the single CDP stream view rather than opening an invisible orphan page.
        async def make_new_page_handler(main_page, session_id):
            async def on_new_page(new_page):
                try:
                    target_url = new_page.url
                    # Give the new page a moment to get its URL (may still be about:blank)
                    if not target_url or target_url == "about:blank":
                        await asyncio.sleep(0.25)
                        target_url = new_page.url
                    # Close the orphaned new page
                    try:
                        await new_page.close()
                    except Exception:
                        pass
                    # Navigate main page to that URL if it's real
                    if target_url and target_url not in ("about:blank", ""):
                        try:
                            await main_page.goto(target_url, wait_until="domcontentloaded", timeout=10000)
                        except Exception:
                            pass
                        # Notify streaming clients of URL change
                        current_url = main_page.url
                        for ws in list(_ws_clients.get(session_id, [])):
                            try:
                                await ws.send_text(json.dumps({"type": "url", "url": current_url}))
                            except Exception:
                                pass
                except Exception as e:
                    print(f"[new_page] Failed to redirect new tab: {e}")
            return on_new_page

        context.on("page", await make_new_page_handler(page, sid))

        # Track downloads
        async def handle_download(download):
            try:
                suggested = download.suggested_filename
                session_dir = f"/tmp/wayfarer_downloads/{sid}"
                os.makedirs(session_dir, exist_ok=True)
                save_path = os.path.join(session_dir, suggested)
                # Handle collision
                if os.path.exists(save_path):
                    base, ext = os.path.splitext(suggested)
                    save_path = os.path.join(session_dir, f"{base}_1{ext}")
                await download.save_as(save_path)
                size = os.path.getsize(save_path)
                _downloads.append({
                    "session_id": sid,
                    "filename": suggested,
                    "path": save_path,
                    "size": size,
                    "timestamp": _time.time(),
                })
            except Exception as e:
                print(f"[download] Failed: {e}")
        page.on("download", lambda d: asyncio.create_task(handle_download(d)))

        # Start CDP screencast for live streaming
        try:
            cdp = await page.context.new_cdp_session(page)
            _cdp_sessions[sid] = cdp
            _ws_clients[sid] = []
            # _screencasting flag: prevents frame handler from firing after stopScreencast()
            cdp._screencasting = True

            async def make_frame_handler(session_id, cdp_session):
                async def on_frame(params):
                    # Early-return if screencast has been stopped — avoids crash on session end
                    if not getattr(cdp_session, '_screencasting', False):
                        return
                    frame_b64 = params.get("data", "")
                    ack_id = params.get("sessionId", 0)
                    # Ack so Chrome continues sending frames
                    try:
                        await cdp_session.send("Page.screencastFrameAck", {"sessionId": ack_id})
                    except Exception:
                        pass
                    # Record send timestamp for adaptive quality
                    ack_deque = _frame_ack_times.setdefault(session_id, _deque(maxlen=10))
                    ack_deque.append(_time.time())
                    # Every 30 frames, adapt quality based on avg inter-frame interval
                    if len(ack_deque) == 10 and len(ack_deque) % 10 == 0:
                        times = list(ack_deque)
                        if len(times) >= 2:
                            intervals = [times[i+1] - times[i] for i in range(len(times)-1)]
                            avg_ms = (sum(intervals) / len(intervals)) * 1000
                            cur_q = _stream_quality.get(session_id, 72)
                            if avg_ms > 150:
                                new_q = max(40, cur_q - 5)
                            elif avg_ms < 50:
                                new_q = min(85, cur_q + 5)
                            else:
                                new_q = cur_q
                            if new_q != cur_q:
                                _stream_quality[session_id] = new_q
                                try:
                                    await cdp_session.send("Page.stopScreencast")
                                    await cdp_session.send("Page.startScreencast", {
                                        "format": "jpeg", "quality": new_q,
                                        "maxWidth": 1280, "maxHeight": 800, "everyNthFrame": 1
                                    })
                                except Exception:
                                    pass
                    # Push frame as binary WebSocket frame (type byte 0x01 + raw JPEG bytes)
                    clients = _ws_clients.get(session_id, [])
                    if clients:
                        try:
                            frame_bytes = base64.b64decode(frame_b64)
                        except Exception:
                            frame_bytes = b''
                        binary_msg = b'\x01' + frame_bytes
                        dead = []
                        for ws in clients:
                            try:
                                await ws.send_bytes(binary_msg)
                            except Exception:
                                dead.append(ws)
                        for ws in dead:
                            try:
                                clients.remove(ws)
                            except ValueError:
                                pass
                return on_frame

            cdp.on("Page.screencastFrame", await make_frame_handler(sid, cdp))

            # CDP Page events: instant URL + title push (replaces 2s polling)
            await cdp.send("Page.enable")

            async def make_frame_navigated_handler(session_id):
                async def on_frame_navigated(event):
                    url = event.get('frame', {}).get('url', '')
                    if url and not url.startswith('chrome'):
                        for ws in list(_ws_clients.get(session_id, set())):
                            try:
                                await ws.send_text(json.dumps({"type": "url", "url": url}))
                            except Exception:
                                pass
                return on_frame_navigated

            cdp.on("Page.frameNavigated", await make_frame_navigated_handler(sid))

            async def make_title_changed_handler(session_id):
                async def on_title_changed(event):
                    title = event.get('title', '')
                    for ws in list(_ws_clients.get(session_id, set())):
                        try:
                            await ws.send_text(json.dumps({"type": "title", "title": title}))
                        except Exception:
                            pass
                return on_title_changed

            cdp.on("Page.titleChanged", await make_title_changed_handler(sid))

            # CDP Runtime: console log forwarding
            await cdp.send("Runtime.enable")

            async def make_console_handler(session_id):
                async def on_console(event):
                    args = event.get('args', [])
                    text = ' '.join(str(a.get('value', a.get('description', ''))) for a in args)
                    level = event.get('type', 'log')
                    for ws in list(_ws_clients.get(session_id, set())):
                        try:
                            await ws.send_text(json.dumps({"type": "console", "level": level, "text": text}))
                        except Exception:
                            pass
                return on_console

            cdp.on("Runtime.consoleAPICalled", await make_console_handler(sid))

            async def on_load_event(event):
                for ws in list(_ws_clients.get(sid, set())):
                    try:
                        await ws.send_text(json.dumps({"type": "loaded"}))
                    except Exception:
                        pass
            cdp.on("Page.loadEventFired", on_load_event)

            await cdp.send("Page.startScreencast", {
                "format": "jpeg",
                "quality": 72,
                "maxWidth": 1280,
                "maxHeight": 800,
                "everyNthFrame": 1,
            })

            # Fix 2: Auto-remove session and notify clients on browser crash
            async def make_crash_handler(session_id):
                async def on_crash():
                    print(f"[session] Browser crash detected for {session_id}, cleaning up")
                    # Notify all WebSocket clients before removing
                    err_msg = json.dumps({"type": "error", "message": "Browser crashed — session ended"})
                    for ws in list(_ws_clients.get(session_id, [])):
                        try:
                            await ws.send_text(err_msg)
                            await ws.close()
                        except Exception:
                            pass
                    # Auto-remove from _SESSIONS
                    _active_pages.pop(session_id, None)
                    _cdp_sessions.pop(session_id, None)
                    _ws_clients.pop(session_id, None)
                    _session_last_active.pop(session_id, None)
                return on_crash

            page.on("crash", await make_crash_handler(sid))
            # NOTE: Do NOT add page.on("close", ...) — it fires during normal
            # page operations (navigations, context close) and prematurely
            # removes the session from _active_pages, breaking /session/close.

        except Exception as e:
            print(f"[screencast] Could not start screencast for {sid}: {e}")

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
    # Input sanitization
    req.session_id = req.session_id.strip()
    if not _is_valid_uuid(req.session_id):
        raise HTTPException(status_code=400, detail="session_id must be a valid UUID")
    req.js = req.js[:10000]  # Cap JS eval input
    req.selector = req.selector[:2000]
    await _ensure_browser()
    session = _active_pages.get(req.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {req.session_id} not found")
    page = session["page"]
    # Auto-cleanup: if the page crashed, remove it and return an error
    try:
        if page.is_closed():
            raise Exception("page is closed")
    except Exception:
        await _close_session_gracefully(req.session_id)
        raise HTTPException(status_code=410, detail=f"Session {req.session_id} page crashed and was cleaned up")
    # BUG-14: clamp quality to valid JPEG range (0-100) before any screenshot call
    quality = max(0, min(100, req.quality if req.quality is not None else 70))
    _session_last_active[req.session_id] = _time.time()

    try:
        result = None

        if req.action == "screenshot":
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            scroll_pos = await page.evaluate("window.scrollY")
            page_height = await page.evaluate("document.body.scrollHeight")
            vp = page.viewport_size or {"width": 1280, "height": 800}
            return {"error": None, "result": "screenshot taken", "image_base64": img_b64, "title": title, "current_url": current_url, "scroll_y": scroll_pos, "page_height": page_height, "viewportWidth": vp["width"], "viewportHeight": vp["height"]}

        elif req.action == "scroll":
            # Human-like scroll inertia: split into multiple decelerating wheel events
            direction = 'down' if req.scroll_y >= 0 else 'up'
            await _human_scroll(page, abs(req.scroll_y), direction)
            await page.wait_for_timeout(100)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            scroll_pos = await page.evaluate("window.scrollY")
            current_url = page.url
            return {"error": None, "result": f"scrolled to y={scroll_pos}", "image_base64": img_b64, "current_url": current_url}

        elif req.action == "click":
            # Support coordinate-based clicking (from UI click on screenshot)
            if req.click_x >= 0 and req.click_y >= 0:
                try:
                    click_x = req.click_x + _random.uniform(-2, 2)
                    click_y = req.click_y + _random.uniform(-2, 2)
                    # _human_click: move + hover pause + mousedown/up
                    await _human_click(page, click_x, click_y, session_id=req.session_id)
                except Exception as e:
                    return {"error": f"click at ({req.click_x},{req.click_y}) failed: {e}", "result": None, "image_base64": ""}
                await page.wait_for_timeout(80)
                screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
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
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            return {"error": None, "result": f"clicked {req.selector}", "image_base64": img_b64, "title": title}

        elif req.action == "hover":
            if req.click_x >= 0 and req.click_y >= 0:
                await _sync_physical_cursor(page, float(req.click_x), float(req.click_y), req.session_id)
                await _human_move(page, float(req.click_x), float(req.click_y))
                await page.wait_for_timeout(200)
                screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
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
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            # After navigate action, push URL update to streaming clients
            try:
                for ws in _ws_clients.get(req.session_id, []):
                    try:
                        await ws.send_text(json.dumps({"type": "url", "url": current_url}))
                    except Exception:
                        pass
            except Exception:
                pass
            return {"error": None, "result": f"navigated to {req.js}", "image_base64": img_b64, "title": title, "current_url": current_url}

        elif req.action == "back":
            try:
                await page.go_back(wait_until="domcontentloaded", timeout=8000)
            except Exception:
                pass
            await page.wait_for_timeout(400)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
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
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
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
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            return {"error": None, "result": "reloaded", "image_base64": img_b64, "title": title, "current_url": current_url}

        elif req.action == "type":
            if not req.js:
                return {"error": "js field should contain text to type", "result": None, "image_base64": ""}
            # BUG-02: focus the target element before typing so text lands in the right field
            if req.selector:
                await page.click(req.selector)
                await page.wait_for_timeout(100)
            # _human_type: character-by-character with realistic timing, typos, punctuation pauses
            await _human_type(page, req.js)
            await page.wait_for_timeout(200)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            return {"error": None, "result": f"typed '{req.js}'", "image_base64": img_b64, "title": title, "current_url": current_url}

        elif req.action == "keypress":
            # Send special keys: Enter, Tab, Escape, Backspace, etc.
            key = req.js or "Enter"
            await page.keyboard.press(key)
            await page.wait_for_timeout(300)
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            title = await page.title()
            current_url = page.url
            return {"error": None, "result": f"pressed {key}", "image_base64": img_b64, "title": title, "current_url": current_url}

        elif req.action == "mousedown":
            if req.click_x < 0 or req.click_y < 0:
                return {"error": "coordinates required for mousedown", "result": None, "image_base64": ""}
            await _sync_physical_cursor(page, float(req.click_x), float(req.click_y), req.session_id)
            await _human_move(page, float(req.click_x), float(req.click_y))
            await page.mouse.down()
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            return {"error": None, "result": f"mousedown at ({req.click_x},{req.click_y})", "image_base64": img_b64}

        elif req.action == "mousemove":
            if req.click_x < 0 or req.click_y < 0:
                return {"error": "coordinates required for mousemove", "result": None, "image_base64": ""}
            await _sync_physical_cursor(page, float(req.click_x), float(req.click_y), req.session_id)
            await _human_move(page, float(req.click_x), float(req.click_y), steps=_random.randint(4, 8))
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            return {"error": None, "result": f"mousemove to ({req.click_x},{req.click_y})", "image_base64": img_b64}

        elif req.action == "mouseup":
            if req.click_x < 0 or req.click_y < 0:
                return {"error": "coordinates required for mouseup", "result": None, "image_base64": ""}
            await _sync_physical_cursor(page, float(req.click_x), float(req.click_y), req.session_id)
            await _human_move(page, float(req.click_x), float(req.click_y))
            await page.mouse.up()
            screenshot_bytes = await page.screenshot(type="jpeg", quality=quality)
            img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
            return {"error": None, "result": f"mouseup at ({req.click_x},{req.click_y})", "image_base64": img_b64}

        else:
            return {"error": f"Unknown action: {req.action}", "result": None, "image_base64": ""}

    except Exception as e:
        return {"error": str(e), "result": None, "image_base64": ""}


class SessionCloseRequest(BaseModel):
    session_id: str


@app.post("/session/close")
async def session_close(req: SessionCloseRequest):
    """Close an active session page and its isolated context (BUG-08)."""
    sid = req.session_id.strip()
    if not sid:
        return {"closed": False, "error": "session_id is required"}
    if not _is_valid_uuid(sid):
        return {"closed": False, "error": "session_id must be a valid UUID"}
    had_session = sid in _active_pages
    await _close_session_gracefully(sid)
    if had_session:
        return {"closed": True}
    return {"closed": False, "error": "No such session"}


@app.get("/sessions")
async def list_sessions():
    """List all active sessions with their status."""
    sessions = []
    for sid, session in _active_pages.items():
        page = session.get("page")
        try:
            current_url = page.url if page else ""
            is_closed = page.is_closed() if page else True
        except Exception:
            current_url = ""
            is_closed = True
        sessions.append({
            "session_id": sid,
            "url": current_url,
            "last_active": _session_last_active.get(sid, 0),
            "ws_clients": len(_ws_clients.get(sid, [])),
            "screencasting": getattr(_cdp_sessions.get(sid), '_screencasting', False),
            "is_closed": is_closed,
        })
    return {"sessions": sessions, "count": len(sessions)}


class DragRequest(BaseModel):
    startX: float
    startY: float
    endX: float
    endY: float


@app.post("/session/{session_id}/drag")
async def session_drag(session_id: str, req: DragRequest):
    """Perform a human-like drag from (startX, startY) to (endX, endY).

    Uses _human_drag: bezier curved path with mousedown held throughout,
    micro-jitter, and slight overshoot + correction at end.
    """
    session = _active_pages.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    page = session["page"]
    _session_last_active[session_id] = _time.time()
    try:
        await _human_drag(page, req.startX, req.startY, req.endX, req.endY, session_id=session_id)
        return {"ok": True, "error": None, "result": f"dragged ({req.startX},{req.startY}) -> ({req.endX},{req.endY})"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


class EvalRequest(BaseModel):
    script: str


@app.post("/session/{session_id}/eval")
async def session_eval(session_id: str, req: EvalRequest):
    """Evaluate JavaScript in the session page context."""
    session = _active_pages.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    page = session["page"]
    _session_last_active[session_id] = _time.time()
    try:
        result = await page.evaluate(req.script)
        return {"error": None, "result": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




# ── GET /session/{id}/url — address bar sync polling endpoint ──


@app.get("/session/{session_id}/url")
async def session_get_url(session_id: str):
    """Return the current URL of an active session page.

    Used by the React address bar to poll for URL changes every 2 seconds,
    catching navigation events (back/forward, link clicks, redirects) that
    don't come through an explicit navigate action.
    """
    session = _active_pages.get(session_id)
    if not session:
        return {"url": None, "error": f"No active session: {session_id}"}
    page = session["page"]
    try:
        return {"url": page.url, "error": None}
    except Exception as e:
        return {"url": None, "error": str(e)}


# -- GET /session/{id}/screenshot -- reduced-resolution screenshot for vision calls --


@app.get("/session/{session_id}/screenshot")
async def session_screenshot_get(session_id: str, width: int = 1280, height: int = 800):
    """Return a screenshot of the active session page.

    Pass ?width=640&height=400 to get a downscaled JPEG -- half resolution means
    ~75% fewer pixels sent to the vision model, dramatically reducing token cost.
    Full 1280x800 is returned when no size params are provided.
    """
    session = _active_pages.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    page = session["page"]
    _session_last_active[session_id] = _time.time()
    try:
        img_bytes = await page.screenshot(type="jpeg", quality=70)
        if width != 1280 or height != 800:
            from PIL import Image
            import io
            img = Image.open(io.BytesIO(img_bytes))
            img = img.resize((width, height), Image.LANCZOS)
            buf = io.BytesIO()
            img.save(buf, "JPEG", quality=65)
            img_bytes = buf.getvalue()
        return {"screenshot": base64.b64encode(img_bytes).decode()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/session/{session_id}/accessibility")
async def get_accessibility(session_id: str):
    session = _active_pages.get(session_id)
    if not session:
        raise HTTPException(404, f"Session {session_id} not found")
    page = session["page"]
    try:
        cdp = _cdp_sessions.get(session_id)
        if cdp:
            tree = await cdp.send("Accessibility.getFullAXTree")
            def prune(node):
                role = node.get('role', {}).get('value', '')
                keep_roles = {'button', 'link', 'textbox', 'checkbox', 'radio',
                              'combobox', 'listbox', 'menuitem', 'tab', 'heading',
                              'img', 'input', 'searchbox', 'spinbutton', 'slider'}
                children = [prune(c) for c in node.get('children', []) if prune(c)]
                if role in keep_roles or children:
                    return {
                        'role': role,
                        'name': node.get('name', {}).get('value', ''),
                        'bounds': node.get('boundingBox'),
                        'children': children,
                        'nodeId': node.get('nodeId')
                    }
                return None
            nodes = tree.get('nodes', [])
            pruned = [n for n in (prune(node) for node in nodes) if n]
            return {"nodes": pruned}
        else:
            result = await page.evaluate("""() => {
                const elements = document.querySelectorAll('a, button, input, select, textarea, [role]');
                return Array.from(elements).slice(0, 200).map(el => {
                    const rect = el.getBoundingClientRect();
                    return {
                        tag: el.tagName.toLowerCase(),
                        role: el.getAttribute('role') || el.tagName.toLowerCase(),
                        name: el.textContent?.trim().slice(0, 100) || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '',
                        bounds: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}
                    };
                });
            }""")
            return {"nodes": result}
    except Exception as e:
        raise HTTPException(500, str(e))


@app.get("/session/{session_id}/element-at")
async def element_at(session_id: str, x: float, y: float):
    page_session = _active_pages.get(session_id)
    if not page_session:
        raise HTTPException(404, detail=f"Session {session_id} not found")
    page = page_session["page"]
    try:
        result = await page.evaluate(f"""() => {{
            const el = document.elementFromPoint({x}, {y});
            if (!el) return null;
            const rect = el.getBoundingClientRect();
            return {{
                tag: el.tagName.toLowerCase(),
                id: el.id,
                className: el.className,
                text: el.textContent?.trim().slice(0, 200),
                href: el.href || null,
                rect: {{x: rect.x, y: rect.y, width: rect.width, height: rect.height}}
            }};
        }}""")
        return result or {}
    except Exception as e:
        raise HTTPException(500, detail=str(e))


# ── Fix #1: Scroll via page.mouse.wheel — more reliable than window.scrollBy ──


class ScrollRequest(BaseModel):
    x: float = 640
    y: float = 400
    deltaX: float = 0
    deltaY: float = 300


@app.post("/session/{session_id}/scroll")
async def session_scroll(session_id: str, req: ScrollRequest):
    """Scroll the page at a specific position using page.mouse.wheel.

    More reliable than window.scrollBy — works inside overflow containers,
    iframes, and sticky/fixed elements. Supports x/y to position the
    wheel event at a specific element. (fix #1)
    """
    session = _active_pages.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    page = session["page"]
    _session_last_active[session_id] = _time.time()
    try:
        # Move mouse to scroll position before wheeling (so it lands in the right scroller)
        await _human_move(page, req.x, req.y)
        # Split into human-like inertia steps using _human_scroll helper
        if req.deltaY != 0:
            direction = 'down' if req.deltaY > 0 else 'up'
            await _human_scroll(page, abs(req.deltaY), direction)
        if req.deltaX != 0:
            # Horizontal scroll: wheel with deltaX
            total = abs(req.deltaX)
            steps = _random.randint(3, 6)
            sign = 1 if req.deltaX > 0 else -1
            for d in _decelerate_curve(total, steps):
                await page.mouse.wheel(sign * d, 0)
                await asyncio.sleep(_random.uniform(0.02, 0.05))
        await page.wait_for_timeout(100)
        screenshot_bytes = await page.screenshot(type="jpeg", quality=70)
        img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
        scroll_pos = await page.evaluate("window.scrollY")
        current_url = page.url
        vp = page.viewport_size or {"width": 1280, "height": 800}
        return {
            "error": None,
            "result": f"scrolled deltaX={req.deltaX} deltaY={req.deltaY} at ({req.x},{req.y})",
            "image_base64": img_b64,
            "current_url": current_url,
            "scroll_y": scroll_pos,
            "viewportWidth": vp["width"],
            "viewportHeight": vp["height"],
        }
    except Exception as e:
        return {"error": str(e), "result": None, "image_base64": ""}


# ── Fix #2: Dedicated type endpoint with clear support ──


class TypeRequest(BaseModel):
    text: str
    selector: str = ""
    clear: bool = True  # Clear existing text before typing (Ctrl+A + Delete)


@app.post("/session/{session_id}/type")
async def session_type(session_id: str, req: TypeRequest):
    """Type text into the focused element.

    If selector is provided, that element is clicked first to focus it.
    If clear=True (default), sends Ctrl+A then Delete to clear any existing
    text before typing — prevents new text being appended to old. (fix #2)
    """
    session = _active_pages.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    page = session["page"]
    _session_last_active[session_id] = _time.time()
    try:
        if req.selector:
            try:
                await page.click(req.selector, timeout=3000)
                await page.wait_for_timeout(100)
            except Exception as e:
                return {"error": f"selector click failed: {e}", "result": None, "image_base64": ""}
        if req.clear:
            # Clear existing text in the focused field
            await page.keyboard.press("Control+a")
            await asyncio.sleep(0.05)
            await page.keyboard.press("Delete")
            await asyncio.sleep(0.05)
        await _human_type(page, req.text)
        await page.wait_for_timeout(200)
        screenshot_bytes = await page.screenshot(type="jpeg", quality=70)
        img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
        title = await page.title()
        current_url = page.url
        vp = page.viewport_size or {"width": 1280, "height": 800}
        return {
            "error": None,
            "result": f"typed '{req.text[:40]}'",
            "image_base64": img_b64,
            "title": title,
            "current_url": current_url,
            "viewportWidth": vp["width"],
            "viewportHeight": vp["height"],
        }
    except Exception as e:
        return {"error": str(e), "result": None, "image_base64": ""}


# ── Fix #6: Keyboard shortcut endpoint ──


class ShortcutRequest(BaseModel):
    keys: str  # e.g. "Control+t", "Control+l", "Escape", "Control+a"


@app.post("/session/{session_id}/shortcut")
async def session_shortcut(session_id: str, req: ShortcutRequest):
    """Send a keyboard shortcut via page.keyboard.press().

    Supports modifier combos: "Control+t", "Control+l", "Escape", "Control+a".
    Playwright key format: https://playwright.dev/python/docs/api/class-keyboard
    (fix #6)
    """
    session = _active_pages.get(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session {session_id} not found")
    page = session["page"]
    _session_last_active[session_id] = _time.time()
    try:
        await page.keyboard.press(req.keys)
        await page.wait_for_timeout(300)
        screenshot_bytes = await page.screenshot(type="jpeg", quality=70)
        img_b64 = base64.b64encode(screenshot_bytes).decode("utf-8")
        title = await page.title()
        current_url = page.url
        vp = page.viewport_size or {"width": 1280, "height": 800}
        return {
            "error": None,
            "result": f"shortcut '{req.keys}' sent",
            "image_base64": img_b64,
            "title": title,
            "current_url": current_url,
            "viewportWidth": vp["width"],
            "viewportHeight": vp["height"],
        }
    except Exception as e:
        return {"error": str(e), "result": None, "image_base64": ""}

@app.websocket("/session/{session_id}/stream")
async def stream_session(websocket: WebSocket, session_id: str):
    """Live CDP screencast stream for a browser session. Pushes JPEG frames as JSON."""
    await websocket.accept()

    # Send current URL immediately so client knows what's loaded
    session = _active_pages.get(session_id)
    if session is None:
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": f"No session: {session_id}"}))
            await websocket.close()
        except Exception:
            pass
        return

    if session_id not in _ws_clients:
        _ws_clients[session_id] = []
    _ws_clients[session_id].append(websocket)
    _session_last_active[session_id] = _time.time()

    # Send initial URL + immediate screenshot so client has something to show
    try:
        page = session["page"]
        # Announce binary frame protocol to client
        await websocket.send_text(json.dumps({"type": "hello", "binaryFrames": True}))
        await websocket.send_text(json.dumps({"type": "url", "url": page.url}))
        # Send first frame immediately as binary (CDP only sends on content change)
        try:
            shot = await page.screenshot(type="jpeg", quality=72)
            await websocket.send_bytes(b'\x01' + shot)
        except Exception:
            pass
    except WebSocketDisconnect:
        clients = _ws_clients.get(session_id, [])
        try:
            clients.remove(websocket)
        except ValueError:
            pass
        return
    except Exception:
        pass

    try:
        # Keep connection alive — frames are pushed by the screencast handler
        # Just wait for disconnect
        while True:
            try:
                # Receive any messages from client (e.g. keepalive pings)
                data = await asyncio.wait_for(websocket.receive_text(), timeout=30.0)
                if data == "ping":
                    await websocket.send_text(json.dumps({"type": "pong"}))
                _session_last_active[session_id] = _time.time()
            except asyncio.TimeoutError:
                # Session may have been closed while we were waiting
                if session_id not in _active_pages:
                    break
                # Send keepalive — if the client is gone this will raise WebSocketDisconnect
                try:
                    await websocket.send_text(json.dumps({"type": "ping"}))
                except Exception:
                    break
    except WebSocketDisconnect:
        pass
    except Exception as e:
        # Session closed or other error during streaming — close cleanly
        try:
            await websocket.send_text(json.dumps({"type": "error", "message": str(e)}))
            await websocket.close()
        except Exception:
            pass
    finally:
        clients = _ws_clients.get(session_id, [])
        try:
            clients.remove(websocket)
        except ValueError:
            pass


@app.post("/reset")
async def reset_server():
    """Close all active sessions and reinitialize the browser. Used by UI restart button."""
    global _browser, _context, _active_pages, _cdp_sessions, _ws_clients, _warm_session

    # Close all WebSocket clients
    for sid, clients in list(_ws_clients.items()):
        for ws in clients:
            try:
                await ws.close()
            except Exception:
                pass
    _ws_clients.clear()

    # Stop all CDP screencasts
    for sid, cdp in list(_cdp_sessions.items()):
        try:
            cdp._screencasting = False  # Fix 1: disable frame handler before stopping
            await cdp.send("Page.stopScreencast")
        except Exception:
            pass
    _cdp_sessions.clear()

    # Close all pages/contexts
    for sid, session in list(_active_pages.items()):
        try:
            await session["page"].close()
        except Exception:
            pass
        try:
            await session["context"].close()
        except Exception:
            pass
    _active_pages.clear()

    # Clean up warm session
    warm = _warm_session
    _warm_session = None
    if warm:
        try:
            await warm["page"].close()
        except Exception:
            pass
        try:
            await warm["context"].close()
        except Exception:
            pass

    # Clear all tracking state
    _session_last_active.clear()
    _frame_ack_times.clear()
    _stream_quality.clear()
    _downloads.clear()
    _chrome_win_cache.clear()

    # Close and reinitialize browser
    if _browser:
        try:
            await _browser.close()
        except Exception:
            pass
        _browser = None
        _context = None

    # Pre-warm new browser + warm session
    try:
        await _get_browser()
        await _prewarm_session()
        print("[Wayfarer] Browser reset and pre-warmed")
    except Exception as e:
        print(f"[Wayfarer] Reset pre-warm failed: {e}")

    return {"status": "ok", "message": "All sessions closed, browser reset"}


@app.get("/downloads")
async def list_downloads():
    """List all downloaded files."""
    return {"downloads": _downloads}


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
        await _apply_stealth(page)
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
        await _apply_stealth(page)
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


@app.post("/session/{session_id}/screencast/pause")
async def screencast_pause(session_id: str):
    cdp = _cdp_sessions.get(session_id)
    if not cdp:
        raise HTTPException(404)
    try:
        cdp._screencasting = False
        await cdp.send("Page.stopScreencast")
    except Exception:
        pass
    return {"ok": True}


@app.post("/session/{session_id}/screencast/resume")
async def screencast_resume(session_id: str):
    cdp = _cdp_sessions.get(session_id)
    if not cdp:
        raise HTTPException(404)
    try:
        cdp._screencasting = True
        q = _stream_quality.get(session_id, 72)
        await cdp.send("Page.startScreencast", {
            "format": "jpeg", "quality": q,
            "maxWidth": 1280, "maxHeight": 800, "everyNthFrame": 1
        })
    except Exception:
        pass
    return {"ok": True}


# ══════════════════════════════════════════════════════════════
# ── Neuro Computer Agent REST API ──
# External AI bots can submit tasks for the browser agent to
# execute, poll for results, stream progress, and cancel.
# ══════════════════════════════════════════════════════════════

_start_time = _time.time()

# ── Rate limiting ──
_rate_limits: dict[str, list[float]] = defaultdict(list)
MAX_REQUESTS_PER_MINUTE = 30


def _check_rate_limit(client_ip: str) -> bool:
    now = _time.time()
    _rate_limits[client_ip] = [t for t in _rate_limits[client_ip] if now - t < 60]
    if len(_rate_limits[client_ip]) >= MAX_REQUESTS_PER_MINUTE:
        return False
    _rate_limits[client_ip].append(now)
    return True


# ── API key auth (optional, off by default) ──
_NEURO_API_KEY = os.getenv("NEURO_API_KEY", "")


async def _verify_api_key(request: Request):
    if not _NEURO_API_KEY:
        return
    key = request.headers.get("Authorization", "").replace("Bearer ", "")
    if key != _NEURO_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


# ── Task models ──

class TaskRequest(BaseModel):
    goal: str
    callback_url: str | None = None
    timeout: int = 300
    session_id: str | None = None


class TaskResponse(BaseModel):
    task_id: str
    status: str  # "queued" | "running" | "done" | "error"


class TaskStepInfo(BaseModel):
    ts: float
    description: str


class TaskStatus(BaseModel):
    task_id: str
    status: str
    progress: list[TaskStepInfo]
    result: str | None = None
    error: str | None = None
    screenshots: list[str]  # base64
    elapsed_seconds: float


# ── Task queue internals ──

_task_queue: asyncio.Queue = asyncio.Queue(maxsize=100)
_tasks: OrderedDict[str, dict] = OrderedDict()
_task_events: dict[str, list] = {}  # task_id -> list of event dicts for WS streaming
_MAX_CONCURRENT_TASKS = 3
_TASK_MAX_AGE = 3600  # prune tasks older than 1 hour


def _add_task_event(task_id: str, event: dict):
    """Append an event to the task's event stream."""
    if task_id not in _task_events:
        _task_events[task_id] = []
    _task_events[task_id].append(event)
    # Also update progress list on the task
    task = _tasks.get(task_id)
    if task and event.get("type") in ("step_start", "step_done", "action"):
        task["progress"].append({
            "ts": event.get("ts", _time.time()),
            "description": event.get("description", event.get("type", "")),
        })


async def _call_ollama(model: str, prompt: str, system: str = "", images: list = None,
                       num_predict: int = 300) -> str:
    """Call Ollama and return the response text. Strips <think> tags from output."""
    body = {
        "model": model,
        "prompt": prompt,
        "system": system,
        "stream": False,
        "think": False,
        "options": {"num_predict": num_predict, "temperature": 0.3},
    }
    if images:
        body["images"] = images
    try:
        async with httpx.AsyncClient(timeout=60) as client:
            resp = await client.post(f"{OLLAMA_HOST}/api/generate", json=body)
            data = resp.json()
            raw = data.get("response", "")
            # Strip <think>...</think> tags
            import re
            return re.sub(r"<think>[\s\S]*?</think>", "", raw).strip()
    except Exception as e:
        print(f"[Agent] Ollama call failed ({model}): {e}")
        return ""


def _extract_json_array(text: str) -> list | None:
    """Extract the first JSON array from text."""
    start = text.find("[")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if esc:
            esc = False
            continue
        if ch == "\\" and in_str:
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "[":
            depth += 1
        elif ch == "]":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except Exception:
                    return None
    return None


def _extract_json_object(text: str) -> dict | None:
    """Extract the first JSON object from text."""
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    in_str = False
    esc = False
    for i in range(start, len(text)):
        ch = text[i]
        if esc:
            esc = False
            continue
        if ch == "\\" and in_str:
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except Exception:
                    return None
    return None


async def _agent_decompose_goal(goal: str) -> list[dict]:
    """Break a goal into phases. SIMPLE=1 phase, COMPLEX=2-5 phases."""
    system = """You are a task decomposer. Given a user goal, decide if it needs multiple phases.

SIMPLE (1 phase): direct actions like "click X", "go to URL", "scroll down", "type text", "what time is it"
COMPLEX (2-5 phases): research, multi-page browsing, comparing things, finding specific info across sites

For COMPLEX, output phases as a JSON array:
[{"instruction":"Search for vitamin c competitors","type":"browse"},
 {"instruction":"Visit the top 3 results","type":"browse"},
 {"instruction":"Summarize findings","type":"summarize"}]

Valid types: "action", "browse", "summarize", "research"

For SIMPLE, output: [{"instruction":"<the goal>","type":"action"}]

ALWAYS output a JSON array. 1-5 phases."""

    result = await _call_ollama(
        model="qwen3.5:4b",
        prompt=f"Goal: {goal}",
        system=system,
        num_predict=300,
    )
    phases = _extract_json_array(result)
    if phases and len(phases) > 0:
        return phases[:5]
    return [{"instruction": goal, "type": "action"}]


async def _agent_create_plan(instruction: str, screenshot_b64: str = None) -> list[dict]:
    """Create 2-3 concrete steps for a phase."""
    searxng_base = os.getenv("SEARXNG_URL", "http://localhost:8888")
    system = f"""You are a browser automation planner. Create 2-3 concrete steps.
Each step must be ONE browser action: click, type, scroll, navigate, read.
Under 15 words per step. Include full URLs when navigating.

SEARCH QUERIES:
When the user wants to search for something, extract a clean query.
"can u look up what time it is" -> navigate to {searxng_base}/search?q=current+time
"what's the weather in amsterdam" -> navigate to {searxng_base}/search?q=weather+amsterdam
"find vitamin c serum reviews" -> navigate to {searxng_base}/search?q=vitamin+c+serum+reviews

CRITICAL: Use {searxng_base}/search?q=<query> for searches. URL-encode the query with + for spaces.
{"You have a screenshot of the current screen. Base your plan on what you SEE." if screenshot_b64 else ""}

Return JSON array only:
[{{"instruction":"Navigate to {searxng_base}/search?q=current+time","expectedState":"Search results page loaded"}}]

Maximum 3 steps. Fewer is better. Each instruction must be a single concrete action."""

    prompt = f"Task: {instruction}"
    images = [screenshot_b64] if screenshot_b64 else None

    result = await _call_ollama(
        model="qwen3.5:4b",
        prompt=prompt,
        system=system,
        images=images,
        num_predict=300,
    )
    steps = _extract_json_array(result)
    if steps and len(steps) > 0:
        return [s for s in steps if isinstance(s, dict) and "instruction" in s][:5]
    return [{"instruction": instruction, "expectedState": "Done"}]


async def _agent_execute_step(page, step: dict, task_id: str, max_iterations: int = 20) -> dict:
    """Run the executor loop for a single step. Screenshot -> decide action -> execute -> repeat."""
    instruction = step.get("instruction", "")
    action_history = []
    result_text = ""
    screenshots = []
    session_id = ""  # for _human_click

    system_prompt = f"""You are a browser automation executor. Your current step: {instruction}

Look at the screenshot and decide ONE action. Respond with JSON only.
Actions:
- browser_click: {{"action":"browser_click","x":450,"y":230,"screenState":"..."}}
- browser_type: {{"action":"browser_type","x":450,"y":230,"text":"hello","screenState":"..."}}
- browser_scroll: {{"action":"browser_scroll","direction":"down","amount":300,"screenState":"..."}}
- browser_navigate: {{"action":"browser_navigate","url":"http://...","screenState":"..."}}
- browser_press: {{"action":"browser_press","key":"Enter","screenState":"..."}}
- done: {{"action":"done","result":"The answer is..."}}

When done, include a clear result describing what you found or accomplished.
Respond with a single JSON object only. No explanation."""

    iteration = 0
    for iteration in range(1, max_iterations + 1):
        # Take screenshot
        try:
            screenshot_bytes = await page.screenshot(type="jpeg", quality=70)
            screenshot_b64 = base64.b64encode(screenshot_bytes).decode()
            screenshots.append(screenshot_b64)
        except Exception as e:
            action_history.append(f"[{iteration}] Screenshot failed: {e}")
            _add_task_event(task_id, {"type": "action", "ts": _time.time(),
                                      "description": f"Iter {iteration}: screenshot failed"})
            continue

        # Soft nudges
        nudge = ""
        if iteration == 10:
            nudge = "\nNote: You have been working for 10 iterations. If stuck, declare done with what you have."
        elif iteration == 15:
            nudge = "\nWrap up now. Declare done with your current findings."

        history_text = "\n".join(action_history[-5:])
        prompt = f"Screenshot attached. Recent actions:\n{history_text}\n{nudge}\nWhat is your next action? JSON only."

        # Call vision model
        response = await _call_ollama(
            model="qwen3.5:4b",
            prompt=prompt,
            system=system_prompt,
            images=[screenshot_b64],
            num_predict=300,
        )

        # Parse action JSON
        action = _extract_json_object(response)

        if not action:
            action_history.append(f"[{iteration}] Failed to parse action")
            _add_task_event(task_id, {"type": "action", "ts": _time.time(),
                                      "description": f"Iter {iteration}: parse failed"})
            continue

        action_type = action.get("action", "")
        _add_task_event(task_id, {"type": "action", "ts": _time.time(),
                                  "description": f"Iter {iteration}: {action_type}"})

        # Execute action
        if action_type == "done":
            result_text = action.get("result", "Step completed")
            action_history.append(f"[{iteration}] done: {result_text}")
            break

        elif action_type == "browser_click":
            x, y = action.get("x", 640), action.get("y", 400)
            try:
                await _human_click(page, float(x), float(y), session_id)
            except Exception as e:
                action_history.append(f"[{iteration}] click({x},{y}) failed: {e}")
                continue
            action_history.append(f"[{iteration}] click({x},{y})")

        elif action_type == "browser_type":
            text = action.get("text", "")
            x, y = action.get("x"), action.get("y")
            if x is not None and y is not None:
                try:
                    await _human_click(page, float(x), float(y), session_id)
                    await asyncio.sleep(0.3)
                except Exception:
                    pass
            await _human_type(page, text)
            action_history.append(f"[{iteration}] type '{text[:30]}'")

        elif action_type == "browser_navigate":
            url = action.get("url", "")
            if url:
                try:
                    await page.goto(url, wait_until="domcontentloaded", timeout=15000)
                    await asyncio.sleep(0.5)
                    await _dismiss_popups(page)
                except Exception as e:
                    action_history.append(f"[{iteration}] navigate failed: {e}")
                    continue
            action_history.append(f"[{iteration}] navigate {url[:60]}")

        elif action_type == "browser_scroll":
            direction = action.get("direction", "down")
            amount = action.get("amount", 300)
            try:
                await _human_scroll(page, float(amount), direction)
            except Exception:
                pass
            action_history.append(f"[{iteration}] scroll {direction} {amount}px")

        elif action_type == "browser_press":
            key = action.get("key", "Enter")
            try:
                await page.keyboard.press(key)
            except Exception:
                pass
            action_history.append(f"[{iteration}] press {key}")

        else:
            action_history.append(f"[{iteration}] unknown: {action_type}")

        # Brief pause between actions
        await asyncio.sleep(0.3)

    if not result_text:
        # Extract page text as fallback result
        try:
            text = await page.evaluate("document.body.innerText")
            result_text = text[:2000] if text else "Step completed (no explicit result)"
        except Exception:
            result_text = "Step completed"

    return {
        "success": True,
        "result": result_text,
        "screenshots": screenshots,
        "iterations": iteration,
    }


async def _agent_run_full(goal: str, page, task_id: str, timeout: float = 300) -> dict:
    """Run the full planner -> executor -> synthesis pipeline server-side."""
    start_time = _time.time()
    all_results = []
    all_screenshots = []

    # Phase 1: Decompose goal
    _add_task_event(task_id, {"type": "step_start", "ts": _time.time(), "description": "Decomposing goal"})
    phases = await _agent_decompose_goal(goal)
    _add_task_event(task_id, {"type": "step_done", "ts": _time.time(),
                              "description": f"Decomposed into {len(phases)} phase(s)"})

    # Phase 2: Execute each phase
    for i, phase in enumerate(phases):
        phase_instruction = phase.get("instruction", goal)
        phase_type = phase.get("type", "action")
        max_iter = {"research": 30, "browse": 25, "summarize": 15, "action": 15}.get(phase_type, 20)

        _add_task_event(task_id, {"type": "step_start", "ts": _time.time(),
                                  "description": f"Phase {i + 1}/{len(phases)}: {phase_instruction[:80]}"})

        # Take screenshot for planning context
        screenshot_b64 = None
        try:
            shot = await page.screenshot(type="jpeg", quality=70)
            screenshot_b64 = base64.b64encode(shot).decode()
        except Exception:
            pass

        # Create plan for this phase
        steps = await _agent_create_plan(phase_instruction, screenshot_b64)
        _add_task_event(task_id, {"type": "action", "ts": _time.time(),
                                  "description": f"Plan: {len(steps)} step(s) - " +
                                  ", ".join(s.get("instruction", "")[:40] for s in steps)})

        # Execute each step
        for j, step in enumerate(steps):
            step_instruction = step.get("instruction", "")
            _add_task_event(task_id, {"type": "step_start", "ts": _time.time(),
                                      "description": f"Step {j + 1}/{len(steps)}: {step_instruction[:60]}"})

            result = await _agent_execute_step(page, step, task_id, max_iterations=max_iter)
            all_results.append(result)
            all_screenshots.extend(result.get("screenshots", []))

            _add_task_event(task_id, {
                "type": "step_done", "ts": _time.time(),
                "description": f"Step {j + 1}: {result.get('result', '')[:200]}",
            })

            # Check timeout
            if _time.time() - start_time > timeout:
                _add_task_event(task_id, {"type": "action", "ts": _time.time(),
                                          "description": "Timeout reached, stopping"})
                break

        _add_task_event(task_id, {"type": "step_done", "ts": _time.time(),
                                  "description": f"Phase {i + 1} complete"})

        if _time.time() - start_time > timeout:
            break

    # Phase 3: Synthesize answer from all step results
    _add_task_event(task_id, {"type": "step_start", "ts": _time.time(), "description": "Synthesizing answer"})
    findings = "\n".join([r.get("result", "") for r in all_results if r.get("result")])

    answer = await _call_ollama(
        model="qwen3.5:2b",
        prompt=(
            f"The user asked: {goal}\n\n"
            f"Here is what was found:\n{findings[:3000]}\n\n"
            f"Provide a clear, direct answer. Be concise and helpful. "
            f"If the task was an action (not a question), confirm what was done."
        ),
        system="You are a helpful assistant summarizing the results of a computer automation task. "
               "Answer directly and concisely. Do not use emojis.",
        num_predict=300,
    )

    if not answer or len(answer) < 5:
        answer = findings[:1000] if findings else "Task completed but no explicit result was captured."

    _add_task_event(task_id, {"type": "answer", "ts": _time.time(), "description": answer[:200]})

    return {
        "success": True,
        "answer": answer,
        "results": all_results,
        "screenshots": all_screenshots[-5:],  # last 5 screenshots
        "elapsed": _time.time() - start_time,
    }


async def _execute_task(task: dict):
    """Execute a browser task using the full planner -> executor -> vision agent pipeline.

    Opens a browser session, decomposes the goal into phases, plans concrete steps,
    executes them with a vision-guided action loop, then synthesizes a final answer.
    """
    task_id = task["task_id"]
    goal = task["goal"]
    timeout = task.get("timeout", 300)
    session_id = task.get("session_id")

    _add_task_event(task_id, {"type": "step_start", "ts": _time.time(), "description": "Opening browser session"})

    page = None
    context = None
    reused_session = False

    try:
        # Reuse existing session if provided
        if session_id and session_id in _active_pages:
            session = _active_pages[session_id]
            page = session["page"]
            context = session["context"]
            reused_session = True
            _add_task_event(task_id, {"type": "step_done", "ts": _time.time(),
                                      "description": f"Reusing session {session_id}"})
        else:
            # Create a fresh isolated session
            browser = await _get_browser()
            ctx_kwargs = dict(_CONTEXT_KWARGS)
            ctx_kwargs["viewport"] = {"width": 1280, "height": 800}
            context = await browser.new_context(**ctx_kwargs)
            await context.add_init_script(STEALTH_SCRIPT)
            page = await context.new_page()
            await _apply_stealth(page)
            await page.set_viewport_size({"width": 1280, "height": 800})
            # Navigate to blank so page is ready
            try:
                await page.goto("about:blank", wait_until="domcontentloaded", timeout=5000)
            except Exception:
                pass
            _add_task_event(task_id, {"type": "step_done", "ts": _time.time(),
                                      "description": "Browser session opened"})

        # Run the full agent pipeline
        result = await _agent_run_full(goal, page, task_id, timeout=timeout)

        task["screenshots"] = result.get("screenshots", [])
        return result["answer"]

    finally:
        # Close context only if we created it (not reusing an existing session)
        if not reused_session and context:
            try:
                await page.close()
            except Exception:
                pass
            try:
                await context.close()
            except Exception:
                pass


async def _task_worker():
    """Background worker that processes tasks from the queue."""
    while True:
        task = await _task_queue.get()
        task_id = task["task_id"]
        try:
            task["status"] = "running"
            task["started_at"] = _time.time()

            result = await asyncio.wait_for(
                _execute_task(task),
                timeout=task.get("timeout", 300),
            )
            task["status"] = "done"
            task["result"] = result

            # Call webhook if provided
            if task.get("callback_url"):
                try:
                    async with httpx.AsyncClient(timeout=10) as client:
                        await client.post(task["callback_url"], json={
                            "task_id": task_id,
                            "status": "done",
                            "result": result,
                        })
                except Exception as e:
                    print(f"[Neuro API] Webhook failed for {task_id}: {e}")

        except asyncio.TimeoutError:
            task["status"] = "error"
            task["error"] = f"Task timed out after {task.get('timeout', 300)}s"
            _add_task_event(task_id, {"type": "error", "ts": _time.time(), "description": task["error"]})
        except asyncio.CancelledError:
            task["status"] = "error"
            task["error"] = "Task cancelled"
            _add_task_event(task_id, {"type": "error", "ts": _time.time(), "description": "Task cancelled"})
        except Exception as e:
            task["status"] = "error"
            task["error"] = str(e)
            _add_task_event(task_id, {"type": "error", "ts": _time.time(), "description": str(e)})
        finally:
            task["completed_at"] = _time.time()
            _task_queue.task_done()


async def _cleanup_old_tasks():
    """Prune tasks older than _TASK_MAX_AGE from the store."""
    while True:
        await asyncio.sleep(300)  # check every 5 minutes
        now = _time.time()
        to_remove = [
            tid for tid, t in list(_tasks.items())
            if t.get("completed_at") and now - t["completed_at"] > _TASK_MAX_AGE
        ]
        for tid in to_remove:
            _tasks.pop(tid, None)
            _task_events.pop(tid, None)
            # Cancel the asyncio task if it's somehow still tracked
            handle = _task_handles.pop(tid, None)
            if handle and not handle.done():
                handle.cancel()


_task_handles: dict[str, asyncio.Task] = {}  # task_id -> asyncio.Task for cancellation


# ── API Endpoints ──
#
# NOTE: These /api/task endpoints provide a simplified server-side task queue
# that runs Playwright browser sessions. The FULL computer agent pipeline
# (goal decomposition, vision-guided planning, step execution with retries,
# file operations, memory persistence) runs CLIENT-SIDE in TypeScript.
#
# For the full pipeline, use runComputerTool() from src/utils/computerTool.ts.
# That interface provides: goal -> answer + files + screenshots, with progress
# callbacks, VFS file operations, and IndexedDB persistence.
#
# This server-side endpoint is useful for:
# - Headless/API-only task execution without a frontend
# - Simple browser automation tasks that don't need the full agent loop
# - Integration with external systems via REST API + WebSocket streaming

@app.post("/api/task", response_model=TaskResponse)
async def submit_task(req: TaskRequest, request: Request):
    """Submit a task for the computer agent to execute. Returns immediately with a task_id."""
    await _verify_api_key(request)
    if not _check_rate_limit(request.client.host if request.client else "unknown"):
        raise HTTPException(status_code=429, detail="Rate limit exceeded")

    task_id = str(uuid.uuid4())
    task = {
        "task_id": task_id,
        "goal": req.goal,
        "callback_url": req.callback_url,
        "timeout": req.timeout,
        "session_id": req.session_id,
        "status": "queued",
        "progress": [],
        "result": None,
        "error": None,
        "screenshots": [],
        "created_at": _time.time(),
        "started_at": None,
        "completed_at": None,
    }
    _tasks[task_id] = task
    _task_events[task_id] = []

    try:
        _task_queue.put_nowait(task)
    except asyncio.QueueFull:
        task["status"] = "error"
        task["error"] = "Task queue is full (max 100). Try again later."
        raise HTTPException(status_code=503, detail="Task queue full")

    return TaskResponse(task_id=task_id, status="queued")


@app.get("/api/task/{task_id}", response_model=TaskStatus)
async def get_task(task_id: str, request: Request):
    """Check task status and retrieve results."""
    await _verify_api_key(request)
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    now = _time.time()
    started = task.get("started_at") or task.get("created_at", now)
    ended = task.get("completed_at") or now
    elapsed = ended - started if task["status"] in ("done", "error") else now - started

    return TaskStatus(
        task_id=task_id,
        status=task["status"],
        progress=[TaskStepInfo(**s) for s in task.get("progress", [])],
        result=task.get("result"),
        error=task.get("error"),
        screenshots=task.get("screenshots", []),
        elapsed_seconds=round(elapsed, 2),
    )


@app.delete("/api/task/{task_id}")
async def cancel_task(task_id: str, request: Request):
    """Cancel a running or queued task."""
    await _verify_api_key(request)
    task = _tasks.get(task_id)
    if not task:
        raise HTTPException(status_code=404, detail=f"Task {task_id} not found")

    if task["status"] in ("done", "error"):
        return {"task_id": task_id, "status": task["status"], "message": "Task already finished"}

    task["status"] = "error"
    task["error"] = "Cancelled by user"
    task["completed_at"] = _time.time()
    _add_task_event(task_id, {"type": "error", "ts": _time.time(), "description": "Cancelled by user"})

    # Cancel the asyncio task handle if tracked
    handle = _task_handles.pop(task_id, None)
    if handle and not handle.done():
        handle.cancel()

    return {"task_id": task_id, "status": "error", "message": "Task cancelled"}


@app.get("/api/tasks")
async def list_tasks(request: Request):
    """List all tasks (active + recent)."""
    await _verify_api_key(request)
    now = _time.time()
    tasks_out = []
    for tid, t in list(_tasks.items()):
        started = t.get("started_at") or t.get("created_at", now)
        ended = t.get("completed_at") or now
        elapsed = ended - started if t["status"] in ("done", "error") else now - started
        tasks_out.append({
            "task_id": tid,
            "goal": t.get("goal", ""),
            "status": t["status"],
            "elapsed_seconds": round(elapsed, 2),
            "created_at": t.get("created_at"),
            "completed_at": t.get("completed_at"),
            "has_result": t.get("result") is not None,
            "has_error": t.get("error") is not None,
        })
    return {"tasks": tasks_out, "total": len(tasks_out)}


@app.websocket("/api/task/{task_id}/stream")
async def stream_task(websocket: WebSocket, task_id: str):
    """Stream task progress events in real-time via WebSocket.

    Events: step_start, step_done, screenshot, action, answer, error
    """
    task = _tasks.get(task_id)
    if not task:
        await websocket.close(code=4004, reason="Task not found")
        return

    await websocket.accept()

    # Send any events that already happened (catchup)
    sent_idx = 0
    existing = _task_events.get(task_id, [])
    for evt in existing:
        try:
            await websocket.send_json(evt)
            sent_idx += 1
        except Exception:
            return

    # Stream new events as they arrive
    try:
        while task["status"] in ("queued", "running"):
            await asyncio.sleep(0.3)
            events = _task_events.get(task_id, [])
            while sent_idx < len(events):
                try:
                    await websocket.send_json(events[sent_idx])
                    sent_idx += 1
                except Exception:
                    return

        # Send any remaining events after completion
        events = _task_events.get(task_id, [])
        while sent_idx < len(events):
            try:
                await websocket.send_json(events[sent_idx])
                sent_idx += 1
            except Exception:
                return

        # Final status message
        await websocket.send_json({
            "type": "done",
            "ts": _time.time(),
            "status": task["status"],
            "result": task.get("result"),
            "error": task.get("error"),
        })
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass


@app.get("/api/health")
async def api_health():
    """Enhanced health endpoint with task queue stats."""
    return {
        "status": "ok",
        "active_tasks": sum(1 for t in _tasks.values() if t["status"] == "running"),
        "queued_tasks": _task_queue.qsize(),
        "total_tasks": len(_tasks),
        "total_sessions": len(_active_pages),
        "uptime_seconds": round(_time.time() - _start_time, 1),
        "max_concurrent_tasks": _MAX_CONCURRENT_TASKS,
        "rate_limit_per_minute": MAX_REQUESTS_PER_MINUTE,
        "auth_required": bool(_NEURO_API_KEY),
    }


@app.get("/api/tool-schema")
async def tool_schema():
    """Return an MCP/OpenAI-compatible tool definition for the computer agent."""
    return {
        "name": "computer_agent",
        "description": (
            "Use a computer with a browser to research, navigate websites, fill forms, "
            "click buttons, and extract information. For complex tasks that require "
            "browsing the web, interacting with websites, or finding specific information online."
        ),
        "inputSchema": {
            "type": "object",
            "properties": {
                "goal": {
                    "type": "string",
                    "description": (
                        "What you want the computer agent to do. Be specific. "
                        "Examples: 'Find the current time', "
                        "'Research vitamin C competitors and list the top 5', "
                        "'Go to github.com and star the first trending repo'"
                    ),
                },
                "timeout": {
                    "type": "number",
                    "description": "Maximum seconds to spend on the task. Default 300.",
                    "default": 300,
                },
            },
            "required": ["goal"],
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8889)

# ── SearXNG proxy (avoids CORS) ──────────────────────────────────────────────
@app.get("/api/search")
async def search_proxy(q: str = "", format: str = "json"):
    """Proxy SearXNG search to avoid browser CORS issues."""
    searxng = os.getenv("SEARXNG_URL", "http://localhost:8888")
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{searxng}/search", params={"q": q, "format": format})
            return resp.json()
    except Exception as e:
        return {"results": [], "error": str(e)}
