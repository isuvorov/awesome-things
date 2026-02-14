import type { ProjectItem, SearchResultItem, TodoItem } from '../types.js';

export function parseTodoLines(output: string): TodoItem[] {
  if (!output.trim()) return [];
  return output.split(', ').map((line) => {
    const parts = line.split(' | ');
    return {
      name: parts[0] || '',
      status: parts[1] || '',
      notes: parts[2] || '',
      dueDate: parts[3] || '',
      tags: parts[4] || '',
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
      notes: parts[2] || '',
    };
    if (withArea && parts[3]) {
      item.area = parts[3].replace(/^Area:\s*/, '');
    }
    return item;
  });
}

export function parseSearchLines(output: string): SearchResultItem[] {
  if (!output.trim()) return [];
  return output.split(', ').map((line) => {
    const match = line.match(/^\[(.+?)\]\s+(.+?)\s+\((.+?)\)$/);
    if (match) {
      return { list: match[1], name: match[2], status: match[3] };
    }
    return { list: '', name: line, status: '' };
  });
}

export function parseTodoColumns(output: string): TodoItem[] {
  if (!output.trim()) return [];
  const lines = output.split('\n');
  // Pad to 5 lines — trailing empty lines (notes, dates, tags) may be stripped by trim()
  while (lines.length < 5) lines.push('');
  const names = lines[0].split('\t');
  const statuses = lines[1].split('\t');
  const notes = lines[2].split('\t');
  const dueDates = lines[3].split('\t');
  const tags = lines[4].split('\t');
  const count = names.length;
  const todos: TodoItem[] = [];
  for (let i = 0; i < count; i++) {
    todos.push({
      name: names[i] || '',
      status: statuses[i] || '',
      notes: notes[i] || '',
      dueDate: dueDates[i] || '',
      tags: tags[i] || '',
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
