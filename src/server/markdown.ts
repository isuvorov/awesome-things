/**
 * Markdown for todo notes — the subset Things3 itself renders: headings, bold, italic,
 * strikethrough, ==highlight==, code, links, lists, checklists, quotes and rules.
 *
 * Hand-written on purpose: every piece of text goes through escapeHtml() before it is wrapped
 * in a tag, so raw HTML in a note is shown as text and never reaches the page.
 */

/** Everything Things3 hands back is user text — none of it may reach the page raw. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Schemes that run code or read local data when clicked. Any other scheme is an app link
// (obsidian://, things:///, raycast://…) and stays clickable.
const UNSAFE_SCHEMES = new Set(['javascript', 'vbscript', 'data', 'file', 'blob']);

/** True for `scheme:…` urls whose scheme is not on the unsafe list. Relative urls are refused. */
export function isSafeUrl(url: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url)?.[1];
  return !!scheme && !UNSAFE_SCHEMES.has(scheme.toLowerCase());
}

function link(url: string, text: string): string {
  // Web pages open in a new tab; an app link in a new tab leaves an empty tab behind.
  const target = /^https?:/i.test(url) ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a href="${escapeHtml(url)}"${target}>${text}</a>`;
}

// Bare urls: http(s)://… plus any app scheme written as scheme://… Trailing punctuation is
// the sentence's, not the url's.
const BARE_URL = /[a-z][a-z0-9+.-]*:\/\/[^\s<>"'`]*[^\s<>"'`.,;:!?)\]]/gi;

const PH = '\u0000';

/** Inline markdown of one block. Links and code are pulled out first so emphasis never reaches inside them. */
export function renderInline(text: string, links = true): string {
  const slots: string[] = [];
  const hold = (html: string) => `${PH}${slots.push(html) - 1}${PH}`;

  let s = text.replaceAll(PH, '');
  s = s.replace(/(`+)([^`]|[^`].*?[^`])\1(?!`)/g, (_, _ticks, code: string) =>
    hold(`<code>${escapeHtml(code.trim() || code)}</code>`),
  );
  if (links) {
    s = s.replace(
      /\[([^\]]+)\]\(\s*((?:[^\s()]|\([^\s()]*\))+)\s*\)/g,
      (whole, label: string, url: string) =>
        isSafeUrl(url) ? hold(link(url, renderInline(label, false))) : whole,
    );
    s = s.replace(/<([a-z][a-z0-9+.-]*:[^\s<>]+)>/gi, (whole, url: string) =>
      isSafeUrl(url) ? hold(link(url, escapeHtml(url))) : whole,
    );
    s = s.replace(BARE_URL, (url) => (isSafeUrl(url) ? hold(link(url, escapeHtml(url))) : url));
  }

  s = escapeHtml(s)
    .replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^\w])__(?=\S)(.+?)(?<=\S)__(?!\w)/g, '$1<strong>$2</strong>')
    .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, '<em>$1</em>')
    .replace(/(^|[^\w])_(?=\S)(.+?)(?<=\S)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, '<del>$1</del>')
    .replace(/==(?=\S)(.+?)(?<=\S)==/g, '<mark>$1</mark>');

  return s.replace(new RegExp(`${PH}(\\d+)${PH}`, 'g'), (_, i: string) => slots[Number(i)]!);
}

const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

const indentOf = (line: string) => /^\s*/.exec(line)![0].replace(/\t/g, '    ').length;
const isBlank = (line: string) => !line.trim();
const startsBlock = (line: string) =>
  FENCE.test(line) || HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || ITEM.test(line);

function renderList(lines: string[], start: number): [string, number] {
  const first = ITEM.exec(lines[start]!)!;
  const indent = indentOf(first[1]!);
  const ordered = /\d/.test(first[2]!);
  const items: string[] = [];
  let i = start;

  while (i < lines.length) {
    const m = ITEM.exec(lines[i]!);
    if (!m || indentOf(m[1]!) > indent + 1 || /\d/.test(m[2]!) !== ordered) break;
    if (indentOf(m[1]!) < indent) break;
    i++;

    // Everything indented deeper than the marker belongs to this item: nested lists, wrapped lines.
    const body: string[] = [];
    while (i < lines.length) {
      const line = lines[i]!;
      if (isBlank(line)) {
        const next = lines[i + 1];
        if (next === undefined || isBlank(next) || indentOf(next) <= indent) break;
      } else if (indentOf(line) <= indent) break;
      body.push(line);
      i++;
    }

    let text = m[3]!;
    let box = '';
    const task = /^\[([ xX])\]\s+(.*)$/.exec(text);
    if (task) {
      const checked = task[1] !== ' ';
      box = `<input type="checkbox" disabled${checked ? ' checked' : ''}> `;
      text = task[2]!;
    }
    const cls = task ? ' class="task"' : '';
    const nested = body.length ? renderBlocks(dedent(body)) : '';
    items.push(`<li${cls}>${box}${renderInline(text)}${nested}</li>`);

    // A single blank line between items keeps the list going.
    if (isBlank(lines[i] ?? '') && ITEM.test(lines[i + 1] ?? '')) i++;
  }

  const n = Number.parseInt(first[2]!, 10);
  const open = ordered ? (n !== 1 ? `<ol start="${n}">` : '<ol>') : '<ul>';
  return [`${open}${items.join('')}${ordered ? '</ol>' : '</ul>'}`, i];
}

function dedent(lines: string[]): string[] {
  const min = Math.min(...lines.filter((l) => !isBlank(l)).map(indentOf));
  return lines.map((l) => l.replace(/\t/g, '    ').slice(min));
}

function renderBlocks(lines: string[]): string {
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    if (isBlank(line)) {
      i++;
      continue;
    }

    const fence = FENCE.exec(line);
    if (fence) {
      const close = new RegExp(`^\\s*${fence[1]![0]}{${fence[1]!.length},}\\s*$`);
      const code: string[] = [];
      i++;
      while (i < lines.length && !close.test(lines[i]!)) code.push(lines[i++]!);
      i++;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      // The todo title is the page's h1, so a note's "#" starts one level below it.
      const level = Math.min(heading[1]!.length + 1, 6);
      out.push(`<h${level}>${renderInline(heading[2]!)}</h${level}>`);
      i++;
      continue;
    }

    if (RULE.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const quoted: string[] = [];
      while (i < lines.length && QUOTE.test(lines[i]!)) quoted.push(lines[i++]!.replace(QUOTE, ''));
      out.push(`<blockquote>${renderBlocks(quoted)}</blockquote>`);
      continue;
    }

    if (ITEM.test(line)) {
      const [html, next] = renderList(lines, i);
      out.push(html);
      i = next;
      continue;
    }

    // A paragraph keeps its line breaks: notes are typed in Things, not wrapped at 80 columns.
    const para: string[] = [];
    while (i < lines.length && !isBlank(lines[i]!) && (!para.length || !startsBlock(lines[i]!))) {
      para.push(lines[i++]!.trim());
    }
    out.push(`<p>${para.map((l) => renderInline(l)).join('<br>')}</p>`);
  }

  return out.join('');
}

/** A todo's notes as HTML. Safe to drop straight into the page. */
export function renderMarkdown(text: string): string {
  return renderBlocks(text.replace(/\r\n?/g, '\n').split('\n'));
}
