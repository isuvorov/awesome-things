import { describe, expect, mock, test } from 'bun:test';

// Track all execute() calls
const executeCalls: string[] = [];
let executeResult = '';
let executeResults: string[] = [];
let executeCallIndex = 0;

// Clear mocks from other test files (e.g. server.test.ts mocks API modules)
mock.restore();

mock.module('../src/utils/applescript.js', () => ({
  execute: mock(async (script: string) => {
    executeCalls.push(script);
    if (executeResults.length > 0) {
      return executeResults[executeCallIndex++] || '';
    }
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
  buildDateVar: (isoDate: string, varName = 'dueD') => {
    const [year, month, day] = isoDate.split('-').map(Number);
    return [
      `set ${varName} to current date`,
      `set year of ${varName} to ${year}`,
      `set month of ${varName} to ${month}`,
      `set day of ${varName} to ${day}`,
      `set time of ${varName} to 0`,
    ].join('\n');
  },
  capitalize: (s: string) => (s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1)),
  todoRef: (args: { id?: string; todo_name?: string; name?: string }) => {
    const id = args.id;
    const name = 'todo_name' in args ? args.todo_name : args.name;
    if (id) return `to do id "${id}"`;
    if (name) {
      const escaped = name.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return `to do named "${escaped}"`;
    }
    throw new Error('Either id or name must be provided');
  },
  todoLabel: (args: { id?: string; todo_name?: string; name?: string }) => {
    const name = 'todo_name' in args ? args.todo_name : args.name;
    return name ? `"${name}"` : `id:${args.id}`;
  },
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
import {
  createProject,
  getProjectTodos,
  listProjects,
  updateProject,
} from '../src/api/project-ops.js';
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
  executeResults = [];
  executeCallIndex = 0;
}

function resetExecuteMulti(...results: string[]) {
  executeCalls.length = 0;
  executeResult = '';
  executeResults = results;
  executeCallIndex = 0;
}

// ── todo-ops ────────────────────────────────────────────────────

describe('createTodo', () => {
  test('creates todo with name only', async () => {
    resetExecute('ABC123');
    const result = await createTodo({ name: 'Buy milk' });
    expect(result.message).toBe('Created todo: Buy milk');
    expect(result.id).toBe('ABC123');
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]).toContain('make new to do');
    expect(executeCalls[0]).toContain('"Buy milk"');
    expect(executeCalls[0]).toContain('in list "Inbox"');
    expect(executeCalls[0]).toContain('return id of newTodo');
  });

  test('creates todo in specified list', async () => {
    resetExecute('ID1');
    await createTodo({ name: 'Task', list: 'today' });
    expect(executeCalls[0]).toContain('in list "Today"');
  });

  test('creates todo in project via set project, not the project container', async () => {
    resetExecute('ID2');
    const result = await createTodo({ name: 'Task', project: 'Groceries' });
    expect(result.message).toBe('Created todo: Task in project "Groceries"');
    expect(result.id).toBe('ID2');
    // `make new to do at beginning of project` silently drops the todo in Inbox
    expect(executeCalls[0]).not.toContain('at beginning of project');
    expect(executeCalls[0]).toContain('set project of newTodo to project "Groceries"');
  });

  test('creates todo with notes', async () => {
    resetExecute('ID3');
    await createTodo({ name: 'Task', notes: 'Some notes' });
    expect(executeCalls[0]).toContain('notes:"Some notes"');
  });

  test('creates todo with due date', async () => {
    resetExecute('ID4');
    await createTodo({ name: 'Task', due_date: '2026-03-01' });
    expect(executeCalls[0]).toContain('set year of dueD to 2026');
    expect(executeCalls[0]).toContain('set month of dueD to 3');
    expect(executeCalls[0]).toContain('set day of dueD to 1');
    expect(executeCalls[0]).toContain('due date:dueD');
  });

  test('creates todo with tags', async () => {
    resetExecute('ID5');
    await createTodo({ name: 'Task', tags: ['urgent', 'work'] });
    expect(executeCalls[0]).toContain('tag names:"urgent, work"');
  });

  test('creates todo in area', async () => {
    resetExecuteMulti('ID6', '');
    const result = await createTodo({ name: 'Task', area: 'Home' });
    expect(result.message).toBe('Created todo: Task in area "Home"');
    expect(result.id).toBe('ID6');
    expect(executeCalls[0]).toContain('in list "Inbox"');
    expect(executeCalls[1]).toContain('set area of to do named "Task" to area "Home"');
  });

  test('ignores area when project is specified', async () => {
    resetExecute('ID7');
    const result = await createTodo({ name: 'Task', project: 'Proj', area: 'Home' });
    expect(result.message).toBe('Created todo: Task in project "Proj"');
    expect(executeCalls[0]).not.toContain('set area');
    expect(executeCalls[0]).toContain('set project of newTodo to project "Proj"');
    expect(executeCalls.length).toBe(1);
  });

  test('schedules a project todo for today instead of moving it out of the project', async () => {
    resetExecuteMulti('ID8', '');
    await createTodo({ name: 'Task', project: 'Proj', list: 'today' });
    expect(executeCalls).toHaveLength(2);
    expect(executeCalls[0]).toContain('set project of newTodo to project "Proj"');
    expect(executeCalls[1]).toContain('schedule to do id "ID8" for (current date)');
    expect(executeCalls[1]).not.toContain('move');
  });

  test('leaves a project todo alone for anytime — it already shows up there', async () => {
    resetExecute('ID8b');
    await createTodo({ name: 'Task', project: 'Proj', list: 'anytime' });
    expect(executeCalls).toHaveLength(1);
  });

  test('uses a list move for someday, the one that keeps the project', async () => {
    resetExecuteMulti('ID8c', '');
    await createTodo({ name: 'Task', project: 'Proj', list: 'someday' });
    expect(executeCalls[1]).toContain('move to do id "ID8c" to list "Someday"');
  });

  test('does not move when project specified without list', async () => {
    resetExecute('ID9');
    await createTodo({ name: 'Task', project: 'Proj' });
    expect(executeCalls).toHaveLength(1);
    expect(executeCalls[0]).toContain('set project of newTodo to project "Proj"');
  });

  test('creates todo with all options', async () => {
    resetExecute('ID10');
    const result = await createTodo({
      name: 'Full task',
      notes: 'Details',
      due_date: '2026-04-01',
      tags: ['a', 'b'],
      project: 'Proj',
    });
    expect(result.message).toBe('Created todo: Full task in project "Proj"');
    expect(result.id).toBe('ID10');
    const script = executeCalls[0];
    expect(script).toContain('name:"Full task"');
    expect(script).toContain('notes:"Details"');
    expect(script).toContain('due date:dueD');
    expect(script).toContain('tag names:"a, b"');
    expect(script).toContain('set project of newTodo to project "Proj"');
  });
});

describe('listTodos', () => {
  test('returns empty list when output is empty', async () => {
    resetExecute('');
    const result = await listTodos({ list: 'today' });
    expect(result.list).toBe('Today');
    expect(result.todos).toEqual([]);
  });

  test('parses column output with id', async () => {
    resetExecute(
      'id1\tid2\nBuy milk\tClean house\nopen\tcompleted\nnote1\tnote2\n2024-01-15\t\nshop\t\nProj1\t',
    );
    const result = await listTodos({ list: 'inbox' });
    expect(result.list).toBe('Inbox');
    expect(result.todos).toHaveLength(2);
    expect(result.todos[0]).toEqual({
      id: 'id1',
      name: 'Buy milk',
      status: 'open',
      notes: 'note1',
      dueDate: '2024-01-15',
      tags: 'shop',
      project: 'Proj1',
    });
    expect(result.todos[1]).toEqual({
      id: 'id2',
      name: 'Clean house',
      status: 'completed',
      notes: 'note2',
      dueDate: '',
      tags: '',
      project: '',
    });
  });

  test('filters by status', async () => {
    resetExecute('id1\tid2\nA\tB\nopen\tcompleted\n\t\n\t\n\t');
    const result = await listTodos({ list: 'today', status: 'open' });
    expect(result.todos).toHaveLength(1);
    expect(result.todos[0].name).toBe('A');
    expect(result.todos[0].id).toBe('id1');
  });

  test('script references the correct list and fetches ids', async () => {
    resetExecute('');
    await listTodos({ list: 'someday' });
    expect(executeCalls[0]).toContain('"Someday"');
    expect(executeCalls[0]).toContain('set allIds to id of');
  });
});

describe('completeTodo', () => {
  test('completes todo by name and returns message with id', async () => {
    resetExecute('DONE-ID');
    const result = await completeTodo({ name: 'Done task' });
    expect(result.message).toBe('Completed todo: "Done task"');
    expect(result.id).toBe('DONE-ID');
    expect(executeCalls[0]).toContain('set status of to do named "Done task" to completed');
  });

  test('completes todo by id', async () => {
    resetExecute('DONE-ID2');
    const result = await completeTodo({ id: 'DONE-ID2' });
    expect(result.message).toBe('Completed todo: id:DONE-ID2');
    expect(result.id).toBe('DONE-ID2');
    expect(executeCalls[0]).toContain('set status of to do id "DONE-ID2" to completed');
  });
});

describe('updateTodo', () => {
  test('updates name', async () => {
    resetExecute('UPD-ID');
    const result = await updateTodo({ name: 'Old', new_name: 'New' });
    expect(result.message).toBe('Updated todo: "Old"');
    expect(result.id).toBe('UPD-ID');
    expect(executeCalls[0]).toContain('set name of to do named "Old" to "New"');
  });

  test('updates by id', async () => {
    resetExecute('UPD-ID2');
    const result = await updateTodo({ id: 'UPD-ID2', new_name: 'New' });
    expect(result.message).toBe('Updated todo: id:UPD-ID2');
    expect(result.id).toBe('UPD-ID2');
    expect(executeCalls[0]).toContain('set name of to do id "UPD-ID2" to "New"');
  });

  test('updates notes', async () => {
    resetExecute('UPD-ID3');
    await updateTodo({ name: 'Task', new_notes: 'Updated notes' });
    expect(executeCalls[0]).toContain('set notes of to do named "Task" to "Updated notes"');
  });

  test('updates due date', async () => {
    resetExecute('UPD-ID4');
    await updateTodo({ name: 'Task', new_due_date: '2026-05-01' });
    expect(executeCalls[0]).toContain('set year of dueD to 2026');
    expect(executeCalls[0]).toContain('set month of dueD to 5');
    expect(executeCalls[0]).toContain('set day of dueD to 1');
    expect(executeCalls[0]).toContain('set due date of to do named "Task" to dueD');
  });

  test('clears due date with none', async () => {
    resetExecute('UPD-ID5');
    await updateTodo({ name: 'Task', new_due_date: 'none' });
    expect(executeCalls[0]).toContain('set due date of to do named "Task" to missing value');
  });

  test('updates tags', async () => {
    resetExecute('UPD-ID6');
    await updateTodo({ name: 'Task', new_tags: ['x', 'y'] });
    expect(executeCalls[0]).toContain('set tag names of to do named "Task" to "x, y"');
  });

  test('returns no-op message when no updates specified', async () => {
    resetExecute();
    const result = await updateTodo({ name: 'Task' });
    expect(result.message).toBe('No updates specified for todo: "Task"');
    expect(executeCalls).toHaveLength(0);
  });

  test('combines multiple updates in one script', async () => {
    resetExecute('UPD-ID7');
    await updateTodo({ name: 'Task', new_name: 'Renamed', new_notes: 'New notes' });
    const script = executeCalls[0];
    expect(script).toContain('set name of to do named "Task" to "Renamed"');
    expect(script).toContain('set notes of to do named "Task" to "New notes"');
    expect(script).toContain('return id of to do named "Task"');
  });
});

describe('searchTodos', () => {
  test('returns empty results for empty output', async () => {
    resetExecute('');
    const result = await searchTodos({ query: 'nothing' });
    expect(result.query).toBe('nothing');
    expect(result.results).toEqual([]);
  });

  test('parses search results with id', async () => {
    resetExecute(
      'id1\tToday\tBuy milk\topen\tgrocery note\t2024-01-01\tshopping\tProj1\tWork\nid2\tInbox\tMilk note\tcompleted\t\t\t\t\t',
    );
    const result = await searchTodos({ query: 'milk' });
    expect(result.query).toBe('milk');
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      id: 'id1',
      list: 'Today',
      name: 'Buy milk',
      status: 'open',
      notes: 'grocery note',
      dueDate: '2024-01-01',
      tags: 'shopping',
      project: 'Proj1',
      area: 'Work',
    });
    expect(result.results[1]).toEqual({
      id: 'id2',
      list: 'Inbox',
      name: 'Milk note',
      status: 'completed',
      notes: '',
      dueDate: '',
      tags: '',
      project: '',
      area: '',
    });
  });

  test('script contains search query and fetches id', async () => {
    resetExecute('');
    await searchTodos({ query: 'meeting' });
    expect(executeCalls[0]).toContain('"meeting"');
    expect(executeCalls[0]).toContain('set todoId to id of t');
  });
});

