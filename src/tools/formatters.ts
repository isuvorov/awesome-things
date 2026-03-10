import { bold, cyan, dim, gray, green, yellow } from '../server/logger.js';
import type {
  ActionResult,
  GetProjectTodosResult,
  ListAreasResult,
  ListProjectsResult,
  ListTagsResult,
  ListTodosResult,
  SearchTodosResult,
  TodoItem,
} from '../types.js';

// ── Helpers ────────────────────────────────────────────────────

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}\u2026`;
}

function firstLine(s: string, max = 80): string {
  const line = s.split('\n')[0].trim();
  return truncate(line, max);
}

// ── Formatter interface ────────────────────────────────────────

export interface Formatters {
  formatTodos: (r: ListTodosResult) => string;
  formatSearch: (r: SearchTodosResult) => string;
  formatProjects: (r: ListProjectsResult) => string;
  formatProjectTodos: (r: GetProjectTodosResult) => string;
  formatTags: (r: ListTagsResult) => string;
  formatAreas: (r: ListAreasResult) => string;
  formatAction: (r: ActionResult) => string;
}

export type FormatStyle = 'pretty' | 'table' | 'plain';

// ── Pretty formatters ──────────────────────────────────────────

function prettyTodoLine(t: TodoItem): string {
  const isOpen = t.status !== 'completed';
  const icon = isOpen ? cyan('\u25CB') : dim(green('\u2713'));
  const name = isOpen ? bold(t.name) : dim(t.name);
  const nameParts = [name];
  if (t.project) nameParts.push(gray(`[${t.project}]`));
  const lines = [`  ${icon}  ${nameParts.join('  ')}`];

  const meta: string[] = [];
  if (t.dueDate) meta.push(yellow(`\uD83D\uDCC5 ${t.dueDate}`));
  if (t.tags)
    meta.push(
      cyan(
        t.tags
          .split(',')
          .map((tag) => `#${tag.trim()}`)
          .join(' '),
      ),
    );

  const noteLine = t.notes ? firstLine(t.notes) : '';
  if (noteLine || meta.length) {
    const parts: string[] = [];
    if (noteLine) parts.push(dim(noteLine));
    if (meta.length) parts.push(meta.join('  '));
    lines.push(`     ${parts.join('  ')}`);
  }

  return isOpen ? lines.join('\n') : dim(lines.join('\n'));
}

const prettyFormatters: Formatters = {
  formatTodos(result) {
    const header = `  ${bold(result.list)} ${dim(`(${result.todos.length} todos)`)}`;
    if (result.todos.length === 0) return `${header}\n\n  ${dim('(none)')}`;
    return `${header}\n\n${result.todos.map(prettyTodoLine).join('\n')}`;
  },

  formatSearch(result) {
    const header = `  ${bold('Search:')} ${cyan(`"${result.query}"`)} ${dim(`(${result.results.length} results)`)}`;
    if (result.results.length === 0) return `${header}\n\n  ${dim('(none)')}`;
    const lines = result.results.map((r) => {
      const isOpen = r.status !== 'completed';
      const icon = isOpen ? cyan('\u25CB') : dim(green('\u2713'));
      const name = isOpen ? bold(r.name) : dim(r.name);
      const parts = [name, dim(r.list)];
      if (r.project) parts.push(gray(`[${r.project}]`));
      if (r.area) parts.push(dim(`{${r.area}}`));
      return `  ${icon}  ${parts.join('  ')}`;
    });
    return `${header}\n\n${lines.join('\n')}`;
  },

  formatProjects(result) {
    const title = result.area ? `Projects in "${result.area}"` : 'All projects';
    const header = `  ${bold(title)} ${dim(`(${result.projects.length})`)}`;
    if (result.projects.length === 0) return `${header}\n\n  ${dim('(none)')}`;
    const lines = result.projects.map((p) => {
      const parts = [`  ${cyan('\u25B8')}  ${bold(p.name)}`];
      if (p.area !== undefined) parts[0] += `  ${dim(p.area)}`;
      if (p.notes) parts.push(`     ${dim(firstLine(p.notes))}`);
      return parts.join('\n');
    });
    return `${header}\n\n${lines.join('\n')}`;
  },

  formatProjectTodos(result) {
    const header = `  ${bold(`Project: ${result.project}`)} ${dim(`(${result.todos.length} todos)`)}`;
    if (result.todos.length === 0) return `${header}\n\n  ${dim('(none)')}`;
    return `${header}\n\n${result.todos.map(prettyTodoLine).join('\n')}`;
  },

  formatTags(result) {
    const header = `  ${bold('Tags')} ${dim(`(${result.tags.length})`)}`;
    if (result.tags.length === 0) return `${header}\n  ${dim('(none)')}`;
    return `${header}\n  ${result.tags.map((t) => cyan(t)).join(dim(' \u00B7 '))}`;
  },

  formatAreas(result) {
    const header = `  ${bold('Areas')} ${dim(`(${result.areas.length})`)}`;
    if (result.areas.length === 0) return `${header}\n  ${dim('(none)')}`;
    return `${header}\n  ${result.areas.map((a) => cyan(a)).join(dim(' \u00B7 '))}`;
  },

  formatAction(result) {
    return `  ${green('\u2713')}  ${result.message}`;
  },
};

