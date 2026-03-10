import { describe, expect, test } from 'bun:test';
import { getFormatters } from '../src/tools/formatters.js';

// biome-ignore lint/suspicious/noControlCharactersInRegex: ANSI escape stripping
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

const todo = (overrides = {}) => ({
  name: 'Buy milk',
  status: 'open',
  notes: '',
  dueDate: '',
  tags: '',
  project: '',
  ...overrides,
});

// ── Pretty formatters ──────────────────────────────────────────

describe('pretty formatters', () => {
  const fmt = getFormatters('pretty');

  test('formatTodos empty', () => {
    const out = stripAnsi(fmt.formatTodos({ list: 'Today', todos: [] }));
    expect(out).toContain('Today');
    expect(out).toContain('0 todos');
    expect(out).toContain('(none)');
  });

  test('formatTodos with items', () => {
    const out = stripAnsi(
      fmt.formatTodos({
        list: 'Today',
        todos: [todo({ dueDate: '2024-01-01', tags: 'shopping', notes: 'Get 2%' })],
      }),
    );
    expect(out).toContain('Today');
    expect(out).toContain('Buy milk');
    expect(out).toContain('2024-01-01');
    expect(out).toContain('#shopping');
    expect(out).toContain('Get 2%');
  });

  test('formatTodos with project', () => {
    const out = stripAnsi(
      fmt.formatTodos({
        list: 'Today',
        todos: [todo({ project: 'My Project' })],
      }),
    );
    expect(out).toContain('Buy milk');
    expect(out).toContain('[My Project]');
  });

  test('formatTodos completed', () => {
    const out = stripAnsi(
      fmt.formatTodos({ list: 'Today', todos: [todo({ status: 'completed' })] }),
    );
    expect(out).toContain('\u2713');
    expect(out).toContain('Buy milk');
  });

  test('formatSearch empty', () => {
    const out = stripAnsi(fmt.formatSearch({ query: 'milk', results: [] }));
    expect(out).toContain('Search');
    expect(out).toContain('"milk"');
    expect(out).toContain('0 results');
  });

  test('formatSearch with results', () => {
    const out = stripAnsi(
      fmt.formatSearch({
        query: 'milk',
        results: [
          {
            list: 'Today',
            name: 'Buy milk',
            status: 'open',
            notes: '',
            dueDate: '',
            tags: '',
            project: '',
            area: '',
          },
        ],
      }),
    );
    expect(out).toContain('Buy milk');
    expect(out).toContain('Today');
  });

  test('formatProjects empty', () => {
    const out = stripAnsi(fmt.formatProjects({ projects: [] }));
    expect(out).toContain('All projects');
    expect(out).toContain('(none)');
  });

  test('formatProjects with area filter', () => {
    const out = stripAnsi(fmt.formatProjects({ area: 'Work', projects: [] }));
    expect(out).toContain('Projects in "Work"');
  });

  test('formatProjects with items', () => {
    const out = stripAnsi(
      fmt.formatProjects({
        projects: [{ name: 'P1', status: 'open', notes: 'Some notes', area: 'Work' }],
      }),
    );
    expect(out).toContain('P1');
    expect(out).toContain('Work');
    expect(out).toContain('Some notes');
  });

  test('formatProjectTodos empty', () => {
    const out = stripAnsi(fmt.formatProjectTodos({ project: 'MyProj', todos: [] }));
    expect(out).toContain('Project: MyProj');
    expect(out).toContain('0 todos');
  });

  test('formatTags', () => {
    const out = stripAnsi(fmt.formatTags({ tags: ['work', 'personal'] }));
    expect(out).toContain('Tags');
    expect(out).toContain('work');
    expect(out).toContain('personal');
  });

  test('formatTags empty', () => {
    const out = stripAnsi(fmt.formatTags({ tags: [] }));
    expect(out).toContain('Tags');
    expect(out).toContain('(none)');
  });

  test('formatAreas', () => {
    const out = stripAnsi(fmt.formatAreas({ areas: ['Work', 'Personal'] }));
    expect(out).toContain('Areas');
    expect(out).toContain('Work');
    expect(out).toContain('Personal');
  });

  test('formatAction', () => {
    const out = stripAnsi(fmt.formatAction({ message: 'Created todo: Buy milk' }));
    expect(out).toContain('Created todo: Buy milk');
  });
});

// ── Table formatters ───────────────────────────────────────────