// ── project-ops ─────────────────────────────────────────────────

describe('createProject', () => {
  test('creates project with name only and returns id', async () => {
    resetExecute('PROJ-ID');
    const result = await createProject({ name: 'New project' });
    expect(result.message).toBe('Created project: New project');
    expect(result.id).toBe('PROJ-ID');
    expect(executeCalls[0]).toContain('make new project with properties');
    expect(executeCalls[0]).toContain('name:"New project"');
    expect(executeCalls[0]).toContain('return id of newProj');
  });

  test('creates project with notes', async () => {
    resetExecute('PROJ-ID2');
    await createProject({ name: 'Proj', notes: 'My notes' });
    expect(executeCalls[0]).toContain('notes:"My notes"');
  });

  test('creates project with area', async () => {
    resetExecute('PROJ-ID3');
    await createProject({ name: 'Proj', area: 'Work' });
    expect(executeCalls[0]).toContain('area:area "Work"');
  });
});

describe('updateProject', () => {
  test('updates notes and returns id', async () => {
    resetExecute('UPD-PROJ');
    const result = await updateProject({ project_name: 'Proj', new_notes: 'New notes' });
    expect(result.message).toBe('Updated project: "Proj"');
    expect(result.id).toBe('UPD-PROJ');
    expect(executeCalls[0]).toContain('set theProject to project "Proj"');
    expect(executeCalls[0]).toContain('set notes of theProject to "New notes"');
    expect(executeCalls[0]).toContain('return id of theProject');
  });

  test('updates name', async () => {
    resetExecute('UPD-PROJ2');
    await updateProject({ project_name: 'Old', new_name: 'New' });
    expect(executeCalls[0]).toContain('set theProject to project "Old"');
    expect(executeCalls[0]).toContain('set name of theProject to "New"');
  });

  test('combines name and notes in one script', async () => {
    resetExecute('UPD-PROJ3');
    await updateProject({ project_name: 'Proj', new_name: 'Renamed', new_notes: 'Notes' });
    const script = executeCalls[0];
    expect(script).toContain('set name of theProject to "Renamed"');
    expect(script).toContain('set notes of theProject to "Notes"');
    expect(script).toContain('return id of theProject');
  });

  test('clears notes with empty string', async () => {
    resetExecute('UPD-PROJ4');
    await updateProject({ project_name: 'Proj', new_notes: '' });
    expect(executeCalls[0]).toContain('set notes of theProject to ""');
  });

  test('sets a due date', async () => {
    resetExecute('UPD-P5');
    await updateProject({ project_name: 'Proj', new_due_date: '2026-04-01' });
    expect(executeCalls[0]).toContain('set due date of theProject to dueD');
  });

  test('clears a due date with none', async () => {
    resetExecute('UPD-P6');
    await updateProject({ project_name: 'Proj', new_due_date: 'none' });
    expect(executeCalls[0]).toContain('set due date of theProject to missing value');
  });

  test('sets tags', async () => {
    resetExecute('UPD-P7');
    await updateProject({ project_name: 'Proj', new_tags: ['ai', 'work'] });
    expect(executeCalls[0]).toContain('set tag names of theProject to "ai, work"');
  });

  test('clears tags with an empty array', async () => {
    resetExecute('UPD-P8');
    await updateProject({ project_name: 'Proj', new_tags: [] });
    expect(executeCalls[0]).toContain('set tag names of theProject to ""');
  });

  test('moves the project to another area', async () => {
    resetExecute('UPD-P9');
    await updateProject({ project_name: 'Proj', new_area: 'Work' });
    expect(executeCalls[0]).toContain('set area of theProject to area "Work"');
  });

  test('detaches the project from its area with none', async () => {
    resetExecute('UPD-P10');
    await updateProject({ project_name: 'Proj', new_area: 'none' });
    expect(executeCalls[0]).toContain('set area of theProject to missing value');
  });

  test('returns no-op message when no updates specified', async () => {
    resetExecute();
    const result = await updateProject({ project_name: 'Proj' });
    expect(result.message).toBe('No updates specified for project: "Proj"');
    expect(executeCalls).toHaveLength(0);
  });
});

