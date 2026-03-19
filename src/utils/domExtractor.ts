/**
 * DOM Accessibility Tree Extractor
 *
 * Extracts a structured accessibility tree from the browser page via sandboxService.
 * Returns interactive elements, headings, forms, and a compact text representation
 * suitable for feeding into an LLM context window.
 */

import { sandboxService } from './sandboxService';

// ── Types ──

export interface DOMElement {
  index: number;
  tag: string;
  role?: string;
  type?: string;
  text: string;
  placeholder?: string;
  bbox: { x: number; y: number; w: number; h: number };
  visible: boolean;
  enabled: boolean;
  focused?: boolean;
}

export interface AccessibilityTree {
  url: string;
  title: string;
  elements: DOMElement[];
  headings: { level: number; text: string }[];
  forms: { id: string; action: string; fields: number[] }[];
  text: string; // compact text representation for LLM
}

// ── JS payload to run in the browser ──

const EXTRACT_JS = `
(() => {
  const results = { elements: [], headings: [], forms: [] };

  // ── Interactive elements ──
  const selectors = [
    'a[href]', 'button', 'input', 'select', 'textarea',
    '[role="button"]', '[role="link"]', '[role="tab"]', '[role="menuitem"]',
    '[role="checkbox"]', '[role="radio"]', '[role="switch"]', '[role="slider"]',
    '[role="combobox"]', '[role="searchbox"]', '[role="textbox"]',
    '[tabindex]', '[contenteditable="true"]',
    'summary', 'details > summary',
  ];
  const seen = new Set();
  const all = document.querySelectorAll(selectors.join(','));
  let idx = 0;

  for (const el of all) {
    if (seen.has(el)) continue;
    seen.add(el);

    const rect = el.getBoundingClientRect();
    const style = window.getComputedStyle(el);

    // Determine visibility
    const visible = (
      rect.width > 0 && rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') > 0.01
    );

    // Get accessible text
    let text = '';
    const ariaLabel = el.getAttribute('aria-label');
    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const ref = document.getElementById(ariaLabelledBy);
      if (ref) text = ref.textContent?.trim() || '';
    }
    if (!text && ariaLabel) text = ariaLabel;
    if (!text) text = el.textContent?.trim() || '';
    // Truncate long text
    if (text.length > 80) text = text.slice(0, 77) + '...';

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || undefined;
    const type = el.getAttribute('type') || undefined;
    const placeholder = el.getAttribute('placeholder') || undefined;
    const disabled = el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true';
    const focused = document.activeElement === el;

    results.elements.push({
      index: idx,
      tag,
      role: role || undefined,
      type: (tag === 'input' || tag === 'button') ? (type || (tag === 'input' ? 'text' : undefined)) : undefined,
      text,
      placeholder: placeholder || undefined,
      bbox: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      visible,
      enabled: !disabled,
      focused: focused || undefined,
    });
    idx++;
  }

  // ── Headings ──
  const headingEls = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
  for (const h of headingEls) {
    const level = parseInt(h.tagName[1], 10);
    const text = h.textContent?.trim() || '';
    if (text) {
      results.headings.push({ level, text: text.slice(0, 120) });
    }
  }

  // ── Forms ──
  const formEls = document.querySelectorAll('form');
  for (const form of formEls) {
    const id = form.id || form.getAttribute('name') || ('form-' + Array.from(formEls).indexOf(form));
    const action = form.getAttribute('action') || '';
    const fields = [];
    // Match form fields to our indexed elements
    const formInputs = form.querySelectorAll('input, select, textarea, button');
    for (const fi of formInputs) {
      // Find this element in our results by matching the DOM node
      const foundIdx = results.elements.findIndex(e => {
        // Compare by bbox since we can't pass DOM refs through JSON
        const fiRect = fi.getBoundingClientRect();
        return (
          Math.round(fiRect.x) === e.bbox.x &&
          Math.round(fiRect.y) === e.bbox.y &&
          e.tag === fi.tagName.toLowerCase()
        );
      });
      if (foundIdx >= 0) fields.push(results.elements[foundIdx].index);
    }
    results.forms.push({ id, action, fields });
  }

  return JSON.stringify(results);
})()
`;

