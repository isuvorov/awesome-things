import { isNotFound } from '../api/errors.js';
import { getTodo } from '../api/todo-ops.js';
import { appName } from '../config.js';
import type { TodoDetails } from '../types.js';
import { errorMessage } from './errors.js';
import { logError } from './logger.js';
import { escapeHtml, renderMarkdown } from './markdown.js';

export { escapeHtml };

/** The web page of one todo. `/todo/<id>` is the link to share — see todoPageResponse. */
export const TODO_PAGE_PREFIX = '/todo/';

/** The id from `/todo/<id>`, or null when the path is something else. */
export function parseTodoPagePath(pathname: string): string | null {
  if (!pathname.startsWith(TODO_PAGE_PREFIX)) return null;
  const raw = pathname.slice(TODO_PAGE_PREFIX.length).replace(/\/+$/, '');
  if (!raw || raw.includes('/')) return null;
  try {
    return decodeURIComponent(raw) || null;
  } catch {
    return null;
  }
}

const STYLE = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f7; color: #1d1d1f; padding: 24px; max-width: 720px; margin: 0 auto; }
    a { color: #0071e3; text-decoration: none; }
    a:hover { text-decoration: underline; }
    .back { display: inline-block; font-size: 13px; margin-bottom: 16px; }
    .card { background: #fff; border: 1px solid #e8e8ed; border-radius: 14px; padding: 24px; }
    .head { display: flex; align-items: flex-start; gap: 12px; }
    .check { width: 22px; height: 22px; border-radius: 50%; border: 2px solid #d2d2d7; flex-shrink: 0; margin-top: 4px; }
    .check.completed { background: #34c759; border-color: #34c759; }
    .check.canceled { background: #d2d2d7; }
    h1 { font-size: 24px; font-weight: 700; line-height: 1.3; word-break: break-word; }
    h1.done { text-decoration: line-through; color: #86868b; }
    .badge { display: inline-block; font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: 6px; margin-top: 6px; background: #e8e8ed; color: #1d1d1f; }
    .badge.completed { background: #e3f9e8; color: #1e7b34; }
    .meta { display: grid; grid-template-columns: max-content 1fr; gap: 6px 16px; margin-top: 20px; font-size: 14px; }
    .meta dt { color: #86868b; }
    .tag { display: inline-block; font-size: 12px; padding: 1px 8px; border-radius: 10px; background: #f0f0f5; margin: 0 4px 4px 0; }
    .notes { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e8e8ed; font-size: 15px; line-height: 1.55; word-break: break-word; }
    .notes > * + * { margin-top: 10px; }
    .notes h2, .notes h3, .notes h4, .notes h5, .notes h6 { font-weight: 700; line-height: 1.3; margin-top: 18px; }
    .notes h2 { font-size: 20px; } .notes h3 { font-size: 17px; } .notes h4, .notes h5, .notes h6 { font-size: 15px; }
    .notes ul, .notes ol { padding-left: 24px; }
    .notes li > ul, .notes li > ol, .notes li > p { margin-top: 4px; }
    .notes li.task { list-style: none; margin-left: -20px; }
    .notes li.task input { margin-right: 4px; vertical-align: -1px; }
    .notes code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 13px; background: #f0f0f5; padding: 1px 5px; border-radius: 5px; }
    .notes pre { background: #f0f0f5; padding: 12px 14px; border-radius: 9px; overflow-x: auto; }
    .notes pre code { background: none; padding: 0; white-space: pre; }
    .notes blockquote { border-left: 3px solid #d2d2d7; padding-left: 12px; color: #6e6e73; }
    .notes hr { border: none; border-top: 1px solid #e8e8ed; }
    .notes mark { background: #fff3a3; padding: 0 2px; border-radius: 3px; }
    .actions { margin-top: 24px; }
    .button { display: inline-block; padding: 8px 16px; font-size: 14px; font-weight: 600; color: #fff; background: #0071e3; border-radius: 9px; }
    .button:hover { background: #0077ed; text-decoration: none; }
    .dates { margin-top: 16px; font-size: 12px; color: #86868b; }
    .dates span { margin-right: 12px; }
    .error { color: #ff3b30; }`;

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="robots" content="noindex">
  <title>${escapeHtml(title)} — ${appName}</title>
  <link rel="icon" href="/favicon.ico">
  <style>${STYLE}
  </style>
</head>
<body>
  <a class="back" href="/">&larr; ${appName}</a>
  ${body}
</body>
</html>`;
}

const STATUS_LABELS: Record<string, string> = {
  completed: 'Completed',
  canceled: 'Cancelled',
  cancelled: 'Cancelled',
};

export function getTodoPage(todo: TodoDetails): string {
  const status = todo.status === 'cancelled' ? 'canceled' : todo.status;
  const done = status === 'completed' || status === 'canceled';
  const label = STATUS_LABELS[status];

  const rows: [string, string][] = [];
  if (todo.when) rows.push(['When', escapeHtml(todo.when)]);
  if (todo.dueDate) rows.push(['Deadline', escapeHtml(todo.dueDate)]);
  if (todo.project) rows.push(['Project', escapeHtml(todo.project)]);
  if (todo.area) rows.push(['Area', escapeHtml(todo.area)]);
  const tags = todo.tags
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
  if (tags.length) {
    rows.push(['Tags', tags.map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('')]);
  }

  const dates: string[] = [];
  if (todo.created) dates.push(`Created ${escapeHtml(todo.created)}`);
  if (todo.modified) dates.push(`Modified ${escapeHtml(todo.modified)}`);
  if (todo.completed) dates.push(`${label ?? 'Completed'} ${escapeHtml(todo.completed)}`);

  return page(
    todo.name || 'Untitled',
    `<div class="card">
    <div class="head">
      <div class="check ${escapeHtml(status)}"></div>
      <div>
        <h1${done ? ' class="done"' : ''}>${escapeHtml(todo.name || 'Untitled')}</h1>
        ${label ? `<span class="badge ${escapeHtml(status)}">${label}</span>` : ''}
      </div>
    </div>
    ${
      rows.length
        ? `<dl class="meta">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`
        : ''
    }
    ${todo.notes ? `<div class="notes">${renderMarkdown(todo.notes)}</div>` : ''}
    <div class="actions">
      <a class="button" href="things:///show?id=${encodeURIComponent(todo.id)}">Open in Things</a>
    </div>
    ${dates.length ? `<div class="dates">${dates.map((d) => `<span>${d}</span>`).join('')}</div>` : ''}
  </div>`,
  );
}

export function getTodoErrorPage(title: string, message: string): string {
  return page(
    title,
    `<div class="card">
    <h1>${escapeHtml(title)}</h1>
    <p class="error" style="margin-top: 10px">${escapeHtml(message)}</p>
  </div>`,
  );
}

function html(body: string, status = 200): Response {
  // A todo is private data: no shared cache may keep it after the cookie is gone.
  return new Response(body, {
    status,
    headers: { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' },
  });
}

/** Renders `/todo/<id>`. Auth is the caller's job — it decides between page and redirect. */
export async function todoPageResponse(id: string): Promise<Response> {
  try {
    const { todo } = await getTodo({ id });
    return html(getTodoPage(todo));
  } catch (err) {
    if (isNotFound(err)) {
      return html(getTodoErrorPage('Todo not found', `There is no todo with id ${id}.`), 404);
    }
    logError(`Todo page ${id} failed`, err);
    return html(getTodoErrorPage('Things3 did not answer', errorMessage(err)), 500);
  }
}
