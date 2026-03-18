/**
 * Page Readiness Detection — network-aware waiting system for browser automation.
 *
 * Detects when a page is actually ready for interaction: content rendered,
 * animations settled, and network quiet. Non-blocking — always proceeds
 * after timeout, never fails.
 */

import { sandboxService } from './sandboxService';

// ── Types ──

export interface PageReadiness {
  domReady: boolean;
  networkIdle: boolean;
  noSpinners: boolean;
  noSkeletons: boolean;
  contentVisible: boolean;
  score: number; // 0-100, 100 = fully ready
  details: string;
}

export interface WaitOptions {
  timeout?: number;       // max wait ms, default 10000
  minScore?: number;      // min readiness score to proceed, default 80
  pollInterval?: number;  // check interval ms, default 300
  signal?: AbortSignal;
}

// ── Helpers ──

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) { resolve(); return; }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => { clearTimeout(timer); resolve(); }, { once: true });
  });
}

// ── Core: checkPageReadiness ──

export async function checkPageReadiness(): Promise<PageReadiness> {
  const js = `
    (function() {
      // 1. DOM ready
      var domReady = document.readyState === 'complete';

      // 2. Network idle — check for recent incomplete resources
      var networkIdle = true;
      try {
        var entries = performance.getEntriesByType('resource');
        var now = performance.now();
        var recentPending = entries.filter(function(e) {
          return e.responseEnd === 0 && (now - e.startTime) < 5000;
        });
        if (recentPending.length > 0) networkIdle = false;
      } catch(e) {}

      // 3. No spinners
      var spinnerSelectors = [
        '[class*="spinner"]', '[class*="Spinner"]',
        '[class*="loading"]', '[class*="Loading"]',
        '[aria-busy="true"]',
        '[class*="shimmer"]', '[class*="Shimmer"]',
        '.loader', '.Loader',
        '[role="progressbar"]',
        '[class*="pulse"]'
      ];
      var spinnerCount = 0;
      spinnerSelectors.forEach(function(sel) {
        try {
          var els = document.querySelectorAll(sel);
          els.forEach(function(el) {
            var style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
              spinnerCount++;
            }
          });
        } catch(e) {}
      });
      var noSpinners = spinnerCount === 0;

      // 4. No skeletons
      var skeletonSelectors = [
        '[class*="skeleton"]', '[class*="Skeleton"]',
        '[class*="placeholder"]', '[class*="Placeholder"]',
        '[class*="ghost"]', '[class*="Ghost"]'
      ];
      var skeletonCount = 0;
      skeletonSelectors.forEach(function(sel) {
        try {
          var els = document.querySelectorAll(sel);
          els.forEach(function(el) {
            var style = window.getComputedStyle(el);
            if (style.display !== 'none' && style.visibility !== 'hidden') {
              skeletonCount++;
            }
          });
        } catch(e) {}
      });
      var noSkeletons = skeletonCount === 0;

      // 5. Content visible — main area has text
      var contentVisible = false;
      var mainSelectors = ['main', '[role="main"]', '#content', '#app', '.content', 'article', 'body'];
      for (var i = 0; i < mainSelectors.length; i++) {
        try {
          var el = document.querySelector(mainSelectors[i]);
          if (el && el.innerText && el.innerText.trim().length > 50) {
            contentVisible = true;
            break;
          }
        } catch(e) {}
      }

      // Score: DOM 20, network 30, spinners 20, skeletons 15, content 15
      var score = 0;
      if (domReady) score += 20;
      if (networkIdle) score += 30;
      if (noSpinners) score += 20;
      if (noSkeletons) score += 15;
      if (contentVisible) score += 15;

      var details = [];
      if (!domReady) details.push('DOM not ready');
      if (!networkIdle) details.push('network active');
      if (!noSpinners) details.push(spinnerCount + ' spinner(s)');
      if (!noSkeletons) details.push(skeletonCount + ' skeleton(s)');
      if (!contentVisible) details.push('no visible content');

      return JSON.stringify({
        domReady: domReady,
        networkIdle: networkIdle,
        noSpinners: noSpinners,
        noSkeletons: noSkeletons,
        contentVisible: contentVisible,
        score: score,
        details: details.length > 0 ? details.join(', ') : 'page ready'
      });
    })()
  `;

  try {
    const resp = await sandboxService.consoleExec(js);
    if (resp.error || !resp.result) {
      return fallbackReadiness(resp.error || 'no result');
    }
    // result may be JSON string or double-encoded
    let raw = resp.result;
    if (raw.startsWith('"') && raw.endsWith('"')) {
      raw = JSON.parse(raw);
    }
    return JSON.parse(raw) as PageReadiness;
  } catch (e) {
    return fallbackReadiness(String(e));
  }
}

