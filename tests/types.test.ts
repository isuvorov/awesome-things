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

  test('accepts project parameter', () => {
    const result = CreateTodoArgsSchema.parse({
      name: 'Buy milk',
      project: 'Groceries',
    });
    expect(result.name).toBe('Buy milk');
    expect(result.project).toBe('Groceries');
  });

  test('accepts project with other optional fields', () => {
    const result = CreateTodoArgsSchema.parse({
      name: 'Buy milk',
      notes: 'Whole milk',
      project: 'Groceries',
      tags: ['urgent'],
    });
    expect(result.project).toBe('Groceries');
    expect(result.notes).toBe('Whole milk');
    expect(result.tags).toEqual(['urgent']);
  });

  test('accepts area parameter', () => {
    const result = CreateTodoArgsSchema.parse({
      name: 'Buy milk',
      area: 'Home',
    });
    expect(result.name).toBe('Buy milk');
    expect(result.area).toBe('Home');
  });

  test('accepts area with other optional fields', () => {
    const result = CreateTodoArgsSchema.parse({
      name: 'Buy milk',
      notes: 'Whole milk',
      area: 'Home',
      tags: ['urgent'],
    });
    expect(result.area).toBe('Home');
    expect(result.notes).toBe('Whole milk');
    expect(result.tags).toEqual(['urgent']);
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

  test('accepts evening destination', () => {
    const result = MoveTodoArgsSchema.parse({
      todo_name: 'Buy milk',
      destination: 'evening',
    });
    expect(result.destination).toBe('evening');
  });

  test('accepts upcoming destination', () => {
    const result = MoveTodoArgsSchema.parse({
      todo_name: 'Buy milk',
      destination: 'upcoming',
    });
    expect(result.destination).toBe('upcoming');
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

  test('create_todo has project property', () => {
    expect(toolSchemas.create_todo.properties).toHaveProperty('project');
    expect(toolSchemas.create_todo.properties.project.type).toBe('string');
  });

  test('create_todo has area property', () => {
    expect(toolSchemas.create_todo.properties).toHaveProperty('area');
    expect(toolSchemas.create_todo.properties.area.type).toBe('string');
  });

  test('list_todos requires list', () => {
    expect(toolSchemas.list_todos.required).toContain('list');
  });

  test('move_todo requires destination', () => {
    expect(toolSchemas.move_todo.required).toContain('destination');
  });

  test('move_todo has id property', () => {
    expect(toolSchemas.move_todo.properties).toHaveProperty('id');
    expect(toolSchemas.move_todo.properties.id.type).toBe('string');
  });
});
