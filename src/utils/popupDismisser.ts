/**
 * Popup Dismisser — Auto-detects and dismisses cookie banners, consent modals,
 * newsletter popups, notification prompts, and other overlays that block page interaction.
 *
 * Uses sandboxService.consoleExec() to inject JS that scans the DOM for common
 * popup patterns and attempts to dismiss them via button clicks, Escape key, or CSS hiding.
 */

import { sandboxService } from './sandboxService';

// ── Types ──

export interface DismissResult {
  found: boolean;
  dismissed: boolean;
  type: 'cookie' | 'newsletter' | 'notification' | 'modal' | 'overlay' | 'none';
  method: 'click_accept' | 'click_close' | 'click_dismiss' | 'press_escape' | 'remove_element' | 'none';
  elementText?: string;
}

interface ScanHit {
  type: DismissResult['type'];
  selector: string;
  /** Index into the scanned popup list (used for targeted dismiss) */
  popupIndex: number;
  /** Text of the best dismiss button found inside this popup, if any */
  buttonText: string | null;
  /** CSS selector path to the dismiss button, if found */
  buttonSelector: string | null;
  /** Outer text snippet of the popup for logging */
  snippet: string;
}

// ── JS Payloads ──

/**
 * Injected into the page to scan for visible popups/banners/modals.
 * Returns a JSON array of ScanHit-compatible objects.
 */