function fallbackReadiness(reason: string): PageReadiness {
  return {
    domReady: false,
    networkIdle: false,
    noSpinners: true,
    noSkeletons: true,
    contentVisible: false,
    score: 35,
    details: `readiness check failed: ${reason}`,
  };
}

// ── waitForReady ──

export async function waitForReady(options?: WaitOptions): Promise<PageReadiness> {
  const timeout = options?.timeout ?? 10000;
  const minScore = options?.minScore ?? 80;
  const pollInterval = options?.pollInterval ?? 300;
  const signal = options?.signal;

  const deadline = Date.now() + timeout;
  let readiness = await checkPageReadiness();

  while (readiness.score < minScore && Date.now() < deadline) {
    if (signal?.aborted) break;
    await sleep(pollInterval, signal);
    if (signal?.aborted) break;
    readiness = await checkPageReadiness();
  }

  return readiness;
}

// ── waitForNetworkIdle ──

export async function waitForNetworkIdle(timeoutMs = 8000): Promise<boolean> {
  // Inject a fetch/XHR interceptor that tracks active requests
  const interceptorJs = `
    (function() {
      if (window.__netIdleTracker) return 'already_installed';

      window.__netIdleTracker = { active: 0, lastActivity: Date.now() };

      // Intercept fetch
      var origFetch = window.fetch;
      window.fetch = function() {
        window.__netIdleTracker.active++;
        window.__netIdleTracker.lastActivity = Date.now();
        return origFetch.apply(this, arguments).finally(function() {
          window.__netIdleTracker.active--;
          window.__netIdleTracker.lastActivity = Date.now();
        });
      };

      // Intercept XHR
      var origOpen = XMLHttpRequest.prototype.open;
      var origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function() {
        this.__tracked = true;
        return origOpen.apply(this, arguments);
      };
      XMLHttpRequest.prototype.send = function() {
        if (this.__tracked) {
          window.__netIdleTracker.active++;
          window.__netIdleTracker.lastActivity = Date.now();
          this.addEventListener('loadend', function() {
            window.__netIdleTracker.active--;
            window.__netIdleTracker.lastActivity = Date.now();
          });
        }
        return origSend.apply(this, arguments);
      };

      return 'installed';
    })()
  `;

  try {
    await sandboxService.consoleExec(interceptorJs);
  } catch {
    // If interceptor fails, fall back to resource timing check
    return (await checkPageReadiness()).networkIdle;
  }

  const checkJs = `
    (function() {
      var t = window.__netIdleTracker;
      if (!t) return JSON.stringify({ active: 0, quietMs: 9999 });
      return JSON.stringify({ active: t.active, quietMs: Date.now() - t.lastActivity });
    })()
  `;

  const deadline = Date.now() + timeoutMs;
  const quietThreshold = 500; // idle for 500ms = network idle

  while (Date.now() < deadline) {
    try {
      const resp = await sandboxService.consoleExec(checkJs);
      if (resp.result) {
        let raw = resp.result;
        if (raw.startsWith('"') && raw.endsWith('"')) raw = JSON.parse(raw);
        const state = JSON.parse(raw);
        if (state.active === 0 && state.quietMs >= quietThreshold) {
          return true;
        }
      }
    } catch {
      // continue polling
    }
    await sleep(200);
  }

  return false; // timed out
}

// ── waitForElement ──

