import { describe, expect, mock, test } from 'bun:test';

// Track all execute() calls
const executeCalls: string[] = [];
let executeResult = '';

// Clear mocks from other test files (e.g. server.test.ts mocks API modules)
mock.restore();

mock.module('../src/utils/applescript.js', () => ({
  execute: mock(async (script: string) => {
    executeCalls.push(script);
    return executeResult;
  }),
  tellThings: (command: string) => `tell application "Things3"\n${command}\nend tell`,
  quoteString: (s: string) => {
    const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `"${escaped}"`;
  },
  buildProperties: (props: [string, string][]) => {
    if (props.length === 0) return '{}';
    const parts = props.map(([key, value]: [string, string]) => `${key}:${value}`);
    return `{${parts.join(', ')}}`;
  },
  capitalize: (s: string) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)),
}));

import { listAreas, listTags } from '../src/api/list-ops.js';
import {
  moveProjectToArea,
  moveTodo,
  moveTodoToArea,
  moveTodoToProject,
  removeProjectFromArea,
  removeTodoFromProject,
} from '../src/api/move-ops.js';
import { createProject, getProjectTodos, listProjects } from '../src/api/project-ops.js';
import {
  completeTodo,
  createTodo,
  listTodos,
  searchTodos,
  updateTodo,
} from '../src/api/todo-ops.js';

function resetExecute(result = '') {
  executeCalls.length = 0;
  executeResult = result;
}

// ── todo-ops ────────────────────────────────────────────────────

describe('createTodo', () => {
  test('creates todo with name only', async () => {
    resetExecute();
    const result = await createTodo({ name: 'Buy milk' });
    expect(result.message).toBe('Created todo: Buy milk');
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]).toContain('make new to do');
    expect(executeCalls[0]).toContain('"Buy milk"');
    expect(executeCalls[0]).toContain('in list "Inbox"');
  });

  test('creates todo in specified list', async () => {
    resetExecute();
    await createTodo({ name: 'Task', list: 'today' });
    expect(executeCalls[0]).toContain('in list "Today"');
  });

  test('creates todo in project', async () => {
    resetExecute();
    const result = await createTodo({ name: 'Task', project: 'Groceries' });
    expect(result.message).toBe('Created todo: Task in project "Groceries"');
    expect(executeCalls[0]).toContain('at beginning of project "Groceries"');
    expect(executeCalls[0]).not.toContain('in list');
  });

  test('creates todo with notes', async () => {
    resetExecute();
    await createTodo({ name: 'Task', notes: 'Some notes' });
    expect(executeCalls[0]).toContain('notes:"Some notes"');
  });

  test('creates todo with due date', async () => {
    resetExecute();
    await createTodo({ name: 'Task', due_date: '2026-03-01' });
    expect(executeCalls[0]).toContain('due date:date "2026-03-01"');
  });

  test('creates todo with tags', async () => {
    resetExecute();
    await createTodo({ name: 'Task', tags: ['urgent', 'work'] });
    expect(executeCalls[0]).toContain('tag names:"urgent, work"');
  });

  test('creates todo in area', async () => {
    resetExecute();
    const result = await createTodo({ name: 'Task', area: 'Home' });
    expect(result.message).toBe('Created todo: Task in area "Home"');
    expect(executeCalls[0]).toContain('area:area "Home"');
    expect(executeCalls[0]).toContain('in list "Inbox"');
  });

  test('ignores area when project is specified', async () => {
    resetExecute();
    const result = await createTodo({ name: 'Task', project: 'Proj', area: 'Home' });
    expect(result.message).toBe('Created todo: Task in project "Proj"');
    expect(executeCalls[0]).not.toContain('area');
    expect(executeCalls[0]).toContain('at beginning of project "Proj"');
  });

  test('creates todo in project and moves to list when both specified', async () => {
    resetExecute();
    await createTodo({ name: 'Task', project: 'Proj', list: 'today' });
    expect(executeCalls).toHaveLength(2);
    expect(executeCalls[0]).toContain('at beginning of project "Proj"');
    expect(executeCalls[1]).toContain('move to do named "Task" to list "Today"');
  });

  test('does not move when project specified without list', async () => {
    resetExecute();
    await createTodo({ name: 'Task', project: 'Proj' });
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]).toContain('at beginning of project "Proj"');
  });

  test('creates todo with all options', async () => {
    resetExecute();
    const result = await createTodo({
      name: 'Full task',
      notes: 'Details',
      due_date: '2026-04-01',
      tags: ['a', 'b'],
      project: 'Proj',
    });
    expect(result.message).toBe('Created todo: Full task in project "Proj"');
    const script = executeCalls[0];
    expect(script).toContain('name:"Full task"');
    expect(script).toContain('notes:"Details"');
    expect(script).toContain('due date:date "2026-04-01"');
    expect(script).toContain('tag names:"a, b"');
    expect(script).toContain('at beginning of project "Proj"');
  });
});

