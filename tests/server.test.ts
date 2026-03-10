import { afterAll, beforeAll, describe, expect, mock, test } from 'bun:test';

// Simple flag to control mock data responses
let returnData = false;

mock.module('../src/api/todo-ops.js', () => ({
  createTodo: mock(async (args: { name: string; project?: string }) => {
    const suffix = args.project ? ` in project "${args.project}"` : '';
    return { message: `Created todo: ${args.name}${suffix}` };
  }),
  listTodos: mock(async (args: { list: string }) => {
    const list = args.list.charAt(0).toUpperCase() + args.list.slice(1);
    if (!returnData) return { list, todos: [] };
    return {
      list,
      todos: [
        {
          name: 'Buy milk',
          status: 'open',
          notes: 'grocery note',
          dueDate: '2024-01-15',
          tags: 'shopping',
        },
      ],
    };
  }),
  completeTodo: mock(async (args: { name: string }) => ({
    message: `Completed todo: ${args.name}`,
  })),
  updateTodo: mock(async (args: { name: string }) => ({ message: `Updated todo: ${args.name}` })),
  searchTodos: mock(async (args: { query: string }) => {
    if (!returnData) return { query: args.query, results: [] };
    return {
      query: args.query,
      results: [{ list: 'Today', name: 'Buy milk', status: 'open' }],
    };
  }),
}));

mock.module('../src/api/project-ops.js', () => ({
  createProject: mock(async (args: { name: string }) => ({
    message: `Created project: ${args.name}`,
  })),
  listProjects: mock(async (args: { area?: string }) => {
    if (!returnData) return { area: args.area, projects: [] };
    return {
      area: args.area,
      projects: [{ name: 'My Project', status: 'open', notes: 'notes', area: 'Work' }],
    };
  }),
  getProjectTodos: mock(async (args: { project_name: string }) => {
    if (!returnData) return { project: args.project_name, todos: [] };
    return {
      project: args.project_name,
      todos: [
        { name: 'Task A', status: 'open', notes: 'notes', dueDate: '2024-06-01', tags: 'tag1' },
      ],
    };
  }),
}));

mock.module('../src/api/list-ops.js', () => ({
  listTags: mock(async () => {
    if (!returnData) return { tags: [] };
    return { tags: ['work', 'personal', 'shopping'] };
  }),
  listAreas: mock(async () => {
    if (!returnData) return { areas: [] };
    return { areas: ['Work', 'Personal'] };
  }),
}));

mock.module('../src/api/move-ops.js', () => ({
  moveTodo: mock(async (args: { todo_name: string }) => ({
    message: `Moved todo "${args.todo_name}" to Today`,
  })),
  moveTodoToProject: mock(async (args: { todo_name: string; project_name: string }) => ({
    message: `Moved todo "${args.todo_name}" to project "${args.project_name}"`,
  })),
  moveTodoToArea: mock(async (args: { todo_name: string; area_name: string }) => ({
    message: `Moved todo "${args.todo_name}" to area "${args.area_name}"`,
  })),
  moveProjectToArea: mock(async (args: { project_name: string; area_name: string }) => ({
    message: `Moved project "${args.project_name}" to area "${args.area_name}"`,
  })),
  removeTodoFromProject: mock(async (args: { todo_name: string }) => ({
    message: `Removed todo "${args.todo_name}" from its project`,
  })),
  removeProjectFromArea: mock(async (args: { project_name: string }) => ({
    message: `Removed project "${args.project_name}" from its area`,
  })),
}));

import type { Server } from 'bun';

let server: Server;
let baseUrl: string;
const TEST_PORT = 39_871;
const TEST_TOKEN = 'test-token-123';

beforeAll(async () => {
  const { startServer } = await import('../src/server.js');
  server = await startServer({
    port: TEST_PORT,
    token: TEST_TOKEN,
    tunnel: undefined,
  });
  baseUrl = `http://localhost:${TEST_PORT}`;
});

afterAll(() => {
  server?.stop(true);
});

function authHeaders(token = TEST_TOKEN) {
  return { Authorization: `Bearer ${token}` };
}

// ── Health & Home (no auth) ──────────────────────────────────────

