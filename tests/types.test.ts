import { describe, expect, test } from 'bun:test';
import {
  CompleteTodoArgsSchema,
  CreateProjectArgsSchema,
  CreateTodoArgsSchema,
  GetProjectTodosArgsSchema,
  ListProjectsArgsSchema,
  ListTodosArgsSchema,
  MoveTodoArgsSchema,
  MoveTodoToProjectArgsSchema,
  SearchTodosArgsSchema,
  toolSchemas,
  UpdateTodoArgsSchema,
} from '../src/types.js';

describe('CreateTodoArgsSchema', () => {
  test('accepts valid minimal args', () => {
    const result = CreateTodoArgsSchema.parse({ name: 'Buy milk' });
    expect(result.name).toBe('Buy milk');
  });

  test('accepts full args', () => {
    const result = CreateTodoArgsSchema.parse({
      name: 'Buy milk',
      notes: 'From the store',
      due_date: '2026-03-01',
      tags: ['groceries', 'urgent'],
      list: 'today',
    });
    expect(result.name).toBe('Buy milk');
    expect(result.tags).toEqual(['groceries', 'urgent']);
    expect(result.list).toBe('today');
  });

  test('rejects missing name', () => {
    expect(() => CreateTodoArgsSchema.parse({})).toThrow();
  });

  test('rejects invalid list', () => {
    expect(() => CreateTodoArgsSchema.parse({ name: 'Test', list: 'invalid' })).toThrow();
  });
});

describe('ListTodosArgsSchema', () => {
  test('accepts valid list', () => {
    const result = ListTodosArgsSchema.parse({ list: 'today' });
    expect(result.list).toBe('today');
  });

  test('accepts with status filter', () => {
    const result = ListTodosArgsSchema.parse({ list: 'inbox', status: 'open' });
    expect(result.status).toBe('open');
  });

  test('rejects missing list', () => {
    expect(() => ListTodosArgsSchema.parse({})).toThrow();
  });

  test('accepts logbook', () => {
    const result = ListTodosArgsSchema.parse({ list: 'logbook' });
    expect(result.list).toBe('logbook');
  });
});

describe('CompleteTodoArgsSchema', () => {
  test('accepts valid name', () => {
    const result = CompleteTodoArgsSchema.parse({ name: 'My todo' });
    expect(result.name).toBe('My todo');
  });
});

describe('UpdateTodoArgsSchema', () => {
  test('accepts name only', () => {
    const result = UpdateTodoArgsSchema.parse({ name: 'My todo' });
    expect(result.name).toBe('My todo');
  });

  test('accepts all update fields', () => {
    const result = UpdateTodoArgsSchema.parse({
      name: 'My todo',
      new_name: 'Updated name',
      new_notes: 'Updated notes',
      new_due_date: '2026-04-01',
      new_tags: ['tag1'],
    });
    expect(result.new_name).toBe('Updated name');
    expect(result.new_due_date).toBe('2026-04-01');
  });
});

describe('SearchTodosArgsSchema', () => {
  test('accepts valid query', () => {
    const result = SearchTodosArgsSchema.parse({ query: 'meeting' });
    expect(result.query).toBe('meeting');
  });
});

describe('CreateProjectArgsSchema', () => {
  test('accepts valid name', () => {
    const result = CreateProjectArgsSchema.parse({ name: 'Q1 Planning' });
    expect(result.name).toBe('Q1 Planning');
  });

  test('accepts with area', () => {
    const result = CreateProjectArgsSchema.parse({ name: 'Renovate', area: 'Home' });
    expect(result.area).toBe('Home');
  });
});

describe('ListProjectsArgsSchema', () => {
  test('accepts empty', () => {
    const result = ListProjectsArgsSchema.parse({});
    expect(result.area).toBeUndefined();
  });

  test('accepts with area filter', () => {
    const result = ListProjectsArgsSchema.parse({ area: 'Work' });
    expect(result.area).toBe('Work');
  });
});

describe('GetProjectTodosArgsSchema', () => {
  test('accepts valid project name', () => {
    const result = GetProjectTodosArgsSchema.parse({ project_name: 'Q1' });
    expect(result.project_name).toBe('Q1');
  });
});

describe('MoveTodoArgsSchema', () => {
  test('accepts valid move args', () => {
    const result = MoveTodoArgsSchema.parse({
      todo_name: 'Buy milk',
      destination: 'today',
    });
    expect(result.destination).toBe('today');
  });

  test('rejects invalid destination', () => {
    expect(() => MoveTodoArgsSchema.parse({ todo_name: 'Test', destination: 'logbook' })).toThrow();
  });
});

describe('MoveTodoToProjectArgsSchema', () => {
  test('accepts valid args', () => {
    const result = MoveTodoToProjectArgsSchema.parse({
      todo_name: 'Buy milk',
      project_name: 'Groceries',
    });
    expect(result.project_name).toBe('Groceries');
  });
});

describe('toolSchemas', () => {
  test('has all 16 tool schemas', () => {
    const tools = Object.keys(toolSchemas);
    expect(tools).toHaveLength(16);
  });

  test('create_todo requires name', () => {
    expect(toolSchemas.create_todo.required).toContain('name');
  });

  test('list_todos requires list', () => {
    expect(toolSchemas.list_todos.required).toContain('list');
  });

  test('move_todo requires both fields', () => {
    expect(toolSchemas.move_todo.required).toContain('todo_name');
    expect(toolSchemas.move_todo.required).toContain('destination');
  });
});