describe('listProjects', () => {
  test('returns empty list when output is empty', async () => {
    resetExecute('');
    const result = await listProjects({});
    expect(result.projects).toEqual([]);
  });

  test('parses projects with area and id', async () => {
    resetExecute('pid1\tProj1\topen\tnotes1\tWork\npid2\tProj2\tcompleted\tnotes2\tHome');
    const result = await listProjects({});
    expect(result.projects).toHaveLength(2);
    expect(result.projects[0]).toEqual({
      id: 'pid1',
      name: 'Proj1',
      status: 'open',
      notes: 'notes1',
      area: 'Work',
    });
  });

  test('keeps a project whose notes contain commas in one piece', async () => {
    resetExecute('pid1\tProj1\topen\tbuy milk, eggs, bread\tWork');
    const result = await listProjects({});
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].notes).toBe('buy milk, eggs, bread');
  });

  test('filters by area in JS and drops the area field', async () => {
    resetExecute('pid1\tProj1\topen\tnotes1\tWork\npid2\tProj2\topen\tnotes2\tHome');
    const result = await listProjects({ area: 'Work' });
    expect(result.area).toBe('Work');
    expect(result.projects).toEqual([
      { id: 'pid1', name: 'Proj1', status: 'open', notes: 'notes1' },
    ]);
  });

  test('matches the area case-insensitively', async () => {
    resetExecute('pid1\tProj1\topen\tnotes1\tWork');
    expect((await listProjects({ area: 'work' })).projects).toHaveLength(1);
  });

  test('never asks Things3 for every project of an area', async () => {
    resetExecute('');
    await listProjects({ area: 'Work' });
    expect(executeCalls[0]).not.toContain('every project of area');
    expect(executeCalls[0]).toContain('set allIds to id of every project');
  });
});