// ── Table formatters ───────────────────────────────────────────

function tableRow(cols: string[], widths: number[]): string {
  return `  ${cols.map((c, i) => truncate(c, widths[i]).padEnd(widths[i])).join('  ')}`;
}

const tableFormatters: Formatters = {
  formatTodos(result) {
    const header = `  ${bold(result.list)} ${dim(`(${result.todos.length} todos)`)}`;
    if (result.todos.length === 0) return `${header}\n\n  ${dim('(none)')}`;
    const W = [3, 40, 12, 15, 20];
    const hdr = dim(tableRow(['', 'NAME', 'DUE', 'PROJECT', 'TAGS'], W));
    const rows = result.todos.map((t) => {
      const icon = t.status !== 'completed' ? cyan('\u25CB') : dim(green('\u2713'));
      const name = truncate(t.name, W[1]);
      const line = `  ${icon}${' '.repeat(W[0] - 1)} ${name.padEnd(W[1])}  ${(t.dueDate || '').padEnd(W[2])}  ${truncate(t.project || '', W[3]).padEnd(W[3])}  ${t.tags || ''}`;
      return t.status === 'completed' ? dim(line) : line;
    });
    return `${header}\n\n${hdr}\n${rows.join('\n')}`;
  },

  formatSearch(result) {
    const header = `  ${bold('Search:')} ${cyan(`"${result.query}"`)} ${dim(`(${result.results.length} results)`)}`;
    if (result.results.length === 0) return `${header}\n\n  ${dim('(none)')}`;
    const W = [3, 40, 12, 15, 15];
    const hdr = dim(tableRow(['', 'NAME', 'LIST', 'PROJECT', 'AREA'], W));
    const rows = result.results.map((r) => {
      const icon = r.status !== 'completed' ? cyan('\u25CB') : dim(green('\u2713'));
      const line = `  ${icon}${' '.repeat(W[0] - 1)} ${truncate(r.name, W[1]).padEnd(W[1])}  ${r.list.padEnd(W[2])}  ${(r.project || '').padEnd(W[3])}  ${r.area || ''}`;
      return r.status === 'completed' ? dim(line) : line;
    });
    return `${header}\n\n${hdr}\n${rows.join('\n')}`;
  },

  formatProjects(result) {
    const title = result.area ? `Projects in "${result.area}"` : 'All projects';
    const header = `  ${bold(title)} ${dim(`(${result.projects.length})`)}`;
    if (result.projects.length === 0) return `${header}\n\n  ${dim('(none)')}`;
    const W = [3, 40, 20, 30];
    const hdr = dim(tableRow(['', 'NAME', 'AREA', 'NOTES'], W));
    const rows = result.projects.map((p) => {
      return `  ${cyan('\u25B8')}${' '.repeat(W[0] - 1)} ${truncate(p.name, W[1]).padEnd(W[1])}  ${(p.area || '').padEnd(W[2])}  ${p.notes ? firstLine(p.notes, W[3]) : ''}`;
    });
    return `${header}\n\n${hdr}\n${rows.join('\n')}`;
  },

  formatProjectTodos(result) {
    const header = `  ${bold(`Project: ${result.project}`)} ${dim(`(${result.todos.length} todos)`)}`;
    if (result.todos.length === 0) return `${header}\n\n  ${dim('(none)')}`;
    const W = [3, 50, 12, 20];
    const hdr = dim(tableRow(['', 'NAME', 'DUE', 'TAGS'], W));
    const rows = result.todos.map((t) => {
      const icon = t.status !== 'completed' ? cyan('\u25CB') : dim(green('\u2713'));
      const line = `  ${icon}${' '.repeat(W[0] - 1)} ${truncate(t.name, W[1]).padEnd(W[1])}  ${(t.dueDate || '').padEnd(W[2])}  ${t.tags || ''}`;
      return t.status === 'completed' ? dim(line) : line;
    });
    return `${header}\n\n${hdr}\n${rows.join('\n')}`;
  },

  formatTags: prettyFormatters.formatTags,
  formatAreas: prettyFormatters.formatAreas,
  formatAction: prettyFormatters.formatAction,
};

