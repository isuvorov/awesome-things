import { appName, appVersion } from '../config.js';
import { toolSchemas } from '../types.js';

interface RouteMapping {
  method: string;
  path: string;
  toolKey: keyof typeof toolSchemas;
  summary: string;
  tag: string;
}

const routes: RouteMapping[] = [
  { method: 'get', path: '/api/todos', toolKey: 'list_todos', summary: 'List todos', tag: 'Todos' },
  {
    method: 'post',
    path: '/api/todos',
    toolKey: 'create_todo',
    summary: 'Create a todo',
    tag: 'Todos',
  },
  {
    method: 'put',
    path: '/api/todos',
    toolKey: 'update_todo',
    summary: 'Update a todo',
    tag: 'Todos',
  },
  {
    method: 'post',
    path: '/api/todos/complete',
    toolKey: 'complete_todo',
    summary: 'Complete a todo',
    tag: 'Todos',
  },
  {
    method: 'get',
    path: '/api/todos/search',
    toolKey: 'search_todos',
    summary: 'Search todos',
    tag: 'Todos',
  },
  {
    method: 'get',
    path: '/api/projects',
    toolKey: 'list_projects',
    summary: 'List projects',
    tag: 'Projects',
  },
  {
    method: 'post',
    path: '/api/projects',
    toolKey: 'create_project',
    summary: 'Create a project',
    tag: 'Projects',
  },
  {
    method: 'get',
    path: '/api/projects/{name}/todos',
    toolKey: 'get_project_todos',
    summary: 'Get todos in a project',
    tag: 'Projects',
  },
  { method: 'get', path: '/api/tags', toolKey: 'list_tags', summary: 'List tags', tag: 'Tags' },
  {
    method: 'get',
    path: '/api/areas',
    toolKey: 'list_areas',
    summary: 'List areas',
    tag: 'Areas',
  },
  {
    method: 'post',
    path: '/api/move/todo',
    toolKey: 'move_todo',
    summary: 'Move todo to a list',
    tag: 'Move',
  },
  {
    method: 'post',
    path: '/api/move/todo-to-project',
    toolKey: 'move_todo_to_project',
    summary: 'Move todo to a project',
    tag: 'Move',
  },
  {
    method: 'post',
    path: '/api/move/todo-to-area',
    toolKey: 'move_todo_to_area',
    summary: 'Move todo to an area',
    tag: 'Move',
  },
  {
    method: 'post',
    path: '/api/move/project-to-area',
    toolKey: 'move_project_to_area',
    summary: 'Move project to an area',
    tag: 'Move',
  },
  {
    method: 'post',
    path: '/api/remove/todo-from-project',
    toolKey: 'remove_todo_from_project',
    summary: 'Remove todo from project',
    tag: 'Remove',
  },
  {
    method: 'post',
    path: '/api/remove/project-from-area',
    toolKey: 'remove_project_from_area',
    summary: 'Remove project from area',
    tag: 'Remove',
  },
];

function schemaToParameters(schema: (typeof toolSchemas)[keyof typeof toolSchemas]) {
  const params: object[] = [];
  for (const [name, prop] of Object.entries(schema.properties)) {
    params.push({
      name,
      in: 'query',
      required: schema.required.includes(name),
      description: (prop as any).description || '',
      schema: { type: (prop as any).type, enum: (prop as any).enum },
    });
  }
  return params;
}

function schemaToRequestBody(schema: (typeof toolSchemas)[keyof typeof toolSchemas]) {
  return {
    required: true,
    content: {
      'application/json': {
        schema: {
          type: schema.type,
          properties: schema.properties,
          required: schema.required.length > 0 ? schema.required : undefined,
        },
      },
    },
  };
}

const successResponse = {
  description: 'Successful response',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          result: { type: 'string' },
        },
      },
    },
  },
};

const errorResponse = {
  description: 'Error response',
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties: {
          ok: { type: 'boolean' },
          error: { type: 'string' },
        },
      },
    },
  },
};

export function generateOpenApiSpec() {
  const paths: Record<string, Record<string, object>> = {};

  for (const route of routes) {
    const schema = toolSchemas[route.toolKey];
    if (!paths[route.path]) paths[route.path] = {};

    const operation: Record<string, unknown> = {
      summary: route.summary,
      tags: [route.tag],
      responses: {
        '200': successResponse,
        '500': errorResponse,
      },
    };

    if (route.method === 'get') {
      const params = schemaToParameters(schema);
      if (params.length > 0) operation.parameters = params;
    } else {
      const hasProperties = Object.keys(schema.properties).length > 0;
      if (hasProperties) operation.requestBody = schemaToRequestBody(schema);
    }

    // Path parameters (e.g. {name})
    if (route.path.includes('{')) {
      const pathParams = route.path.match(/\{(\w+)\}/g) || [];
      const existing = (operation.parameters as object[] | undefined) || [];
      for (const p of pathParams) {
        const paramName = p.slice(1, -1);
        existing.push({
          name: paramName,
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: `Name of the ${paramName}`,
        });
      }
      operation.parameters = existing;
    }

    paths[route.path][route.method] = operation;
  }

  return {
    openapi: '3.0.0',
    info: {
      title: appName + ' API',
      version: appVersion,
      description: `REST API for managing ${appName} todos, projects, tags, and areas on macOS.`,
    },
    paths,
    tags: [
      { name: 'Todos', description: 'Todo operations' },
      { name: 'Projects', description: 'Project operations' },
      { name: 'Tags', description: 'Tag operations' },
      { name: 'Areas', description: 'Area operations' },
      { name: 'Move', description: 'Move operations' },
      { name: 'Remove', description: 'Remove operations' },
    ],
  };
}