describe('GET /health', () => {
  test('returns ok without auth', async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.app).toBe('awesome-things');
  });
});

describe('GET /', () => {
  test('returns HTML home page without auth', async () => {
    const res = await fetch(`${baseUrl}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
    const html = await res.text();
    expect(html).toContain('<');
  });
});

// ── Auth enforcement ─────────────────────────────────────────────

describe('auth', () => {
  test('rejects request without token', async () => {
    const res = await fetch(`${baseUrl}/api/tags`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data).toEqual({ ok: false, error: 'Unauthorized' });
  });

  test('rejects request with wrong token', async () => {
    const res = await fetch(`${baseUrl}/api/tags`, {
      headers: authHeaders('wrong-token'),
    });
    expect(res.status).toBe(401);
  });

  test('accepts request with valid token', async () => {
    const res = await fetch(`${baseUrl}/api/tags`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
  });
});

// ── 404 ──────────────────────────────────────────────────────────

describe('unknown routes', () => {
  test('returns 404 for unknown path', async () => {
    const res = await fetch(`${baseUrl}/api/unknown`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(404);
    const data = await res.json();
    expect(data).toEqual({ ok: false, error: 'Not found' });
  });
});

// ── Todos ────────────────────────────────────────────────────────

describe('GET /api/todos', () => {
  test('returns list and todos array with data', async () => {
    returnData = true;
    const res = await fetch(`${baseUrl}/api/todos?list=today`, {
      headers: authHeaders(),
    });
    returnData = false;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.list).toBe('Today');
    expect(Array.isArray(data.todos)).toBe(true);
    expect(data.todos[0]).toEqual({
      name: 'Buy milk',
      status: 'open',
      notes: 'grocery note',
      dueDate: '2024-01-15',
      tags: 'shopping',
    });
  });

  test('defaults to today list', async () => {
    const res = await fetch(`${baseUrl}/api/todos`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.list).toBe('Today');
    expect(data.todos).toEqual([]);
  });

  test('returns empty todos array for empty list', async () => {
    const res = await fetch(`${baseUrl}/api/todos?list=inbox`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.todos).toEqual([]);
  });
});

describe('POST /api/todos', () => {
  test('creates a todo and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New task' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Created todo');
  });

  test('creates a todo in a project and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Buy milk', project: 'Groceries' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Created todo');
    expect(data.message).toContain('Groceries');
  });

  test('returns JSON error for empty body', async () => {
    const res = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: authHeaders(),
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(typeof data.error).toBe('string');
  });

  test('returns JSON error for invalid JSON body', async () => {
    const res = await fetch(`${baseUrl}/api/todos`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(typeof data.error).toBe('string');
  });
});

describe('PUT /api/todos', () => {
  test('updates a todo and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/todos`, {
      method: 'PUT',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Old name', new_name: 'New name' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Updated todo');
  });
});

describe('POST /api/todos/complete', () => {
  test('completes a todo and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/todos/complete`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Done task' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Completed todo');
  });
});

describe('GET /api/todos/search', () => {
  test('returns search results array', async () => {
    returnData = true;
    const res = await fetch(`${baseUrl}/api/todos/search?q=milk`, {
      headers: authHeaders(),
    });
    returnData = false;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.query).toBe('milk');
    expect(Array.isArray(data.results)).toBe(true);
    expect(data.results[0]).toEqual({
      list: 'Today',
      name: 'Buy milk',
      status: 'open',
    });
  });

  test('returns empty results for no matches', async () => {
    const res = await fetch(`${baseUrl}/api/todos/search?q=nonexistent`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.results).toEqual([]);
  });
});

// ── Projects ─────────────────────────────────────────────────────

describe('GET /api/projects', () => {
  test('returns projects array', async () => {
    returnData = true;
    const res = await fetch(`${baseUrl}/api/projects`, {
      headers: authHeaders(),
    });
    returnData = false;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.projects)).toBe(true);
    expect(data.projects[0]).toEqual({
      name: 'My Project',
      status: 'open',
      notes: 'notes',
      area: 'Work',
    });
  });

  test('returns empty projects array', async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.projects).toEqual([]);
  });
});

describe('POST /api/projects', () => {
  test('creates a project and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New project' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Created project');
  });
});