// ── Plain formatters ───────────────────────────────────────────

function plainTodoLine(t: TodoItem): string {
  const checkbox = t.status === 'completed' ? '[x]' : '[ ]';
  const parts = [t.name];
  if (t.project) parts.push(`[${t.project}]`);
  if (t.dueDate) parts.push(t.dueDate);
  if (t.tags)
    parts.push(
      t.tags
        .split(',')
        .map((tag) => `#${tag.trim()}`)
        .join(' '),
    );
  const lines = [`${checkbox} ${parts.join(' \u2014 ')}`];
  if (t.notes) lines.push(`    ${firstLine(t.notes)}`);
  return lines.join('\n');
}

const plainFormatters: Formatters = {
  formatTodos(result) {
    const header = `${result.list} (${result.todos.length} todos)`;
    if (result.todos.length === 0) return `${header}\n\n(none)`;
    return `${header}\n\n${result.todos.map(plainTodoLine).join('\n')}`;
  },

  formatSearch(result) {
    const header = `Search: "${result.query}" (${result.results.length} results)`;
    if (result.results.length === 0) return `${header}\n\n(none)`;
    const lines = result.results.map((r) => {
      const checkbox = r.status === 'completed' ? '[x]' : '[ ]';
      const proj = r.project ? `  [${r.project}]` : '';
      const area = r.area ? `  {${r.area}}` : '';
      return `${checkbox} ${r.name}  [${r.list}]${proj}${area}`;
    });
    return `${header}\n\n${lines.join('\n')}`;
  },

  formatProjects(result) {
    const title = result.area ? `Projects in "${result.area}"` : 'All projects';
    const header = `${title} (${result.projects.length})`;
    if (result.projects.length === 0) return `${header}\n\n(none)`;
    const lines = result.projects.map((p) => {
      const parts = [p.name];
      if (p.area !== undefined) parts.push(`[${p.area}]`);
      const line = [parts.join('  ')];
      if (p.notes) line.push(`    ${firstLine(p.notes)}`);
      return line.join('\n');
    });
    return `${header}\n\n${lines.join('\n')}`;
  },

  formatProjectTodos(result) {
    const header = `Project: ${result.project} (${result.todos.length} todos)`;
    if (result.todos.length === 0) return `${header}\n\n(none)`;
    return `${header}\n\n${result.todos.map(plainTodoLine).join('\n')}`;
  },

  formatTags(result) {
    if (result.tags.length === 0) return 'Tags (0)\n(none)';
    return `Tags (${result.tags.length})\n${result.tags.join(', ')}`;
  },

  formatAreas(result) {
    if (result.areas.length === 0) return 'Areas (0)\n(none)';
    return `Areas (${result.areas.length})\n${result.areas.join(', ')}`;
  },

  formatAction(result) {
    return result.message;
  },
};

// ── Selector ───────────────────────────────────────────────────

const formatterMap: Record<FormatStyle, Formatters> = {
  pretty: prettyFormatters,
  table: tableFormatters,
  plain: plainFormatters,
};

export function getFormatters(style: FormatStyle = 'pretty'): Formatters {
  return formatterMap[style];
}

// ── Backward-compatible named exports (use pretty as default) ──

export const formatTodos = prettyFormatters.formatTodos;
export const formatSearch = prettyFormatters.formatSearch;
export const formatProjects = prettyFormatters.formatProjects;
export const formatProjectTodos = prettyFormatters.formatProjectTodos;
export const formatTags = prettyFormatters.formatTags;
export const formatAreas = prettyFormatters.formatAreas;
export const formatAction = prettyFormatters.formatAction;
