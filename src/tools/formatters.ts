import type {
  ActionResult,
  GetProjectTodosResult,
  ListAreasResult,
  ListProjectsResult,
  ListTagsResult,
  ListTodosResult,
  SearchTodosResult,
} from '../types.js';

export function formatTodos(result: ListTodosResult): string {
  if (result.todos.length === 0) return `Todos in ${result.list}:\n(none)`;
  const lines = result.todos.map(
    (t) => `${t.name} | ${t.status} | ${t.notes} | ${t.dueDate} | ${t.tags}`,
  );
  return `Todos in ${result.list}:\n${lines.join('\n')}`;
}

export function formatSearch(result: SearchTodosResult): string {
  if (result.results.length === 0) return `Search results for "${result.query}":\n(none)`;
  const lines = result.results.map((r) => `[${r.list}] ${r.name} (${r.status})`);
  return `Search results for "${result.query}":\n${lines.join('\n')}`;
}

export function formatProjects(result: ListProjectsResult): string {
  const header = result.area ? `Projects in area "${result.area}":` : 'All projects:';
  if (result.projects.length === 0) return `${header}\n(none)`;
  const lines = result.projects.map((p) => {
    const base = `${p.name} | ${p.status} | ${p.notes}`;
    return p.area !== undefined ? `${base} | Area: ${p.area}` : base;
  });
  return `${header}\n${lines.join('\n')}`;
}

export function formatProjectTodos(result: GetProjectTodosResult): string {
  if (result.todos.length === 0) return `Todos in project "${result.project}":\n(none)`;
  const lines = result.todos.map(
    (t) => `${t.name} | ${t.status} | ${t.notes} | ${t.dueDate} | ${t.tags}`,
  );
  return `Todos in project "${result.project}":\n${lines.join('\n')}`;
}

export function formatTags(result: ListTagsResult): string {
  if (result.tags.length === 0) return 'Available tags:\n(none)';
  return `Available tags:\n${result.tags.join(', ')}`;
}

export function formatAreas(result: ListAreasResult): string {
  if (result.areas.length === 0) return 'Available areas:\n(none)';
  return `Available areas:\n${result.areas.join(', ')}`;
}

export function formatAction(result: ActionResult): string {
  return result.message;
}