export async function waitForElement(
  selector: string,
  options?: { timeout?: number; visible?: boolean },
): Promise<boolean> {
  const timeout = options?.timeout ?? 10000;
  const mustBeVisible = options?.visible ?? false;
  const deadline = Date.now() + timeout;

  // Escape selector for JS string
  const escapedSel = selector.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  while (Date.now() < deadline) {
    const js = mustBeVisible
      ? `(function() {
          var el = document.querySelector('${escapedSel}');
          if (!el) return 'false';
          var r = el.getBoundingClientRect();
          var s = window.getComputedStyle(el);
          return String(r.width > 0 && r.height > 0 && s.display !== 'none' && s.visibility !== 'hidden');
        })()`
      : `String(!!document.querySelector('${escapedSel}'))`;

    try {
      const resp = await sandboxService.consoleExec(js);
      if (resp.result === 'true' || resp.result === '"true"') return true;
    } catch {
      // continue polling
    }
    await sleep(300);
  }

  return false; // timed out
}

// ── waitForNavigation ──

export async function waitForNavigation(
  options?: { timeout?: number },
): Promise<{ url: string; title: string }> {
  const timeout = options?.timeout ?? 10000;

  // Capture current URL
  const currentJs = `JSON.stringify({ url: location.href, title: document.title })`;
  let currentUrl = '';
  try {
    const resp = await sandboxService.consoleExec(currentJs);
    if (resp.result) {
      let raw = resp.result;
      if (raw.startsWith('"') && raw.endsWith('"')) raw = JSON.parse(raw);
      const parsed = JSON.parse(raw);
      currentUrl = parsed.url;
    }
  } catch {
    // best effort
  }

  const deadline = Date.now() + timeout;

  while (Date.now() < deadline) {
    await sleep(200);
    try {
      const resp = await sandboxService.consoleExec(currentJs);
      if (resp.result) {
        let raw = resp.result;
        if (raw.startsWith('"') && raw.endsWith('"')) raw = JSON.parse(raw);
        const parsed = JSON.parse(raw);
        if (parsed.url !== currentUrl) {
          return { url: parsed.url, title: parsed.title };
        }
      }
    } catch {
      // continue polling
    }
  }

  // Timed out — return current state
  return { url: currentUrl, title: '' };
}

// ── detectLoadingState ──

export async function detectLoadingState(): Promise<{ isLoading: boolean; indicators: string[] }> {
  const js = `
    (function() {
      var indicators = [];

      if (document.readyState !== 'complete') indicators.push('document loading (' + document.readyState + ')');

      var checks = [
        { sel: '[class*="spinner"]', name: 'spinner' },
        { sel: '[class*="Spinner"]', name: 'Spinner' },
        { sel: '[class*="loading"]', name: 'loading class' },
        { sel: '[class*="Loading"]', name: 'Loading class' },
        { sel: '[aria-busy="true"]', name: 'aria-busy' },
        { sel: '[class*="skeleton"]', name: 'skeleton' },
        { sel: '[class*="Skeleton"]', name: 'Skeleton' },
        { sel: '[class*="shimmer"]', name: 'shimmer' },
        { sel: '[role="progressbar"]', name: 'progress bar' },
        { sel: '.loader', name: 'loader' }
      ];

      checks.forEach(function(c) {
        try {
          var els = document.querySelectorAll(c.sel);
          var visible = 0;
          els.forEach(function(el) {
            var s = window.getComputedStyle(el);
            if (s.display !== 'none' && s.visibility !== 'hidden' && s.opacity !== '0') visible++;
          });
          if (visible > 0) indicators.push(visible + 'x ' + c.name);
        } catch(e) {}
      });

      return JSON.stringify({ isLoading: indicators.length > 0, indicators: indicators });
    })()
  `;

  try {
    const resp = await sandboxService.consoleExec(js);
    if (resp.result) {
      let raw = resp.result;
      if (raw.startsWith('"') && raw.endsWith('"')) raw = JSON.parse(raw);
      return JSON.parse(raw);
    }
  } catch {
    // fall through
  }

  return { isLoading: false, indicators: [] };
}