describe('listTodos', () => {
  test('returns empty list when output is empty', async () => {
    resetExecute('');
    const result = await listTodos({ list: 'today' });
    expect(result.list).toBe('Today');
    expect(result.todos).toEqual([]);
  });

  test('parses column output', async () => {
    resetExecute('Buy milk\tClean house\nopen\tcompleted\nnote1\tnote2\n2024-01-15\t\nshop\t');
    const result = await listTodos({ list: 'inbox' });
    expect(result.list).toBe('Inbox');
    expect(result.todos).toHaveLength(2);
    expect(result.todos[0]).toEqual({
      name: 'Buy milk',
      status: 'open',
      notes: 'note1',
      dueDate: '2024-01-15',
      tags: 'shop',
    });
    expect(result.todos[1]).toEqual({
      name: 'Clean house',
      status: 'completed',
      notes: 'note2',
      dueDate: '',
      tags: '',
    });
  });

  test('filters by status', async () => {
    resetExecute('A\tB\nopen\tcompleted\n\t\n\t\n\t');
    const result = await listTodos({ list: 'today', status: 'open' });
    expect(result.todos).toHaveLength(1);
    expect(result.todos[0].name).toBe('A');
  });

  test('script references the correct list', async () => {
    resetExecute('');
    await listTodos({ list: 'someday' });
    expect(executeCalls[0]).toContain('"Someday"');
  });
});

describe('completeTodo', () => {
  test('completes todo and returns message', async () => {
    resetExecute();
    const result = await completeTodo({ name: 'Done task' });
    expect(result.message).toBe('Completed todo: Done task');
    expect(executeCalls[0]).toContain('set status of to do named "Done task" to completed');
  });
});

describe('updateTodo', () => {
  test('updates name', async () => {
    resetExecute();
    const result = await updateTodo({ name: 'Old', new_name: 'New' });
    expect(result.message).toBe('Updated todo: Old');
    expect(executeCalls[0]).toContain('set name of to do named "Old" to "New"');
  });

  test('updates notes', async () => {
    resetExecute();
    await updateTodo({ name: 'Task', new_notes: 'Updated notes' });
    expect(executeCalls[0]).toContain('set notes of to do named "Task" to "Updated notes"');
  });

  test('updates due date', async () => {
    resetExecute();
    await updateTodo({ name: 'Task', new_due_date: '2026-05-01' });
    expect(executeCalls[0]).toContain('set due date of to do named "Task" to date "2026-05-01"');
  });

  test('clears due date with none', async () => {
    resetExecute();
    await updateTodo({ name: 'Task', new_due_date: 'none' });
    expect(executeCalls[0]).toContain('set due date of to do named "Task" to missing value');
  });

  test('updates tags', async () => {
    resetExecute();
    await updateTodo({ name: 'Task', new_tags: ['x', 'y'] });
    expect(executeCalls[0]).toContain('set tag names of to do named "Task" to "x, y"');
  });

  test('returns no-op message when no updates specified', async () => {
    resetExecute();
    const result = await updateTodo({ name: 'Task' });
    expect(result.message).toBe('No updates specified for todo: Task');
    expect(executeCalls).toHaveLength(0);
  });

  test('combines multiple updates in one script', async () => {
    resetExecute();
    await updateTodo({ name: 'Task', new_name: 'Renamed', new_notes: 'New notes' });
    const script = executeCalls[0];
    expect(script).toContain('set name of to do named "Task" to "Renamed"');
    expect(script).toContain('set notes of to do named "Task" to "New notes"');
  });
});