// ── Core extraction function ──

export async function extractAccessibilityTree(_sessionId?: string): Promise<AccessibilityTree> {
  // Get basic page info from view()
  let url = '';
  let title = '';

  try {
    const view = await sandboxService.view();
    url = view.url;
    title = view.title;
  } catch {
    // view() failed — try to get at least URL/title from consoleExec
    try {
      const meta = await sandboxService.consoleExec(
        'JSON.stringify({ url: location.href, title: document.title })'
      );
      if (meta.result) {
        const parsed = JSON.parse(meta.result);
        url = parsed.url || '';
        title = parsed.title || '';
      }
    } catch {
      // Total failure — return minimal tree
      return makeMinimalTree('', '', 'Failed to connect to sandbox');
    }
  }

  // Execute the extraction JS on the page
  try {
    const execResult = await sandboxService.consoleExec(EXTRACT_JS);

    if (execResult.error) {
      console.warn('[domExtractor] JS execution error:', execResult.error);
      return makeMinimalTree(url, title, `JS error: ${execResult.error}`);
    }

    if (!execResult.result) {
      return makeMinimalTree(url, title, 'No result from JS execution');
    }

    // Parse the result — consoleExec may return a JSON string or a double-encoded string
    let parsed: { elements: DOMElement[]; headings: { level: number; text: string }[]; forms: { id: string; action: string; fields: number[] }[] };
    try {
      const raw = execResult.result;
      // Handle double-encoded JSON (string within string)
      const decoded = raw.startsWith('"') ? JSON.parse(raw) : raw;
      parsed = typeof decoded === 'string' ? JSON.parse(decoded) : decoded;
    } catch (parseErr) {
      console.warn('[domExtractor] Parse error:', parseErr);
      return makeMinimalTree(url, title, 'Failed to parse extraction result');
    }

    const tree: AccessibilityTree = {
      url,
      title,
      elements: parsed.elements || [],
      headings: parsed.headings || [],
      forms: parsed.forms || [],
      text: '', // filled below
    };

    tree.text = formatTreeForPlanner(tree);
    return tree;
  } catch (err) {
    console.warn('[domExtractor] Extraction failed:', err);
    return makeMinimalTree(url, title, `Extraction error: ${err}`);
  }
}

// ── Format for LLM ──