describe('getProjectTodos', () => {
  test('returns empty when output is empty', async () => {
    resetExecute('');
    const result = await getProjectTodos({ project_name: 'Proj' });
    expect(result.project).toBe('Proj');
    expect(result.todos).toEqual([]);
  });

  test('parses project todos with id', async () => {
    resetExecute('tid1\tTask A\topen\tnote\t2024-06-01\ttag1');
    const result = await getProjectTodos({ project_name: 'My Project' });
    expect(result.todos).toHaveLength(1);
    expect(result.todos[0]).toEqual({
      id: 'tid1',
      name: 'Task A',
      status: 'open',
      notes: 'note',
      dueDate: '2024-06-01',
      tags: 'tag1',
      project: '',
    });
  });

  test('filters by status', async () => {
    resetExecute('tid2\tA\topen\t\t\t\ntid3\tB\tcompleted\t\t\t');
    const result = await getProjectTodos({ project_name: 'P', status: 'completed' });
    expect(result.todos).toHaveLength(1);
    expect(result.todos[0].name).toBe('B');
  });

  test('script references project name and fetches ids', async () => {
    resetExecute('');
    await getProjectTodos({ project_name: 'Groceries' });
    expect(executeCalls[0]).toContain('every to do of project "Groceries"');
    expect(executeCalls[0]).toContain('set allIds to id of');
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
    resetExecute('work\tpersonal\tshopping');
    const result = await listTags();
    expect(result.tags).toEqual(['work', 'personal', 'shopping']);
  });

  test('script asks for tag names', async () => {
    resetExecute('');
    await listTags();
    expect(executeCalls[0]).toContain('name of tags as string');
    expect(executeCalls[0]).toContain('text item delimiters to tab');
  });
});