describe('searchTodos', () => {
  test('returns empty results for empty output', async () => {
    resetExecute('');
    const result = await searchTodos({ query: 'nothing' });
    expect(result.query).toBe('nothing');
    expect(result.results).toEqual([]);
  });

  test('parses search results', async () => {
    resetExecute('[Today] Buy milk (open), [Inbox] Milk note (completed)');
    const result = await searchTodos({ query: 'milk' });
    expect(result.query).toBe('milk');
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({ list: 'Today', name: 'Buy milk', status: 'open' });
    expect(result.results[1]).toEqual({ list: 'Inbox', name: 'Milk note', status: 'completed' });
  });

  test('script contains search query', async () => {
    resetExecute('');
    await searchTodos({ query: 'meeting' });
    expect(executeCalls[0]).toContain('"meeting"');
  });
});

// ── project-ops ─────────────────────────────────────────────────

describe('createProject', () => {
  test('creates project with name only', async () => {
    resetExecute();
    const result = await createProject({ name: 'New project' });
    expect(result.message).toBe('Created project: New project');
    expect(executeCalls[0]).toContain('make new project with properties');
    expect(executeCalls[0]).toContain('name:"New project"');
  });

  test('creates project with notes', async () => {
    resetExecute();
    await createProject({ name: 'Proj', notes: 'My notes' });
    expect(executeCalls[0]).toContain('notes:"My notes"');
  });

  test('creates project with area', async () => {
    resetExecute();
    await createProject({ name: 'Proj', area: 'Work' });
    expect(executeCalls[0]).toContain('area:area "Work"');
  });
});

describe('listProjects', () => {
  test('returns empty list when output is empty', async () => {
    resetExecute('');
    const result = await listProjects({});
    expect(result.projects).toEqual([]);
  });

  test('parses projects with area', async () => {
    resetExecute('Proj1 | open | notes1 | Area: Work, Proj2 | completed | notes2 | Area: Home');
    const result = await listProjects({});
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0]).toEqual({
      name: 'Proj1',
      status: 'open',
      notes: 'notes1',
      area: 'Work',
    });
  });

  test('parses projects without area when filtered', async () => {
    resetExecute('Proj1 | open | notes1');
    const result = await listProjects({ area: 'Work' });
    expect(result.area).toBe('Work');
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0]).toEqual({
      name: 'Proj1',
      status: 'open',
      notes: 'notes1',
    });
  });

  test('script references area when filtered', async () => {
    resetExecute('');
    await listProjects({ area: 'Work' });
    expect(executeCalls[0]).toContain('every project of area "Work"');
  });
});