const SCAN_JS = `
(() => {
  const hits = [];

  // ── Helper: check if element is visible ──
  function isVisible(el) {
    if (!el || !el.getBoundingClientRect) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (parseFloat(style.opacity || '1') < 0.05) return false;
    return true;
  }

  // ── Helper: find a dismiss/accept button inside an element ──
  const BUTTON_PATTERNS = [
    /^accept\\s*all$/i,
    /^accept$/i,
    /^i\\s*agree$/i,
    /^agree$/i,
    /^allow\\s*all$/i,
    /^allow$/i,
    /^got\\s*it$/i,
    /^ok$/i,
    /^okay$/i,
    /^continue$/i,
    /^i\\s*understand$/i,
    /^close$/i,
    /^dismiss$/i,
    /^no\\s*thanks$/i,
    /^not\\s*now$/i,
    /^reject\\s*all$/i,
    /^reject$/i,
    /^decline$/i,
    /^maybe\\s*later$/i,
  ];

  const CLOSE_CHARS = ['\\u00d7', '\\u2715', '\\u2716', '\\u2573', 'X', 'x', '\\u2717'];

  function findDismissButton(container) {
    // Check buttons, links, and clickable elements
    const candidates = container.querySelectorAll(
      'button, a, [role="button"], input[type="button"], input[type="submit"], [class*="close"], [class*="dismiss"], [class*="accept"], [aria-label*="close"], [aria-label*="Close"], [aria-label*="dismiss"], [aria-label*="Dismiss"]'
    );

    let bestMatch = null;
    let bestPriority = 999;

    for (const el of candidates) {
      if (!isVisible(el)) continue;
      const text = (el.textContent || '').trim();
      const ariaLabel = (el.getAttribute('aria-label') || '').trim();
      const testText = text || ariaLabel;

      // Check close characters (X button)
      if (text.length <= 2) {
        for (const ch of CLOSE_CHARS) {
          if (text === ch || ariaLabel.toLowerCase() === 'close') {
            if (bestPriority > 50) {
              bestMatch = { el, text: testText, priority: 50 };
              bestPriority = 50;
            }
            break;
          }
        }
      }

      // Check text patterns
      for (let i = 0; i < BUTTON_PATTERNS.length; i++) {
        if (BUTTON_PATTERNS[i].test(testText)) {
          const priority = i; // lower index = higher priority (accept > close > reject)
          if (priority < bestPriority) {
            bestMatch = { el, text: testText, priority };
            bestPriority = priority;
          }
          break;
        }
      }
    }

    if (bestMatch) {
      // Build a selector path for the button
      const el = bestMatch.el;
      let selector = '';
      if (el.id) {
        selector = '#' + CSS.escape(el.id);
      } else {
        const tag = el.tagName.toLowerCase();
        const classes = Array.from(el.classList).slice(0, 2).map(c => '.' + CSS.escape(c)).join('');
        selector = tag + classes;
        // Add text content hint for uniqueness
        const text = (el.textContent || '').trim().slice(0, 30);
        if (text) selector += '[data-popup-dismiss-text]';
      }
      return { text: bestMatch.text, selector };
    }

    return null;
  }

  // ── Helper: classify popup type ──
  function classify(el) {
    const html = (el.outerHTML || '').slice(0, 500).toLowerCase();
    const id = (el.id || '').toLowerCase();
    const cls = (el.className && typeof el.className === 'string') ? el.className.toLowerCase() : '';

    if (/cookie|consent|gdpr|cookieconsent|cc-banner|cc_banner|onetrust|cookiebot|cookie.?law|cookie.?notice/.test(id + ' ' + cls + ' ' + html)) {
      return 'cookie';
    }
    if (/newsletter|subscribe|signup|sign.?up|email.?capture|mailing.?list/.test(id + ' ' + cls)) {
      // Confirm it has an email input
      if (el.querySelector('input[type="email"], input[placeholder*="email" i], input[name*="email" i]')) {
        return 'newsletter';
      }
    }
    if (/notification|alert|notice|announcement|promo.?bar|top.?bar|info.?bar/.test(id + ' ' + cls)) {
      return 'notification';
    }
    const role = el.getAttribute('role');
    if (role === 'dialog' || role === 'alertdialog') {
      // Could be cookie or newsletter or generic modal
      if (/cookie|consent|gdpr/.test(html)) return 'cookie';
      if (el.querySelector('input[type="email"]')) return 'newsletter';
      return 'modal';
    }
    return 'overlay';
  }

  // ── Scan: specific selectors ──
  const POPUP_SELECTORS = [
    '[class*="cookie"]', '[id*="cookie"]',
    '[class*="consent"]', '[id*="consent"]',
    '[class*="gdpr"]', '[id*="gdpr"]',
    '[class*="CookieConsent"]', '[id*="CookieConsent"]',
    '[class*="cookie-banner"]', '[class*="cookie_banner"]',
    '[class*="cc-banner"]', '[class*="cc_banner"]',
    '[id*="onetrust"]', '[class*="onetrust"]',
    '[id*="cookiebot"]', '[class*="cookiebot"]',
    '[class*="newsletter"]', '[id*="newsletter"]',
    '[class*="popup"]', '[id*="popup"]',
    '[class*="modal"]', '[id*="modal"]',
    '[class*="notification"]', '[id*="notification"]',
    '[class*="banner"]',
    '[role="dialog"]', '[role="alertdialog"]',
    '[class*="overlay"]', '[id*="overlay"]',
  ];

  const seen = new Set();

  for (const sel of POPUP_SELECTORS) {
    try {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        if (seen.has(el)) continue;
        // Skip tiny or invisible elements
        if (!isVisible(el)) continue;
        const rect = el.getBoundingClientRect();
        // Must be at least 80px in one dimension to be a real popup
        if (rect.width < 80 && rect.height < 40) continue;
        seen.add(el);

        const type = classify(el);
        const btn = findDismissButton(el);
        const snippet = (el.textContent || '').trim().slice(0, 100).replace(/\\s+/g, ' ');

        hits.push({
          type,
          selector: sel,
          popupIndex: hits.length,
          buttonText: btn ? btn.text : null,
          buttonSelector: btn ? btn.selector : null,
          snippet,
        });
      }
    } catch (e) {
      // Selector error — skip
    }
  }

  // ── Scan: large fixed/absolute overlays (>50% viewport) ──
  const allFixed = document.querySelectorAll('*');
  for (const el of allFixed) {
    if (seen.has(el)) continue;
    if (!isVisible(el)) continue;
    const style = window.getComputedStyle(el);
    const pos = style.position;
    if (pos !== 'fixed' && pos !== 'absolute') continue;
    const zIndex = parseInt(style.zIndex || '0', 10);
    if (zIndex < 100) continue;

    const rect = el.getBoundingClientRect();
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;
    const coverage = (rect.width * rect.height) / (vpW * vpH);
    if (coverage < 0.3) continue;

    // Skip body/html
    const tag = el.tagName.toLowerCase();
    if (tag === 'body' || tag === 'html') continue;

    seen.add(el);
    const type = classify(el);
    const btn = findDismissButton(el);
    const snippet = (el.textContent || '').trim().slice(0, 100).replace(/\\s+/g, ' ');

    hits.push({
      type,
      selector: '[large-overlay]',
      popupIndex: hits.length,
      buttonText: btn ? btn.text : null,
      buttonSelector: btn ? btn.selector : null,
      snippet,
    });
  }

  return JSON.stringify(hits);
})()
`;

