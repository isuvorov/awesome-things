import type { ProjectItem, SearchResultItem, TodoDetails, TodoItem } from '../types.js';

/** Decode URL-encoded strings that Things3 sometimes returns for notes. */
function decodeNotes(raw: string): string {
  if (!raw || !raw.includes('%')) return raw;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** One todo per line, fields separated by tabs — see parseProjectLines. */
export function parseTodoLines(output: string): TodoItem[] {
  if (!output.trim()) return [];
  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split('\t');
      return {
        id: parts[0] || '',
        name: parts[1] || '',
        status: parts[2] || '',
        notes: decodeNotes(parts[3] || ''),
        dueDate: parts[4] || '',
        tags: parts[5] || '',
        project: parts[6] || '',
      };
    });
}

/**
 * One project per line, fields separated by tabs. Records used to be joined by
 * ", " — which shredded every project whose notes contained a comma.
 */
export function parseProjectLines(output: string, withArea: boolean): ProjectItem[] {
  if (!output.trim()) return [];
  return output
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const parts = line.split('\t');
      const item: ProjectItem = {
        id: parts[0] || '',
        name: parts[1] || '',
        status: parts[2] || '',
        notes: decodeNotes(parts[3] || ''),
      };
      if (withArea) {
        item.area = (parts[4] || '').replace(/^Area:\s*/, '');
        item.tags = parts[5] || '';
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
        id: parts[0] || '',
        list: parts[1] || '',
        name: parts[2] || '',
        status: parts[3] || '',
        notes: decodeNotes(parts[4] || ''),
        dueDate: parts[5] || '',
        tags: parts[6] || '',
        project: parts[7] || '',
        area: parts[8] || '',
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
  // Pad to 7 lines — trailing empty lines may be stripped by trim()
  while (lines.length < 7) lines.push('');
  const ids = lines[0].split('\t');
  const names = lines[1].split('\t');
  const statuses = lines[2].split('\t');
  const notes = lines[3].split('\t');
  const dueDates = lines[4].split('\t');
  const tags = lines[5].split('\t');
  const projects = lines[6].split('\t');
  const count = ids.length;
  const todos: TodoItem[] = [];
  for (let i = 0; i < count; i++) {
    todos.push({
      id: ids[i] || '',
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

/** Separator of `getTodo` fields — notes hold tabs and newlines, never a unit separator. */
export const FIELD_SEPARATOR = '\x1f';

/** One todo, fields joined by FIELD_SEPARATOR in the order the getTodo script returns them. */
export function parseTodoDetails(output: string): TodoDetails | null {
  if (!output.trim()) return null;
  const [
    id,
    name,
    status,
    notes,
    dueDate,
    when,
    tags,
    project,
    area,
    created,
    modified,
    completed,
  ] = output.split(FIELD_SEPARATOR);
  return {
    id: id || '',
    name: name || '',
    status: status || '',
    // AppleScript hands back classic-Mac "return" line breaks as often as linefeeds.
    notes: (notes || '').replace(/\r\n?/g, '\n'),
    dueDate: dueDate || '',
    when: when || '',
    tags: tags || '',
    project: project || '',
    area: area || '',
    created: created || '',
    modified: modified || '',
    completed: completed || '',
  };
}

/**
 * Tags and areas come back tab-separated: their names routinely contain commas,
 * so ", " cannot be the separator.
 */
export function parseSimpleList(output: string): string[] {
  if (!output.trim()) return [];
  const separator = output.includes('\t') ? '\t' : ', ';
  return output
    .split(separator)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function filterTodosByStatus(
  todos: TodoItem[],
  status: 'open' | 'completed' | 'all' | undefined,
): TodoItem[] {
  if (!status || status === 'all') return todos;
  return todos.filter((t) => t.status === status);
}