describe('listAreas', () => {
  test('returns empty array when output is empty', async () => {
    resetExecute('');
    const result = await listAreas();
    expect(result.areas).toEqual([]);
  });

  test('parses areas', async () => {
    resetExecute('Work\tPersonal');
    const result = await listAreas();
    expect(result.areas).toEqual(['Work', 'Personal']);
  });

  test('script asks for area names', async () => {
    resetExecute('');
    await listAreas();
    expect(executeCalls[0]).toContain('name of areas as string');
    expect(executeCalls[0]).toContain('text item delimiters to tab');
  });
});

// ── move-ops ────────────────────────────────────────────────────

describe('moveTodo', () => {
  test('moves todo by name and returns id', async () => {
    resetExecute('MOV-ID');
    const result = await moveTodo({ todo_name: 'Task', destination: 'today' });
    expect(result.message).toBe('Moved todo "Task" to Today');
    expect(result.id).toBe('MOV-ID');
    expect(executeCalls[0]).toContain('move to do named "Task" to list "Today"');
    expect(executeCalls[0]).toContain('return id of to do named "Task"');
  });

  test('moves todo by id', async () => {
    resetExecute('MOV-ID2');
    const result = await moveTodo({ id: 'MOV-ID2', destination: 'today' });
    expect(result.message).toBe('Moved todo id:MOV-ID2 to Today');
    expect(result.id).toBe('MOV-ID2');
    expect(executeCalls[0]).toContain('move to do id "MOV-ID2" to list "Today"');
  });

  test('moves todo to evening via URL scheme', async () => {
    process.env.AWESOME_THINGS_URL_TOKEN = 'test-token';
    resetExecuteMulti('EVE-ID', '', '');
    const result = await moveTodo({ todo_name: 'Task', destination: 'evening' });
    expect(result.message).toContain('This Evening');
    expect(result.id).toBe('EVE-ID');
    // First call: get id
    expect(executeCalls[0]).toContain('return id of to do named "Task"');
    // Second call: move to Today
    expect(executeCalls[1]).toContain('move to do named "Task" to list "Today"');
    // Third call: URL scheme for evening with auth-token
    expect(executeCalls[2]).toContain('open location');
    expect(executeCalls[2]).toContain('auth-token=test-token');
    expect(executeCalls[2]).toContain('id=EVE-ID');
    expect(executeCalls[2]).toContain('when=evening');
    delete process.env.AWESOME_THINGS_URL_TOKEN;
  });

  test('moves todo to evening by id (skips id lookup)', async () => {
    process.env.AWESOME_THINGS_URL_TOKEN = 'test-token';
    resetExecuteMulti('', '');
    const result = await moveTodo({ id: 'EVE-ID2', destination: 'evening' });
    expect(result.id).toBe('EVE-ID2');
    // First call: move to Today (no id lookup needed)
    expect(executeCalls[0]).toContain('move to do id "EVE-ID2" to list "Today"');
    // Second call: URL scheme
    expect(executeCalls[1]).toContain('id=EVE-ID2');
    expect(executeCalls[1]).toContain('when=evening');
    delete process.env.AWESOME_THINGS_URL_TOKEN;
  });

  test('throws error when evening without AWESOME_THINGS_URL_TOKEN', async () => {
    delete process.env.AWESOME_THINGS_URL_TOKEN;
    resetExecute();
    expect(moveTodo({ todo_name: 'Task', destination: 'evening' })).rejects.toThrow(
      'AWESOME_THINGS_URL_TOKEN',
    );
  });

  test('moves todo to upcoming via activation date', async () => {
    resetExecute('UPC-ID');
    const result = await moveTodo({ todo_name: 'Task', destination: 'upcoming' });
    expect(result.message).toContain('Upcoming');
    expect(result.id).toBe('UPC-ID');
    expect(executeCalls[0]).toContain('set activation date of to do named "Task"');
    expect(executeCalls[0]).toContain('return id of to do named "Task"');
  });
});