/**
 * Injected JS to click a dismiss button found by the scanner.
 * Takes the popup index + button selector from the scan result.
 */
function makeDismissClickJS(hit: ScanHit): string {
  // Strategy: re-find the popup element by scanning the same selectors,
  // then find buttons inside it and click the one matching the text.
  return `
(() => {
  const BUTTON_TEXT = ${JSON.stringify(hit.buttonText)};

  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  // Find popup containers matching the original selector
  const popups = document.querySelectorAll(${JSON.stringify(hit.selector)});
  for (const popup of popups) {
    if (!isVisible(popup)) continue;
    const snippet = (popup.textContent || '').trim().slice(0, 100).replace(/\\s+/g, ' ');
    if (snippet !== ${JSON.stringify(hit.snippet)}) continue;

    // Found the popup — now find the button by text
    const btns = popup.querySelectorAll('button, a, [role="button"], input[type="button"], input[type="submit"], [class*="close"], [class*="dismiss"], [class*="accept"], [aria-label*="close"], [aria-label*="Close"]');
    for (const btn of btns) {
      if (!isVisible(btn)) continue;
      const text = (btn.textContent || '').trim();
      const ariaLabel = (btn.getAttribute('aria-label') || '').trim();
      if (text === BUTTON_TEXT || ariaLabel === BUTTON_TEXT) {
        btn.click();
        return JSON.stringify({ clicked: true, text: text || ariaLabel });
      }
    }
  }
  return JSON.stringify({ clicked: false });
})()
`;
}

/**
 * Injected JS to hide a popup element by adding display:none.
 */
function makeHideJS(hit: ScanHit): string {
  return `
(() => {
  function isVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }

  const popups = document.querySelectorAll(${JSON.stringify(hit.selector)});
  let hidden = 0;
  for (const popup of popups) {
    if (!isVisible(popup)) continue;
    const snippet = (popup.textContent || '').trim().slice(0, 100).replace(/\\s+/g, ' ');
    if (snippet === ${JSON.stringify(hit.snippet)}) {
      popup.style.setProperty('display', 'none', 'important');
      hidden++;
    }
  }
  // Also remove any backdrop/overlay siblings
  const backdrops = document.querySelectorAll('[class*="backdrop"], [class*="overlay-bg"], [class*="modal-backdrop"]');
  for (const bd of backdrops) {
    if (isVisible(bd)) {
      bd.style.setProperty('display', 'none', 'important');
      hidden++;
    }
  }
  // Restore body scroll in case popup locked it
  document.body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  return JSON.stringify({ hidden });
})()
`;
}

/**
 * CSS injected to preemptively hide common cookie/popup patterns.
 */
const PREVENTION_CSS = `
/* Popup Dismisser — prevention stylesheet */
[class*="cookie-banner"],
[class*="cookie_banner"],
[class*="cookieBanner"],
[id*="cookie-banner"],
[id*="cookie_banner"],
[class*="cc-banner"],
[class*="cc_banner"],
[id*="onetrust-banner"],
[id*="onetrust-consent"],
[class*="onetrust-pc"],
[id*="cookiebot"],
[class*="cookiebot"],
[id*="CybotCookiebotDialog"],
[class*="cookie-notice"],
[class*="cookie_notice"],
[id*="cookie-notice"],
[class*="cookie-consent"],
[class*="cookie_consent"],
[id*="cookie-consent"],
[class*="gdpr-banner"],
[class*="gdpr_banner"],
[id*="gdpr-banner"],
[class*="cookie-law"],
[id*="cookie-law"],
[class*="js-cookie"],
[class*="cookie-popup"],
[id*="cookie-popup"],
[class*="consent-banner"],
[id*="consent-banner"],
[class*="privacy-banner"],
[id*="privacy-banner"] {
  display: none !important;
  visibility: hidden !important;
  opacity: 0 !important;
  pointer-events: none !important;
  height: 0 !important;
  max-height: 0 !important;
  overflow: hidden !important;
}
`.trim();

// ── PopupDismisser Class ──

export class PopupDismisser {
  /**
   * Scan the current page for visible popups, banners, and modals.
   */
  async scan(): Promise<ScanHit[]> {
    try {
      const result = await sandboxService.consoleExec(SCAN_JS);

      if (result.error || !result.result) {
        console.warn('[PopupDismisser] Scan JS error:', result.error);
        return [];
      }

      // Parse — handle potential double-encoding
      let raw = result.result;
      if (raw.startsWith('"')) {
        try { raw = JSON.parse(raw); } catch { /* use as-is */ }
      }
      const parsed: ScanHit[] = typeof raw === 'string' ? JSON.parse(raw) : raw;
      return parsed;
    } catch (err) {
      console.warn('[PopupDismisser] Scan failed:', err);
      return [];
    }
  }

