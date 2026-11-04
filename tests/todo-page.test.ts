import { describe, expect, test } from 'bun:test';
import {
  escapeHtml,
  getTodoPage,
  parseTodoPagePath,
  renderNotes,
} from '../src/server/todo-page.js';
import type { TodoDetails } from '../src/types.js';

const todo: TodoDetails = {
  id: 'Sfs81KgRUmHWamcXUCBSVt',
  name: 'Buy milk',
  status: 'open',
  notes: '',
  dueDate: '',
  when: '',
  tags: '',
  project: '',
  area: '',
  created: '',
  modified: '',
  completed: '',
};

describe('escapeHtml', () => {
  test('escapes every character that can break out of text or an attribute', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      '&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;',
    );
  });
});

describe('renderNotes', () => {
  test('turns links into anchors and escapes the rest', () => {
    expect(renderNotes('<b> https://a.dev/x?y=1&z=2 end')).toBe(
      '&lt;b&gt; <a href="https://a.dev/x?y=1&amp;z=2" target="_blank" rel="noopener noreferrer">https://a.dev/x?y=1&amp;z=2</a> end',
    );
  });

  test('leaves trailing punctuation out of the link', () => {
    expect(renderNotes('see https://a.dev/x.')).toContain('href="https://a.dev/x"');
    expect(renderNotes('(https://a.dev/x)')).toContain('href="https://a.dev/x"');
  });

  test('never links a javascript: url', () => {
    expect(renderNotes('javascript:alert(1)')).not.toContain('<a');
  });
});

describe('parseTodoPagePath', () => {
  test('takes the id from /todo/<id>, with or without a trailing slash', () => {
    expect(parseTodoPagePath('/todo/Sfs81KgRUmHWamcXUCBSVt')).toBe('Sfs81KgRUmHWamcXUCBSVt');
    expect(parseTodoPagePath('/todo/Sfs81KgRUmHWamcXUCBSVt/')).toBe('Sfs81KgRUmHWamcXUCBSVt');
  });

  test('decodes the id', () => {
    expect(parseTodoPagePath('/todo/a%20b')).toBe('a b');
  });

  test('rejects anything else', () => {
    expect(parseTodoPagePath('/todo/')).toBeNull();
    expect(parseTodoPagePath('/todo/a/b')).toBeNull();
    expect(parseTodoPagePath('/todos/a')).toBeNull();
    expect(parseTodoPagePath('/todo/%E0%A4%A')).toBeNull();
  });
});

describe('getTodoPage', () => {
  test('shows only the fields that are set', () => {
    const html = getTodoPage(todo);
    expect(html).toContain('<h1>Buy milk</h1>');
    expect(html).not.toContain('<dl');
    expect(html).not.toContain('class="notes"');
  });

  test('strikes through a completed todo and labels it', () => {
    const html = getTodoPage({ ...todo, status: 'completed', completed: '2026-10-20 12:00' });
    expect(html).toContain('<h1 class="done">');
    expect(html).toContain('Completed 2026-10-20 12:00');
  });

  test('labels a cancelled todo as cancelled, not completed', () => {
    const html = getTodoPage({ ...todo, status: 'canceled', completed: '2026-10-20 12:00' });
    expect(html).toContain('>Cancelled</span>');
    expect(html).toContain('Cancelled 2026-10-20 12:00');
  });

  test('lists when, deadline, project, area and tags', () => {
    const html = getTodoPage({
      ...todo,
      when: '2026-10-25',
      dueDate: '2026-10-30',
      project: 'Home',
      area: 'Life',
      tags: 'a, b',
    });
    expect(html).toContain('<dt>When</dt><dd>2026-10-25</dd>');
    expect(html).toContain('<dt>Deadline</dt><dd>2026-10-30</dd>');
    expect(html).toContain('<dt>Area</dt><dd>Life</dd>');
    expect(html).toContain('<span class="tag">a</span><span class="tag">b</span>');
  });
});
