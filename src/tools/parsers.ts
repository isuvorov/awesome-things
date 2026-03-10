import type { ProjectItem, SearchResultItem, TodoItem } from '../types.js';

/** Decode URL-encoded strings that Things3 sometimes returns for notes. */
function decodeNotes(raw: string): string {
  if (!raw || !raw.includes('%')) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export function parseTodoLines(output: string): TodoItem[] {
  if (!output.trim()) return [];
  return output.split(', ').map((line) => {
    const parts = line.split(' | ');
    return {
      name: parts[0] || '',
      status: parts[1] || '',
      notes: decodeNotes(parts[2] || ''),
      dueDate: parts[3] || '',
      tags: parts[4] || '',
      project: parts[5] || '',
    };
  });
}

export function parseProjectLines(output: string, withArea: boolean): ProjectItem[] {
  if (!output.trim()) return [];
  return output.split(', ').map((line) => {
    const parts = line.split(' | ');
    const item: ProjectItem = {
      name: parts[0] || '',
      status: parts[1] || '',
      notes: decodeNotes(parts[2] || ''),
    };
    if (withArea && parts[3]) {
      item.area = parts[3].replace(/^Area:\s*/, '');
    }
    return item;
  });
}

export function parseSearchLines(output: string): SearchResultItem[] {
  if (!output.trim()) return [];
  const seen = new Set<string>();
  return output
    .split('\n')
    .map((line) => {
      const parts = line.split('\t');
      return {
        list: parts[0] || '',
        name: parts[1] || '',
        status: parts[2] || '',
        notes: decodeNotes(parts[3] || ''),
        dueDate: parts[4] || '',
        tags: parts[5] || '',
        project: parts[6] || '',
        area: parts[7] || '',
      };
    })
    .filter((item) => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    });
}

export function parseTodoColumns(output: string): TodoItem[] {
  if (!output.trim()) return [];
  const lines = output.split('\n');
  // Pad to 6 lines — trailing empty lines (notes, dates, tags, projects) may be stripped by trim()
  while (lines.length < 6) lines.push('');
  const names = lines[0].split('\t');
  const statuses = lines[1].split('\t');
  const notes = lines[2].split('\t');
  const dueDates = lines[3].split('\t');
  const tags = lines[4].split('\t');
  const projects = lines[5].split('\t');
  const count = names.length;
  const todos: TodoItem[] = [];
  for (let i = 0; i < count; i++) {
    todos.push({
      name: names[i] || '',
      status: statuses[i] || '',
      notes: decodeNotes(notes[i] || ''),
      dueDate: dueDates[i] || '',
      tags: tags[i] || '',
      project: projects[i] || '',
    });
  }
  return todos;
}

export function parseSimpleList(output: string): string[] {
  if (!output.trim()) return [];
  return output.split(', ');
}

export function filterTodosByStatus(
  todos: TodoItem[],
  status: 'open' | 'completed' | 'all' | undefined,
): TodoItem[] {
  if (!status || status === 'all') return todos;
  return todos.filter((t) => t.status === status);
}