export function getHomePage() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Things3</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f7; color: #1d1d1f; padding: 24px; max-width: 720px; margin: 0 auto; }
    h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; }
    .subtitle { color: #86868b; margin-bottom: 24px; font-size: 14px; }
    .subtitle a { color: #0071e3; text-decoration: none; }
    .subtitle a:hover { text-decoration: underline; }
    .tabs { display: flex; gap: 8px; margin-bottom: 16px; }
    .tab { padding: 6px 14px; border-radius: 8px; border: 1px solid #d2d2d7; background: #fff; cursor: pointer; font-size: 13px; color: #1d1d1f; transition: all 0.15s; }
    .tab.active { background: #0071e3; color: #fff; border-color: #0071e3; }
    .tab:hover:not(.active) { background: #e8e8ed; }
    .list { list-style: none; }
    .item { display: flex; align-items: flex-start; gap: 10px; padding: 10px 14px; background: #fff; border-radius: 10px; margin-bottom: 6px; border: 1px solid #e8e8ed; }
    .check { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #d2d2d7; flex-shrink: 0; margin-top: 1px; cursor: pointer; transition: all 0.15s; }
    .check:hover { border-color: #0071e3; }
    .check.done { background: #34c759; border-color: #34c759; }
    .info { flex: 1; min-width: 0; }
    .title { font-size: 15px; line-height: 1.4; }
    .meta { font-size: 12px; color: #86868b; margin-top: 2px; }
    .meta span { margin-right: 10px; }
    .empty { text-align: center; padding: 40px; color: #86868b; }
    .loading { text-align: center; padding: 40px; color: #86868b; }
    .error { text-align: center; padding: 40px; color: #ff3b30; }
  </style>
</head>
<body>
  <h1>Things3</h1>
  <p class="subtitle">Your todos from Things3 &middot; <a href="/api">API Docs</a></p>
  <div class="tabs" id="tabs"></div>
  <ul class="list" id="list"><li class="loading">Loading...</li></ul>
  <script>
    const lists = ['today','inbox','upcoming','anytime','someday','logbook'];
    const tabsEl = document.getElementById('tabs');
    const listEl = document.getElementById('list');
    let current = 'today';

    function renderTabs() {
      tabsEl.innerHTML = '';
      for (const l of lists) {
        const btn = document.createElement('button');
        btn.className = 'tab' + (l === current ? ' active' : '');
        btn.textContent = l.charAt(0).toUpperCase() + l.slice(1);
        btn.onclick = () => { current = l; renderTabs(); loadTodos(); };
        tabsEl.appendChild(btn);
      }
    }

    async function loadTodos() {
      listEl.innerHTML = '<li class="loading">Loading...</li>';
      try {
        const res = await fetch('/api/todos?list=' + current);
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        const todos = data.todos;
        if (!todos.length) {
          listEl.innerHTML = '<li class="empty">No todos in ' + current + '</li>';
          return;
        }
        listEl.innerHTML = '';
        for (const t of todos) {
          const li = document.createElement('li');
          li.className = 'item';
          const status = t.status || '';
          const isDone = status === 'completed' || status === 'cancelled';
          let meta = '';
          if (t.project) meta += '<span>📁 ' + esc(t.project) + '</span>';
          if (t.tags) meta += '<span>🏷 ' + esc(t.tags) + '</span>';
          if (t.dueDate) meta += '<span>📅 ' + esc(t.dueDate) + '</span>';
          li.innerHTML =
            '<div class="check' + (isDone ? ' done' : '') + '"></div>' +
            '<div class="info"><div class="title">' + esc(t.name || t.title || 'Untitled') + '</div>' +
            (meta ? '<div class="meta">' + meta + '</div>' : '') + '</div>';
          listEl.appendChild(li);
        }
      } catch (e) {
        listEl.innerHTML = '<li class="error">' + esc(e.message) + '</li>';
      }
    }

    function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
    renderTabs();
    loadTodos();
  </script>
</body>
</html>`;
}

export function getSwaggerHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Things3 API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    SwaggerUIBundle({
      url: '/api/openapi.json',
      dom_id: '#swagger-ui',
      presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
      layout: 'BaseLayout',
    });
  </script>
</body>
</html>`;
}