describe('GET /api/projects/:name/todos', () => {
  test('returns project todos', async () => {
    returnData = true;
    const res = await fetch(`${baseUrl}/api/projects/My%20Project/todos`, {
      headers: authHeaders(),
    });
    returnData = false;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.project).toBe('My Project');
    expect(Array.isArray(data.todos)).toBe(true);
    expect(data.todos[0].name).toBe('Task A');
  });
});

// ── Tags & Areas ─────────────────────────────────────────────────

describe('GET /api/tags', () => {
  test('returns tags array', async () => {
    returnData = true;
    const res = await fetch(`${baseUrl}/api/tags`, {
      headers: authHeaders(),
    });
    returnData = false;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.tags).toEqual(['work', 'personal', 'shopping']);
  });

  test('returns empty tags array', async () => {
    const res = await fetch(`${baseUrl}/api/tags`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.tags).toEqual([]);
  });
});

describe('GET /api/areas', () => {
  test('returns areas array', async () => {
    returnData = true;
    const res = await fetch(`${baseUrl}/api/areas`, {
      headers: authHeaders(),
    });
    returnData = false;
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.areas).toEqual(['Work', 'Personal']);
  });
});

// ── Move operations ──────────────────────────────────────────────

describe('POST /api/move/todo', () => {
  test('moves todo and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/move/todo`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ todo_name: 'Task', destination: 'today' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Moved todo');
  });
});

describe('POST /api/move/todo-to-project', () => {
  test('moves todo to project and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/move/todo-to-project`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ todo_name: 'Task', project_name: 'Project' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Moved todo');
  });
});

describe('POST /api/move/todo-to-area', () => {
  test('moves todo to area and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/move/todo-to-area`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ todo_name: 'Task', area_name: 'Work' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Moved todo');
  });
});

describe('POST /api/move/project-to-area', () => {
  test('moves project to area and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/move/project-to-area`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: 'Project', area_name: 'Work' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Moved project');
  });
});

// ── Remove operations ────────────────────────────────────────────

describe('POST /api/remove/todo-from-project', () => {
  test('removes todo from project and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/remove/todo-from-project`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ todo_name: 'Task' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Removed todo');
  });
});

describe('POST /api/remove/project-from-area', () => {
  test('removes project from area and returns message', async () => {
    const res = await fetch(`${baseUrl}/api/remove/project-from-area`, {
      method: 'POST',
      headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ project_name: 'Project' }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.message).toContain('Removed project');
  });
});

// ── Swagger & OpenAPI ────────────────────────────────────────────

describe('GET /api (Swagger UI)', () => {
  test('returns HTML', async () => {
    const res = await fetch(`${baseUrl}/api`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/html');
  });
});

describe('GET /api/openapi.json', () => {
  test('returns valid OpenAPI spec', async () => {
    const res = await fetch(`${baseUrl}/api/openapi.json`, {
      headers: authHeaders(),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.openapi).toBeDefined();
    expect(data.paths).toBeDefined();
  });
});

// ── Response format consistency ──────────────────────────────────

describe('response format', () => {
  test('all success responses have ok: true', async () => {
    const endpoints = [
      { url: '/api/todos?list=today', method: 'GET' },
      { url: '/api/todos/search?q=test', method: 'GET' },
      { url: '/api/projects', method: 'GET' },
      { url: '/api/tags', method: 'GET' },
      { url: '/api/areas', method: 'GET' },
    ];

    for (const { url, method } of endpoints) {
      const res = await fetch(`${baseUrl}${url}`, {
        method,
        headers: authHeaders(),
      });
      const data = await res.json();
      expect(data.ok).toBe(true);
    }
  });

  test('all JSON responses have Content-Type application/json', async () => {
    const res = await fetch(`${baseUrl}/api/tags`, {
      headers: authHeaders(),
    });
    expect(res.headers.get('content-type')).toBe('application/json');
  });

  test('error responses have ok: false and error field', async () => {
    const res = await fetch(`${baseUrl}/api/unknown`, {
      headers: authHeaders(),
    });
    const data = await res.json();
    expect(data.ok).toBe(false);
    expect(typeof data.error).toBe('string');
  });
});
