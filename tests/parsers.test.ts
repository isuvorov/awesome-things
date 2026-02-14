import { describe, expect, test } from 'bun:test';
import {
  filterTodosByStatus,
  parseProjectLines,
  parseSearchLines,
  parseSimpleList,
  parseTodoColumns,
  parseTodoLines,
} from '../src/tools/parsers.js';

describe('parseTodoLines', () => {
  test('returns empty array for empty string', () => {
    expect(parseTodoLines('')).toEqual([]);
  });

  test('returns empty array for whitespace', () => {
    expect(parseTodoLines('  ')).toEqual([]);
  });

  test('parses single todo', () => {
    const result = parseTodoLines('Buy milk | open | grocery note | 2024-01-01 | shopping');
    expect(result).toEqual([
      {
        name: 'Buy milk',
        status: 'open',
        notes: 'grocery note',
        dueDate: '2024-01-01',
        tags: 'shopping',
      },
    ]);
  });

  test('parses multiple todos', () => {
    const result = parseTodoLines(
      'Buy milk | open | note1 | 2024-01-01 | tag1, Task 2 | completed |  |  | tag2',
    );
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('Buy milk');
    expect(result[1].name).toBe('Task 2');
    expect(result[1].status).toBe('completed');
  });

  test('handles missing fields gracefully', () => {
    const result = parseTodoLines('Buy milk | open');
    expect(result[0]).toEqual({
      name: 'Buy milk',
      status: 'open',
      notes: '',
      dueDate: '',
      tags: '',
    });
  });
});

describe('parseTodoColumns', () => {
  test('returns empty array for empty string', () => {
    expect(parseTodoColumns('')).toEqual([]);
  });

  test('returns empty array for whitespace', () => {
    expect(parseTodoColumns('  ')).toEqual([]);
  });

  test('pads missing lines when trailing empty lines are trimmed', () => {
    expect(parseTodoColumns('a\nb\nc')).toEqual([
      { name: 'a', status: 'b', notes: 'c', dueDate: '', tags: '' },
    ]);
  });

  test('parses single todo', () => {
    const input = 'Buy milk\nopen\ngrocery note\n2024-01-01\nshopping';
    const result = parseTodoColumns(input);
    expect(result).toEqual([
      {
        name: 'Buy milk',
        status: 'open',
        notes: 'grocery note',
        dueDate: '2024-01-01',
        tags: 'shopping',
      },
    ]);
  });

  test('parses multiple todos', () => {
    const input = 'Buy milk\tTask 2\nopen\tcompleted\nnote1\t\n2024-01-01\t\ntag1\ttag2';
    const result = parseTodoColumns(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'Buy milk',
      status: 'open',
      notes: 'note1',
      dueDate: '2024-01-01',
      tags: 'tag1',
    });
    expect(result[1]).toEqual({
      name: 'Task 2',
      status: 'completed',
      notes: '',
      dueDate: '',
      tags: 'tag2',
    });
  });

  test('handles missing fields gracefully', () => {
    const input = 'Buy milk\tTask 2\nopen\tcompleted\n\t\n\t\n\t';
    const result = parseTodoColumns(input);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      name: 'Buy milk',
      status: 'open',
      notes: '',
      dueDate: '',
      tags: '',
    });
  });
});

describe('parseProjectLines', () => {
  test('returns empty array for empty string', () => {
    expect(parseProjectLines('', false)).toEqual([]);
  });

  test('parses projects without area', () => {
    const result = parseProjectLines('My Project | open | some notes', false);
    expect(result).toEqual([{ name: 'My Project', status: 'open', notes: 'some notes' }]);
  });

  test('parses projects with area', () => {
    const result = parseProjectLines('My Project | open | notes | Area: Work', true);
    expect(result).toEqual([{ name: 'My Project', status: 'open', notes: 'notes', area: 'Work' }]);
  });

  test('parses projects with empty area', () => {
    const result = parseProjectLines('My Project | open | notes | Area: ', true);
    expect(result).toEqual([{ name: 'My Project', status: 'open', notes: 'notes', area: '' }]);
  });
});

describe('parseSearchLines', () => {
  test('returns empty array for empty string', () => {
    expect(parseSearchLines('')).toEqual([]);
  });

  test('parses single search result', () => {
    const result = parseSearchLines('[Today] Buy milk (open)');
    expect(result).toEqual([{ list: 'Today', name: 'Buy milk', status: 'open' }]);
  });

  test('parses multiple search results', () => {
    const result = parseSearchLines('[Today] Buy milk (open), [Inbox] Buy bread (open)');
    expect(result).toHaveLength(2);
    expect(result[0].list).toBe('Today');
    expect(result[1].list).toBe('Inbox');
  });

  test('handles unparseable lines', () => {
    const result = parseSearchLines('some random text');
    expect(result).toEqual([{ list: '', name: 'some random text', status: '' }]);
  });
});

describe('parseSimpleList', () => {
  test('returns empty array for empty string', () => {
    expect(parseSimpleList('')).toEqual([]);
  });

  test('parses comma-separated list', () => {
    expect(parseSimpleList('work, personal, shopping')).toEqual(['work', 'personal', 'shopping']);
  });

  test('parses single item', () => {
    expect(parseSimpleList('work')).toEqual(['work']);
  });
});

describe('filterTodosByStatus', () => {
  const todos = [
    { name: 'A', status: 'open', notes: '', dueDate: '', tags: '' },
    { name: 'B', status: 'completed', notes: '', dueDate: '', tags: '' },
    { name: 'C', status: 'open', notes: '', dueDate: '', tags: '' },
  ];

  test('returns all when status is undefined', () => {
    expect(filterTodosByStatus(todos, undefined)).toEqual(todos);
  });

  test('returns all when status is "all"', () => {
    expect(filterTodosByStatus(todos, 'all')).toEqual(todos);
  });

  test('filters open todos', () => {
    const result = filterTodosByStatus(todos, 'open');
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.status === 'open')).toBe(true);
  });

  test('filters completed todos', () => {
    const result = filterTodosByStatus(todos, 'completed');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('B');
  });
});
