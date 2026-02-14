import { describe, expect, test } from 'bun:test';
import {
  formatAction,
  formatAreas,
  formatProjects,
  formatProjectTodos,
  formatSearch,
  formatTags,
  formatTodos,
} from '../src/tools/formatters.js';

describe('formatTodos', () => {
  test('formats empty list', () => {
    expect(formatTodos({ list: 'Today', todos: [] })).toBe('Todos in Today:\n(none)');
  });

  test('formats todos', () => {
    const result = formatTodos({
      list: 'Today',
      todos: [
        {
          name: 'Buy milk',
          status: 'open',
          notes: 'note',
          dueDate: '2024-01-01',
          tags: 'shopping',
        },
      ],
    });
    expect(result).toBe('Todos in Today:\nBuy milk | open | note | 2024-01-01 | shopping');
  });
});

describe('formatSearch', () => {
  test('formats empty results', () => {
    expect(formatSearch({ query: 'milk', results: [] })).toBe('Search results for "milk":\n(none)');
  });

  test('formats search results', () => {
    const result = formatSearch({
      query: 'milk',
      results: [{ list: 'Today', name: 'Buy milk', status: 'open' }],
    });
    expect(result).toBe('Search results for "milk":\n[Today] Buy milk (open)');
  });
});

describe('formatProjects', () => {
  test('formats all projects header', () => {
    expect(formatProjects({ projects: [] })).toBe('All projects:\n(none)');
  });

  test('formats area-filtered header', () => {
    expect(formatProjects({ area: 'Work', projects: [] })).toBe('Projects in area "Work":\n(none)');
  });

  test('formats projects with area', () => {
    const result = formatProjects({
      projects: [{ name: 'P1', status: 'open', notes: 'n', area: 'Work' }],
    });
    expect(result).toBe('All projects:\nP1 | open | n | Area: Work');
  });

  test('formats projects without area', () => {
    const result = formatProjects({
      area: 'Work',
      projects: [{ name: 'P1', status: 'open', notes: 'n' }],
    });
    expect(result).toBe('Projects in area "Work":\nP1 | open | n');
  });
});

describe('formatProjectTodos', () => {
  test('formats empty project todos', () => {
    expect(formatProjectTodos({ project: 'MyProj', todos: [] })).toBe(
      'Todos in project "MyProj":\n(none)',
    );
  });

  test('formats project todos', () => {
    const result = formatProjectTodos({
      project: 'MyProj',
      todos: [{ name: 'Task', status: 'open', notes: '', dueDate: '', tags: '' }],
    });
    expect(result).toBe('Todos in project "MyProj":\nTask | open |  |  | ');
  });
});

describe('formatTags', () => {
  test('formats empty tags', () => {
    expect(formatTags({ tags: [] })).toBe('Available tags:\n(none)');
  });

  test('formats tags', () => {
    expect(formatTags({ tags: ['work', 'personal'] })).toBe('Available tags:\nwork, personal');
  });
});

describe('formatAreas', () => {
  test('formats empty areas', () => {
    expect(formatAreas({ areas: [] })).toBe('Available areas:\n(none)');
  });

  test('formats areas', () => {
    expect(formatAreas({ areas: ['Work', 'Personal'] })).toBe('Available areas:\nWork, Personal');
  });
});

describe('formatAction', () => {
  test('returns message', () => {
    expect(formatAction({ message: 'Created todo: Buy milk' })).toBe('Created todo: Buy milk');
  });
});