  /**
   * Attempt to dismiss a single detected popup.
   */
  async dismiss(hit: ScanHit): Promise<DismissResult> {
    const base: DismissResult = {
      found: true,
      dismissed: false,
      type: hit.type,
      method: 'none',
      elementText: hit.snippet,
    };

    // Strategy 1: Click the identified dismiss button
    if (hit.buttonText) {
      try {
        const clickResult = await sandboxService.consoleExec(makeDismissClickJS(hit));
        if (clickResult.result) {
          let parsed = clickResult.result;
          if (parsed.startsWith('"')) {
            try { parsed = JSON.parse(parsed); } catch { /* use as-is */ }
          }
          const data = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
          if (data.clicked) {
            const lowerText = (hit.buttonText || '').toLowerCase();
            let method: DismissResult['method'] = 'click_accept';
            if (/close|×|✕|x/i.test(lowerText)) {
              method = 'click_close';
            } else if (/dismiss|no thanks|not now|reject|decline|maybe later/i.test(lowerText)) {
              method = 'click_dismiss';
            }
            return { ...base, dismissed: true, method };
          }
        }
      } catch {
        // Click failed — fall through to next strategy
      }
    }

    // Strategy 2: Press Escape
    try {
      await sandboxService.pressKey('Escape');
      // Brief wait then check if popup is still there
      await new Promise(r => setTimeout(r, 300));

      // Re-scan to see if it went away
      const afterScan = await this.scan();
      const stillThere = afterScan.some(
        h => h.snippet === hit.snippet && h.type === hit.type
      );
      if (!stillThere) {
        return { ...base, dismissed: true, method: 'press_escape' };
      }
    } catch {
      // Escape failed — fall through
    }

    // Strategy 3: Force-hide via CSS injection
    try {
      const hideResult = await sandboxService.consoleExec(makeHideJS(hit));
      if (hideResult.result) {
        let parsed = hideResult.result;
        if (parsed.startsWith('"')) {
          try { parsed = JSON.parse(parsed); } catch { /* use as-is */ }
        }
        const data = typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
        if (data.hidden > 0) {
          return { ...base, dismissed: true, method: 'remove_element' };
        }
      }
    } catch {
      // Hide failed
    }

    return base;
  }

  /**
   * Scan for all popups and dismiss everything found.
   */
  async autoDismissAll(): Promise<DismissResult[]> {
    const hits = await this.scan();

    if (hits.length === 0) {
      return [{ found: false, dismissed: false, type: 'none', method: 'none' }];
    }

    const results: DismissResult[] = [];
    for (const hit of hits) {
      const result = await this.dismiss(hit);
      results.push(result);
      // Small delay between dismissals to let DOM settle
      if (hits.length > 1) {
        await new Promise(r => setTimeout(r, 150));
      }
    }

    return results;
  }

  /**
   * Inject a prevention stylesheet that preemptively hides common
   * cookie/popup elements. Call once after page load.
   */
  async injectPreventionCSS(): Promise<void> {
    const js = `
(() => {
  if (document.getElementById('__popup_dismisser_css')) return 'already_injected';
  const style = document.createElement('style');
  style.id = '__popup_dismisser_css';
  style.textContent = ${JSON.stringify(PREVENTION_CSS)};
  (document.head || document.documentElement).appendChild(style);
  // Also restore body scroll
  document.body.style.removeProperty('overflow');
  document.documentElement.style.removeProperty('overflow');
  return 'injected';
})()
`;
    try {
      await sandboxService.consoleExec(js);
    } catch (err) {
      console.warn('[PopupDismisser] Failed to inject prevention CSS:', err);
    }
  }
}

// ── Singleton + Helper ──

const dismisser = new PopupDismisser();

/**
 * Quick helper to clear all popups before a critical action.
 * Call before clicks/inputs to ensure overlays aren't blocking.
 *
 * Usage:
 *   import { ensurePageClear } from './popupDismisser';
 *   const results = await ensurePageClear();
 */
export async function ensurePageClear(): Promise<DismissResult[]> {
  return dismisser.autoDismissAll();
}

export default dismisser;