describe('getProjectTodos', () => {
  test('returns empty when output is empty', async () => {
    resetExecute('');
    const result = await getProjectTodos({ project_name: 'Proj' });
    expect(result.project).toBe('Proj');
    expect(result.todos).toEqual([]);
  });

  test('parses project todos', async () => {
    resetExecute('Task A | open | note | 2024-06-01 | tag1');
    const result = await getProjectTodos({ project_name: 'My Project' });
    expect(result.todos).toHaveLength(1);
    expect(result.todos[0]).toEqual({
      name: 'Task A',
      status: 'open',
      notes: 'note',
      dueDate: '2024-06-01',
      tags: 'tag1',
    });
  });

  test('filters by status', async () => {
    resetExecute('A | open | | | , B | completed | | | ');
    const result = await getProjectTodos({ project_name: 'P', status: 'completed' });
    expect(result.todos).toHaveLength(1);
    expect(result.todos[0].name).toBe('B');
  });

  test('script references project name', async () => {
    resetExecute('');
    await getProjectTodos({ project_name: 'Groceries' });
    expect(executeCalls[0]).toContain('every to do of project "Groceries"');
  });
});

// ── list-ops ────────────────────────────────────────────────────

describe('listTags', () => {
  test('returns empty array when output is empty', async () => {
    resetExecute('');
    const result = await listTags();
    expect(result.tags).toEqual([]);
  });

  test('parses tags', async () => {
    resetExecute('work, personal, shopping');
    const result = await listTags();
    expect(result.tags).toEqual(['work', 'personal', 'shopping']);
  });

  test('script asks for tag names', async () => {
    resetExecute('');
    await listTags();
    expect(executeCalls[0]).toContain('return name of tags as string');
  });
});

describe('listAreas', () => {
  test('returns empty array when output is empty', async () => {
    resetExecute('');
    const result = await listAreas();
    expect(result.areas).toEqual([]);
  });

  test('parses areas', async () => {
    resetExecute('Work, Personal');
    const result = await listAreas();
    expect(result.areas).toEqual(['Work', 'Personal']);
  });

  test('script asks for area names', async () => {
    resetExecute('');
    await listAreas();
    expect(executeCalls[0]).toContain('return name of areas as string');
  });
});

// ── move-ops ────────────────────────────────────────────────────

describe('moveTodo', () => {
  test('moves todo and returns message', async () => {
    resetExecute();
    const result = await moveTodo({ todo_name: 'Task', destination: 'today' });
    expect(result.message).toBe('Moved todo "Task" to Today');
    expect(executeCalls[0]).toContain('move to do named "Task" to list "Today"');
  });
});

describe('moveTodoToProject', () => {
  test('moves todo to project and returns message', async () => {
    resetExecute();
    const result = await moveTodoToProject({ todo_name: 'Task', project_name: 'Work' });
    expect(result.message).toBe('Moved todo "Task" to project "Work"');
    expect(executeCalls[0]).toContain('set project of to do named "Task" to project "Work"');
  });
});

describe('moveTodoToArea', () => {
  test('moves todo to area and returns message', async () => {
    resetExecute();
    const result = await moveTodoToArea({ todo_name: 'Task', area_name: 'Home' });
    expect(result.message).toBe('Moved todo "Task" to area "Home"');
    expect(executeCalls[0]).toContain('set area of to do named "Task" to area "Home"');
  });
});

describe('moveProjectToArea', () => {
  test('moves project to area and returns message', async () => {
    resetExecute();
    const result = await moveProjectToArea({ project_name: 'Proj', area_name: 'Work' });
    expect(result.message).toBe('Moved project "Proj" to area "Work"');
    expect(executeCalls[0]).toContain('set area of project "Proj" to area "Work"');
  });
});

describe('removeTodoFromProject', () => {
  test('removes todo from project and returns message', async () => {
    resetExecute();
    const result = await removeTodoFromProject({ todo_name: 'Task' });
    expect(result.message).toBe('Removed todo "Task" from its project');
    expect(executeCalls[0]).toContain('delete project of to do named "Task"');
  });
});

describe('removeProjectFromArea', () => {
  test('removes project from area and returns message', async () => {
    resetExecute();
    const result = await removeProjectFromArea({ project_name: 'Proj' });
    expect(result.message).toBe('Removed project "Proj" from its area');
    expect(executeCalls[0]).toContain('delete area of project "Proj"');
  });
});