describe('table formatters', () => {
  const fmt = getFormatters('table');

  test('formatTodos has column headers', () => {
    const out = stripAnsi(
      fmt.formatTodos({
        list: 'Today',
        todos: [todo({ dueDate: '2024-01-01', tags: 'work' })],
      }),
    );
    expect(out).toContain('NAME');
    expect(out).toContain('DUE');
    expect(out).toContain('TAGS');
    expect(out).toContain('Buy milk');
    expect(out).toContain('2024-01-01');
    expect(out).toContain('work');
  });

  test('formatSearch has column headers', () => {
    const out = stripAnsi(
      fmt.formatSearch({
        query: 'test',
        results: [
          {
            list: 'Today',
            name: 'Test task',
            status: 'open',
            notes: '',
            dueDate: '',
            tags: '',
            project: '',
            area: '',
          },
        ],
      }),
    );
    expect(out).toContain('NAME');
    expect(out).toContain('LIST');
    expect(out).toContain('Test task');
  });

  test('formatProjects has column headers', () => {
    const out = stripAnsi(
      fmt.formatProjects({
        projects: [{ name: 'P1', status: 'open', notes: 'n', area: 'Work' }],
      }),
    );
    expect(out).toContain('NAME');
    expect(out).toContain('AREA');
    expect(out).toContain('NOTES');
    expect(out).toContain('P1');
  });
});

// ── Plain formatters ───────────────────────────────────────────

describe('plain formatters', () => {
  const fmt = getFormatters('plain');

  test('formatTodos uses checkboxes', () => {
    const out = fmt.formatTodos({
      list: 'Today',
      todos: [todo(), todo({ name: 'Done task', status: 'completed' })],
    });
    expect(out).toContain('[ ] Buy milk');
    expect(out).toContain('[x] Done task');
    expect(out).not.toContain('\x1b');
  });

  test('formatTodos with due and tags', () => {
    const out = fmt.formatTodos({
      list: 'Today',
      todos: [todo({ dueDate: '2024-01-01', tags: 'shopping' })],
    });
    expect(out).toContain('2024-01-01');
    expect(out).toContain('#shopping');
  });

  test('formatTodos with notes', () => {
    const out = fmt.formatTodos({
      list: 'Today',
      todos: [todo({ notes: 'Remember to check' })],
    });
    expect(out).toContain('    Remember to check');
  });

  test('formatSearch uses checkboxes', () => {
    const out = fmt.formatSearch({
      query: 'milk',
      results: [
        {
          list: 'Today',
          name: 'Buy milk',
          status: 'open',
          notes: '',
          dueDate: '',
          tags: '',
          project: '',
          area: '',
        },
      ],
    });
    expect(out).toContain('[ ] Buy milk');
    expect(out).toContain('[Today]');
  });

  test('formatProjects', () => {
    const out = fmt.formatProjects({
      projects: [{ name: 'P1', status: 'open', notes: 'n', area: 'Work' }],
    });
    expect(out).toContain('P1');
    expect(out).toContain('[Work]');
  });

  test('formatTags', () => {
    const out = fmt.formatTags({ tags: ['work', 'personal'] });
    expect(out).toContain('Tags');
    expect(out).toContain('work, personal');
  });

  test('formatAreas', () => {
    const out = fmt.formatAreas({ areas: ['Work', 'Personal'] });
    expect(out).toContain('Areas');
    expect(out).toContain('Work, Personal');
  });

  test('formatAction', () => {
    expect(fmt.formatAction({ message: 'Done' })).toBe('Done');
  });

  test('no ANSI codes in plain output', () => {
    const out = fmt.formatTodos({
      list: 'Today',
      todos: [todo({ dueDate: '2024-01-01', tags: 'work', notes: 'note' })],
    });
    expect(out).not.toContain('\x1b');
  });
});

// ── getFormatters selector ─────────────────────────────────────

describe('getFormatters', () => {
  test('returns different formatters for each style', () => {
    const pretty = getFormatters('pretty');
    const table = getFormatters('table');
    const plain = getFormatters('plain');

    const data = { list: 'Today', todos: [todo()] };
    const prettyOut = pretty.formatTodos(data);
    const tableOut = table.formatTodos(data);
    const plainOut = plain.formatTodos(data);

    // All three should be different
    expect(prettyOut).not.toBe(tableOut);
    expect(prettyOut).not.toBe(plainOut);
    expect(tableOut).not.toBe(plainOut);
  });

  test('defaults to pretty', () => {
    const fmt = getFormatters();
    const prettyFmt = getFormatters('pretty');
    const data = { list: 'Today', todos: [] };
    expect(fmt.formatTodos(data)).toBe(prettyFmt.formatTodos(data));
  });
});