export function formatTreeForPlanner(tree: AccessibilityTree): string {
  const lines: string[] = [];

  lines.push(`Page: ${tree.title || '(untitled)'}`);
  lines.push(`URL: ${tree.url || '(unknown)'}`);
  lines.push('');

  // Interactive elements (visible only for compactness)
  const visible = tree.elements.filter(el => el.visible);
  const hidden = tree.elements.length - visible.length;

  if (visible.length > 0) {
    lines.push(`Interactive elements:${hidden > 0 ? ` (${hidden} hidden omitted)` : ''}`);
    for (const el of visible) {
      lines.push(formatElement(el));
    }
  } else {
    lines.push('Interactive elements: none visible');
  }
  lines.push('');

  // Headings
  if (tree.headings.length > 0) {
    lines.push('Headings:');
    for (const h of tree.headings) {
      lines.push(`  H${h.level}: ${h.text}`);
    }
    lines.push('');
  }

  // Forms
  if (tree.forms.length > 0) {
    lines.push('Forms:');
    for (const f of tree.forms) {
      const fieldCount = f.fields.length;
      const fieldList = f.fields.length <= 8 ? ` [${f.fields.join(',')}]` : ` [${f.fields.slice(0, 6).join(',')},...+${f.fields.length - 6}]`;
      lines.push(`  Form#${f.id}${f.action ? ' -> ' + f.action : ''}: ${fieldCount} field${fieldCount !== 1 ? 's' : ''}${fieldList}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function formatElement(el: DOMElement): string {
  const parts: string[] = [];
  const bboxStr = `(${el.bbox.x},${el.bbox.y} ${el.bbox.w}x${el.bbox.h})`;
  const flags: string[] = [];
  if (!el.enabled) flags.push('disabled');
  if (el.focused) flags.push('focused');
  const flagStr = flags.length > 0 ? ' ' + flags.join(' ') : '';

  const tag = el.tag.toLowerCase();

  if (tag === 'input') {
    const inputType = el.type || 'text';
    let desc = `input[${inputType}]`;
    if (el.placeholder) desc += ` placeholder="${el.placeholder}"`;
    if (el.text) desc += ` value="${el.text}"`;
    parts.push(`[${el.index}] ${desc} ${bboxStr}${flagStr}`);
  } else if (tag === 'textarea') {
    let desc = 'textarea';
    if (el.placeholder) desc += ` placeholder="${el.placeholder}"`;
    if (el.text) desc += ` "${el.text}"`;
    parts.push(`[${el.index}] ${desc} ${bboxStr}${flagStr}`);
  } else if (tag === 'select') {
    parts.push(`[${el.index}] select${el.text ? ' selected="' + el.text + '"' : ''} ${bboxStr}${flagStr}`);
  } else if (tag === 'a') {
    parts.push(`[${el.index}] link "${el.text}" ${bboxStr}${flagStr}`);
  } else if (tag === 'button' || el.role === 'button') {
    parts.push(`[${el.index}] button "${el.text}" ${bboxStr}${flagStr}`);
  } else {
    let desc = tag;
    if (el.role) desc += `[${el.role}]`;
    if (el.text) desc += ` "${el.text}"`;
    parts.push(`[${el.index}] ${desc} ${bboxStr}${flagStr}`);
  }

  return parts.join('');
}

// ── Page context (accessibility tree + body text summary) ──

export async function extractPageContext(sessionId?: string): Promise<string> {
  const tree = await extractAccessibilityTree(sessionId);
  const sections: string[] = [tree.text];

  // Get visible body text (first ~500 chars)
  try {
    const textResult = await sandboxService.consoleExec(`
      (() => {
        const body = document.body;
        if (!body) return '';
        // Get text, skipping script/style/hidden
        const walker = document.createTreeWalker(
          body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              const parent = node.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              const tag = parent.tagName;
              if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
              const style = window.getComputedStyle(parent);
              if (style.display === 'none' || style.visibility === 'hidden') return NodeFilter.FILTER_REJECT;
              const text = node.textContent?.trim();
              if (!text) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );
        const chunks = [];
        let total = 0;
        while (walker.nextNode() && total < 600) {
          const t = walker.currentNode.textContent?.trim();
          if (t && t.length > 1) {
            chunks.push(t);
            total += t.length;
          }
        }
        return chunks.join(' ').slice(0, 500);
      })()
    `);

    if (textResult.result && !textResult.error) {
      // Strip outer quotes if double-encoded
      let bodyText = textResult.result;
      if (bodyText.startsWith('"') && bodyText.endsWith('"')) {
        try { bodyText = JSON.parse(bodyText); } catch {}
      }
      if (bodyText && bodyText.length > 10) {
        sections.push('Visible page text:');
        sections.push(bodyText);
      }
    }
  } catch {
    // Non-critical — skip body text
  }

  return sections.join('\n');
}

// ── Helpers ──

function makeMinimalTree(url: string, title: string, error: string): AccessibilityTree {
  const tree: AccessibilityTree = {
    url,
    title,
    elements: [],
    headings: [],
    forms: [],
    text: '',
  };
  tree.text = [
    `Page: ${title || '(untitled)'}`,
    `URL: ${url || '(unknown)'}`,
    '',
    `[extraction error: ${error}]`,
  ].join('\n');
  return tree;
}
