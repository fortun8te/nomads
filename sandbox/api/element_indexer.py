"""
DOM Element Indexer — assigns data-nomad-id to all interactive elements
and overlays small numbered badges visible in VNC stream.

Ported from ai-manus playwright_browser.py element indexing system.
"""

# JavaScript that runs in the browser to index elements
INDEX_ELEMENTS_JS = """
(() => {
  // Clean up previous indexing
  document.querySelectorAll('[data-nomad-id]').forEach(el => {
    el.removeAttribute('data-nomad-id');
  });
  document.querySelectorAll('.nomad-badge').forEach(el => el.remove());

  // Find all interactive elements
  const selectors = [
    'a[href]',
    'button',
    'input:not([type="hidden"])',
    'textarea',
    'select',
    '[role="button"]',
    '[role="link"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]',
    '[onclick]',
    'summary',
    'details > summary',
    'label[for]',
  ];

  const all = new Set();
  for (const sel of selectors) {
    try {
      document.querySelectorAll(sel).forEach(el => all.add(el));
    } catch {}
  }

  // Filter to visible, in-viewport elements
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const results = [];
  let idx = 0;

  for (const el of all) {
    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    // Skip hidden/invisible/off-screen
    if (style.display === 'none') continue;
    if (style.visibility === 'hidden') continue;
    if (style.opacity === '0') continue;
    if (rect.width < 4 || rect.height < 4) continue;
    // Must be at least partially in viewport
    if (rect.bottom < 0 || rect.top > vh) continue;
    if (rect.right < 0 || rect.left > vw) continue;

    // Assign ID
    el.setAttribute('data-nomad-id', `nomad-${idx}`);

    // Get element info
    const tag = el.tagName.toLowerCase();
    let text = '';
    if (tag === 'input' || tag === 'textarea') {
      text = el.placeholder || el.value || el.getAttribute('aria-label') || '';
    } else if (tag === 'select') {
      const opt = el.options?.[el.selectedIndex];
      text = opt ? opt.text : '';
    } else {
      text = (el.textContent || el.innerText || '').trim().slice(0, 80);
    }

    // Get href for links
    const href = el.href || el.getAttribute('href') || '';

    // Get input type
    const type = el.type || el.getAttribute('type') || '';

    results.push({
      index: idx,
      tag: tag,
      text: text.replace(/\\s+/g, ' ').trim(),
      href: href,
      type: type,
      placeholder: el.placeholder || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      role: el.getAttribute('role') || '',
      rect: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
    });

    // Create visual badge overlay
    const badge = document.createElement('div');
    badge.className = 'nomad-badge';
    badge.textContent = idx;
    badge.style.cssText = `
      position: fixed;
      left: ${Math.max(0, Math.round(rect.x) - 2)}px;
      top: ${Math.max(0, Math.round(rect.y) - 10)}px;
      background: #6366f1;
      color: white;
      font-size: 8px;
      font-weight: bold;
      font-family: monospace;
      padding: 0 3px;
      border-radius: 3px;
      z-index: 999999;
      pointer-events: none;
      line-height: 12px;
      box-shadow: 0 1px 2px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(badge);

    idx++;
  }

  return results;
})()
"""

# JavaScript to remove all badges (cleanup)
REMOVE_BADGES_JS = """
(() => {
  document.querySelectorAll('.nomad-badge').forEach(el => el.remove());
  document.querySelectorAll('[data-nomad-id]').forEach(el => {
    el.removeAttribute('data-nomad-id');
  });
})()
"""

# JavaScript to extract page text (simplified markdown)
EXTRACT_TEXT_JS = """
(() => {
  const walk = (node, depth = 0) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent.trim();
      return text ? text + ' ' : '';
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const style = window.getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return '';
    if (['script', 'style', 'noscript', 'svg', 'path'].includes(tag)) return '';

    let result = '';
    const prefix = tag === 'h1' ? '# ' : tag === 'h2' ? '## ' : tag === 'h3' ? '### ' : '';
    const isBlock = ['div', 'p', 'section', 'article', 'main', 'header', 'footer', 'nav',
                     'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'tr', 'td', 'th',
                     'blockquote', 'pre', 'form', 'fieldset'].includes(tag);

    if (isBlock && prefix) result += prefix;

    for (const child of node.childNodes) {
      result += walk(child, depth + 1);
    }

    if (isBlock && result.trim()) result += '\\n';
    return result;
  };

  const text = walk(document.body);
  // Collapse multiple newlines, trim
  return text.replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 8000);
})()
"""


def format_elements_for_llm(elements: list[dict]) -> str:
    """Format element list as numbered text for the LLM."""
    lines = []
    for el in elements:
        tag = el["tag"].upper()
        text = el.get("text", "")[:60]
        href = el.get("href", "")
        placeholder = el.get("placeholder", "")
        input_type = el.get("type", "")
        role = el.get("role", "")

        # Build description
        if tag == "INPUT":
            desc = f'INPUT[{input_type}]'
            if placeholder:
                desc += f' placeholder="{placeholder}"'
            if text:
                desc += f' value="{text}"'
        elif tag == "TEXTAREA":
            desc = f'TEXTAREA'
            if placeholder:
                desc += f' placeholder="{placeholder}"'
        elif tag == "SELECT":
            desc = f'SELECT'
            if text:
                desc += f' selected="{text}"'
        elif tag == "A":
            desc = f'LINK "{text}"'
            if href and not href.startswith("javascript:"):
                # Show just the path, not full URL
                try:
                    from urllib.parse import urlparse
                    path = urlparse(href).path
                    if path and path != "/":
                        desc += f" → {path[:40]}"
                except:
                    pass
        elif tag == "BUTTON" or role == "button":
            desc = f'BUTTON "{text}"'
        else:
            desc = f'{tag}'
            if role:
                desc += f'[{role}]'
            if text:
                desc += f' "{text}"'

        lines.append(f"[{el['index']}] {desc}")

    return "\n".join(lines)