describe('moveTodoToProject', () => {
  test('moves todo to project and returns id', async () => {
    resetExecute('MTP-ID');
    const result = await moveTodoToProject({ todo_name: 'Task', project_name: 'Work' });
    expect(result.message).toBe('Moved todo "Task" to project "Work"');
    expect(result.id).toBe('MTP-ID');
    expect(executeCalls[0]).toContain('set project of to do named "Task" to project "Work"');
  });

  test('moves todo to project by id', async () => {
    resetExecute('MTP-ID2');
    const result = await moveTodoToProject({ id: 'MTP-ID2', project_name: 'Work' });
    expect(result.message).toBe('Moved todo id:MTP-ID2 to project "Work"');
    expect(executeCalls[0]).toContain('set project of to do id "MTP-ID2" to project "Work"');
  });
});

describe('moveTodoToArea', () => {
  test('moves todo to area and returns id', async () => {
    resetExecute('MTA-ID');
    const result = await moveTodoToArea({ todo_name: 'Task', area_name: 'Home' });
    expect(result.message).toBe('Moved todo "Task" to area "Home"');
    expect(result.id).toBe('MTA-ID');
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
  test('removes todo from project and returns id', async () => {
    resetExecute('REM-ID');
    const result = await removeTodoFromProject({ todo_name: 'Task' });
    expect(result.message).toBe('Removed todo "Task" from its project');
    expect(result.id).toBe('REM-ID');
    expect(executeCalls[0]).toContain('delete project of to do named "Task"');
  });

  test('removes todo from project by id', async () => {
    resetExecute('REM-ID2');
    const result = await removeTodoFromProject({ id: 'REM-ID2' });
    expect(result.message).toBe('Removed todo id:REM-ID2 from its project');
    expect(executeCalls[0]).toContain('delete project of to do id "REM-ID2"');
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

describe('clearing a due date', () => {
  test('updateTodo falls back to delete when missing value is refused', async () => {
    resetExecute('CLR1');
    await updateTodo({ id: 'X', new_due_date: 'none' });
    const script = executeCalls[0];
    expect(script).toContain('set due date of to do id "X" to missing value');
    expect(script).toContain('on error');
    expect(script).toContain('delete due date of to do id "X"');
  });

  test('updateProject falls back to delete as well', async () => {
    resetExecute('CLR2');
    await updateProject({ project_name: 'Proj', new_due_date: 'none' });
    const script = executeCalls[0];
    expect(script).toContain('set due date of theProject to missing value');
    expect(script).toContain('delete due date of theProject');
  });
});

// ── "When" (schedule), which is not the deadline ────────────────

describe('when', () => {
  test('createTodo schedules an ISO date after creating the todo', async () => {
    resetExecuteMulti('W1', '');
    await createTodo({ name: 'Task', when: '2026-09-12' });
    expect(executeCalls).toHaveLength(2);
    expect(executeCalls[1]).toContain('set year of whenD to 2026');
    expect(executeCalls[1]).toContain('schedule to do id "W1" for whenD');
  });

  test('createTodo understands today and tomorrow', async () => {
    resetExecuteMulti('W2', '');
    await createTodo({ name: 'Task', when: 'today' });
    expect(executeCalls[1]).toContain('schedule to do id "W2" for (current date)');

    resetExecuteMulti('W3', '');
    await createTodo({ name: 'Task', when: 'tomorrow' });
    expect(executeCalls[1]).toContain('schedule to do id "W3" for ((current date) + 1 * days)');
  });

  test('createTodo keeps when and due_date apart', async () => {
    resetExecuteMulti('W4', '');
    await createTodo({ name: 'Task', due_date: '2026-09-30', when: '2026-09-12' });
    expect(executeCalls[0]).toContain('due date:dueD');
    expect(executeCalls[0]).toContain('set day of dueD to 30');
    expect(executeCalls[1]).toContain('set day of whenD to 12');
  });

  test('createTodo routes list=evening through the URL scheme, not a container', async () => {
    process.env.AWESOME_THINGS_URL_TOKEN = 'url-token';
    resetExecuteMulti('W5', '', '');
    await createTodo({ name: 'Task', list: 'evening' });
    expect(executeCalls[0]).toContain('in list "Inbox"');
    expect(executeCalls[1]).toContain('move to do id "W5" to list "Today"');
    expect(executeCalls[2]).toContain('when=evening');
  });

  test('updateTodo sets a new when', async () => {
    resetExecuteMulti('', '');
    await updateTodo({ id: 'W6', new_when: '2026-09-12' });
    expect(executeCalls[0]).toContain('schedule to do id "W6" for whenD');
  });

  test('updateTodo clears the when by falling back to Anytime', async () => {
    resetExecuteMulti('', '');
    await updateTodo({ id: 'W7', new_when: 'none' });
    expect(executeCalls[0]).toContain('move to do id "W7" to list "Anytime"');
  });

  test('updateTodo combines a property change with a new when', async () => {
    resetExecuteMulti('W8', '');
    await updateTodo({ id: 'W8', new_name: 'Renamed', new_when: 'someday' });
    expect(executeCalls[0]).toContain('set name of to do id "W8" to "Renamed"');
    expect(executeCalls[1]).toContain('move to do id "W8" to list "Someday"');
  });

  test('rejects a when that is neither a date nor an alias', async () => {
    resetExecuteMulti('', '');
    await expect(updateTodo({ id: 'W9', new_when: 'saturday' })).rejects.toThrow('Invalid when');
  });

  test('asks for the URL token only when evening is requested', async () => {
    process.env.AWESOME_THINGS_URL_TOKEN = '';
    resetExecuteMulti('', '');
    await expect(updateTodo({ id: 'W10', new_when: 'evening' })).rejects.toThrow(
      'AWESOME_THINGS_URL_TOKEN',
    );
  });
});

describe('when with a reminder time', () => {
  test('routes a dated reminder through the URL scheme', async () => {
    process.env.AWESOME_THINGS_URL_TOKEN = 'url-token';
    resetExecuteMulti('', '');
    await updateTodo({ id: 'R1', new_when: '2026-09-12@11:00' });
    const url = executeCalls[0];
    expect(url).toContain('things:///update?');
    expect(url).toContain('id=R1');
    expect(url).toContain('when=2026-09-12%4011%3A00');
    expect(url).not.toContain('schedule');
  });

  test('accepts today@HH:MM and tomorrow@HH:MM', async () => {
    process.env.AWESOME_THINGS_URL_TOKEN = 'url-token';
    resetExecuteMulti('', '');
    await updateTodo({ id: 'R2', new_when: 'today@14:00' });
    expect(executeCalls[0]).toContain('when=today%4014%3A00');
  });

  test('createTodo sets a reminder after creating the todo', async () => {
    process.env.AWESOME_THINGS_URL_TOKEN = 'url-token';
    resetExecuteMulti('R3', '');
    await createTodo({ name: 'Task', when: '2026-09-12@09:30' });
    expect(executeCalls[0]).toContain('make new to do');
    expect(executeCalls[1]).toContain('when=2026-09-12%4009%3A30');
  });

  test('a plain date still goes through AppleScript, no token needed', async () => {
    process.env.AWESOME_THINGS_URL_TOKEN = '';
    resetExecuteMulti('', '');
    await updateTodo({ id: 'R4', new_when: '2026-09-12' });
    expect(executeCalls[0]).toContain('schedule to do id "R4" for whenD');
  });

  test('explains the missing token instead of failing silently', async () => {
    process.env.AWESOME_THINGS_URL_TOKEN = '';
    resetExecuteMulti('', '');
    await expect(updateTodo({ id: 'R5', new_when: '2026-09-12@11:00' })).rejects.toThrow(
      'AWESOME_THINGS_URL_TOKEN',
    );
  });

  test('rejects an impossible time', async () => {
    resetExecuteMulti('', '');
    await expect(updateTodo({ id: 'R6', new_when: '2026-09-12@25:00' })).rejects.toThrow(
      'Invalid when',
    );
  });
});
