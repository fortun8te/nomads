/**
 * MarkdownText — shared markdown renderer for LLM output.
 *
 * No external dependencies — uses a hand-rolled renderer that matches the
 * design language of the rest of the app (dark-first, zinc palette).
 *
 * Supports: headings, bold, italic, inline code, fenced code blocks,
 * unordered lists, ordered lists, blockquotes, horizontal rules, tables,
 * and plain paragraphs.
 */

import React from 'react';

// ── Inline formatter ──────────────────────────────────────────────────────────
// Handles **bold**, *italic*, `code` within a single line of text.

export function inlineMarkdown(
  text: string,
  dark: boolean,
  keyPrefix: string | number = 0,
): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Order matters: **bold** before *italic* so ** isn't consumed as two *
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(
        <strong
          key={`${keyPrefix}-b-${match.index}`}
          className="font-semibold"
          style={{ color: dark ? 'rgba(255,255,255,0.88)' : 'rgba(0,0,0,0.85)' }}
        >
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(
        <code
          key={`${keyPrefix}-c-${match.index}`}
          className="text-[12px] font-mono px-1.5 py-0.5 rounded"
          style={{
            background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)',
            color: dark ? 'rgba(43,121,255,0.9)' : 'rgba(29,106,229,0.9)',
          }}
        >
          {token.slice(1, -1)}
        </code>,
      );
    } else if (token.startsWith('*') && token.endsWith('*')) {
      parts.push(
        <em
          key={`${keyPrefix}-em-${match.index}`}
          style={{ color: dark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)', fontStyle: 'italic' }}
        >
          {token.slice(1, -1)}
        </em>,
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : [text];
}

// ── Block renderer ────────────────────────────────────────────────────────────

export function renderMarkdownNodes(text: string, dark: boolean): React.ReactNode[] {
  const lines = text.split('\n');
  const result: React.ReactNode[] = [];
  let i = 0;

  const txtColor  = dark ? 'rgba(255,255,255,0.65)'  : 'rgba(0,0,0,0.72)';
  const dimColor  = dark ? 'rgba(255,255,255,0.38)'  : 'rgba(0,0,0,0.38)';
  const headColor = dark ? 'rgba(255,255,255,0.90)'  : 'rgba(0,0,0,0.88)';

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // ── Fenced code block ─────────────────────────────────────────────────
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // consume closing ```
      result.push(
        <pre
          key={`code-${i}`}
          className="my-2 p-3 rounded-lg overflow-x-auto text-[11px] font-mono leading-relaxed"
          style={{
            background: dark ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.04)',
            border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)',
            color: dark ? 'rgba(43,121,255,0.85)' : 'rgba(29,106,229,0.9)',
          }}
          data-lang={lang || undefined}
        >
          {codeLines.join('\n')}
        </pre>,
      );
      continue;
    }

    // ── Table ──────────────────────────────────────────────────────────────
    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i]);
        i++;
      }
      // Filter separator rows (e.g. |---|---|)
      const rows = tableLines
        .filter(l => !l.trim().match(/^\|[\s\-:|]+\|$/))
        .map(l =>
          l.split('|')
            .map(c => c.trim())
            .filter(Boolean),
        );
      if (rows.length > 0) {
        const header = rows[0];
        const body = rows.slice(1);
        result.push(
          <div
            key={`tbl-${i}`}
            className="my-3 rounded-lg overflow-hidden"
            style={{ border: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}
          >
            <table className="w-full text-[12px]" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.03)' }}>
                  {header.map((h, j) => (
                    <th
                      key={j}
                      className="text-left px-4 py-2 font-semibold"
                      style={{
                        color: dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)',
                        borderBottom: dark ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(0,0,0,0.06)',
                      }}
                    >
                      {inlineMarkdown(h, dark, `th-${j}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr
                    key={ri}
                    style={{ background: ri % 2 === 0 ? 'transparent' : dark ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)' }}
                  >
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className="px-4 py-2"
                        style={{
                          color: ci === 0
                            ? (dark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.7)')
                            : (dark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'),
                          fontWeight: ci === 0 ? 600 : 400,
                          borderBottom: dark ? '1px solid rgba(255,255,255,0.04)' : '1px solid rgba(0,0,0,0.04)',
                        }}
                      >
                        {inlineMarkdown(cell, dark, `td-${ri}-${ci}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        );
      }
      continue;
    }

    // ── Horizontal rule ────────────────────────────────────────────────────
    if (trimmed.match(/^[-*_]{3,}$/) && trimmed.split('').every(c => c === trimmed[0])) {
      result.push(
        <hr
          key={`hr-${i}`}
          className="my-3"
          style={{ border: 'none', borderTop: dark ? '1px solid rgba(255,255,255,0.08)' : '1px solid rgba(0,0,0,0.08)' }}
        />,
      );
      i++;
      continue;
    }

    // ── Headings ───────────────────────────────────────────────────────────
    if (line.startsWith('### ')) {
      result.push(
        <h4 key={`h3-${i}`} className="text-[13px] font-semibold mt-3 mb-1" style={{ color: headColor }}>
          {inlineMarkdown(line.slice(4), dark, `h3-${i}`)}
        </h4>,
      );
      i++; continue;
    }
    if (line.startsWith('## ')) {
      result.push(
        <h3 key={`h2-${i}`} className="text-[15px] font-semibold mt-4 mb-1.5" style={{ color: headColor }}>
          {inlineMarkdown(line.slice(3), dark, `h2-${i}`)}
        </h3>,
      );
      i++; continue;
    }
    if (line.startsWith('# ')) {
      result.push(
        <h2 key={`h1-${i}`} className="text-[17px] font-bold mt-4 mb-2" style={{ color: headColor }}>
          {inlineMarkdown(line.slice(2), dark, `h1-${i}`)}
        </h2>,
      );
      i++; continue;
    }

    // ── Blockquote ─────────────────────────────────────────────────────────
    if (line.startsWith('> ')) {
      result.push(
        <blockquote
          key={`bq-${i}`}
          className="pl-3 my-1.5 text-[12px] leading-relaxed italic"
          style={{
            borderLeft: dark ? '2px solid rgba(43,121,255,0.35)' : '2px solid rgba(43,121,255,0.3)',
            color: dimColor,
          }}
        >
          {inlineMarkdown(line.slice(2), dark, `bq-${i}`)}
        </blockquote>,
      );
      i++; continue;
    }

    // ── Unordered list item ────────────────────────────────────────────────
    if (line.match(/^[-*] /) || line.match(/^  [-*] /)) {
      const indent = line.match(/^  /) ? 'pl-5' : 'pl-1';
      const content = line.replace(/^  /, '').slice(2);
      result.push(
        <div key={`li-${i}`} className={`flex gap-2 ${indent}`}>
          <span
            className="shrink-0 mt-[8px] w-1 h-1 rounded-full"
            style={{ background: dark ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.3)' }}
          />
          <span className="text-[13px] leading-relaxed" style={{ color: txtColor }}>
            {inlineMarkdown(content, dark, `li-${i}`)}
          </span>
        </div>,
      );
      i++; continue;
    }

    // ── Ordered list item ──────────────────────────────────────────────────
    if (line.match(/^\d+\.\s/)) {
      const m = line.match(/^(\d+\.)\s(.*)$/);
      if (m) {
        result.push(
          <div key={`ol-${i}`} className="flex gap-2 pl-1">
            <span className="shrink-0 text-[12px] font-mono" style={{ color: dimColor }}>{m[1]}</span>
            <span className="text-[13px] leading-relaxed" style={{ color: txtColor }}>
              {inlineMarkdown(m[2], dark, `ol-${i}`)}
            </span>
          </div>,
        );
      }
      i++; continue;
    }

    // ── Empty line ─────────────────────────────────────────────────────────
    if (trimmed === '') {
      result.push(<div key={`sp-${i}`} className="h-1.5" />);
      i++; continue;
    }

    // ── Paragraph ─────────────────────────────────────────────────────────
    result.push(
      <p key={`p-${i}`} className="text-[13px] leading-relaxed" style={{ color: txtColor }}>
        {inlineMarkdown(line, dark, `p-${i}`)}
      </p>,
    );
    i++;
  }

  return result;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface MarkdownTextProps {
  content: string;
  dark?: boolean;
  className?: string;
  /** When true, reduces vertical spacing for use inside compact containers */
  compact?: boolean;
}

export function MarkdownText({ content, dark = true, className = '', compact = false }: MarkdownTextProps) {
  return (
    <div className={`${compact ? 'space-y-0.5' : 'space-y-1'} ${className}`}>
      {renderMarkdownNodes(content, dark)}
    </div>
  );
}
