import { z } from 'zod';

/**
 * Enum that accepts any casing — clients routinely send "Today" or "OPEN".
 * `z.preprocess` keeps the enum visible in the generated JSON Schema.
 */
function lowerEnum<const T extends readonly [string, ...string[]]>(values: T) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.toLowerCase() : value),
    z.enum(values),
  );
}

// ── Result Types ────────────────────────────────────────────────

export interface TodoItem {
  id: string;
  name: string;
  status: string;
  notes: string;
  dueDate: string;
  tags: string;
  project: string;
}

export interface SearchResultItem {
  id: string;
  list: string;
  name: string;
  status: string;
  notes: string;
  dueDate: string;
  tags: string;
  project: string;
  area: string;
}

export interface ActionResult {
  message: string;
  id?: string;
}

export interface ListTodosResult {
  list: string;
  todos: TodoItem[];
}

export interface SearchTodosResult {
  query: string;
  results: SearchResultItem[];
}

export interface ProjectItem {
  id: string;
  name: string;
  status: string;
  notes: string;
  area?: string;
}

export interface ListProjectsResult {
  area?: string;
  projects: ProjectItem[];
}

export interface GetProjectTodosResult {
  project: string;
  todos: TodoItem[];
}

export interface ListTagsResult {
  tags: string[];
}

export interface ListAreasResult {
  areas: string[];
}

// ── Todo Types ──────────────────────────────────────────────────

export const CreateTodoArgsSchema = z.object({
  name: z.string().describe('Name of the todo'),
  notes: z.string().optional().describe('Additional notes for the todo'),
  due_date: z.string().optional().describe('Due date in YYYY-MM-DD format'),
  tags: z.array(z.string()).optional().describe('List of tag names to apply'),
  list: lowerEnum(['inbox', 'today', 'anytime', 'someday'])
    .optional()
    .describe('Target list (defaults to inbox). With project: also moves todo to this list'),
  project: z.string().optional().describe('Project name to create the todo in'),
  area: z.string().optional().describe('Area name to place the todo in'),
});
export type CreateTodoArgs = z.infer<typeof CreateTodoArgsSchema>;

export const ListTodosArgsSchema = z.object({
  list: lowerEnum(['inbox', 'today', 'anytime', 'upcoming', 'someday', 'logbook']).describe(
    'List to retrieve todos from',
  ),
  status: lowerEnum(['open', 'completed', 'all'])
    .optional()
    .describe('Filter by status (defaults to all)'),
});
export type ListTodosArgs = z.infer<typeof ListTodosArgsSchema>;

const idOrName = (data: { id?: string; name?: string }) => data.id || data.name;
const idOrTodoName = (data: { id?: string; todo_name?: string }) => data.id || data.todo_name;
const idOrNameMsg = { message: 'Either id or name must be provided' };
const idOrTodoNameMsg = { message: 'Either id or todo_name must be provided' };

export const CompleteTodoArgsBaseSchema = z.object({
  id: z.string().optional().describe('ID of the todo to complete'),
  name: z.string().optional().describe('Name of the todo to complete'),
});
export const CompleteTodoArgsSchema = CompleteTodoArgsBaseSchema.refine(idOrName, idOrNameMsg);
export type CompleteTodoArgs = z.infer<typeof CompleteTodoArgsSchema>;

export const UpdateTodoArgsBaseSchema = z.object({
  id: z.string().optional().describe('ID of the todo to update'),
  name: z.string().optional().describe('Current name of the todo to update'),
  new_name: z.string().optional().describe('New name for the todo'),
  new_notes: z.string().optional().describe('New notes for the todo'),
  new_due_date: z
    .string()
    .optional()
    .describe("New due date (YYYY-MM-DD format, or 'none' to clear)"),
  new_tags: z.array(z.string()).optional().describe('New list of tag names'),
});
export const UpdateTodoArgsSchema = UpdateTodoArgsBaseSchema.refine(idOrName, idOrNameMsg);
export type UpdateTodoArgs = z.infer<typeof UpdateTodoArgsSchema>;

export const SearchTodosArgsSchema = z.object({
  query: z.string().describe('Search query to find todos by name'),
});
export type SearchTodosArgs = z.infer<typeof SearchTodosArgsSchema>;

// ── Project Types ───────────────────────────────────────────────

export const CreateProjectArgsSchema = z.object({
  name: z.string().describe('Name of the project'),
  notes: z.string().optional().describe('Additional notes for the project'),
  area: z.string().optional().describe('Area to place the project in'),
});
export type CreateProjectArgs = z.infer<typeof CreateProjectArgsSchema>;

export const ListProjectsArgsSchema = z.object({
  area: z.string().optional().describe('Filter projects by area name'),
});
export type ListProjectsArgs = z.infer<typeof ListProjectsArgsSchema>;

export const GetProjectTodosArgsSchema = z.object({
  project_name: z.string().describe('Name of the project'),
  status: lowerEnum(['open', 'completed', 'all'])
    .optional()
    .describe('Filter by status (defaults to all)'),
});
export type GetProjectTodosArgs = z.infer<typeof GetProjectTodosArgsSchema>;

export const UpdateProjectArgsSchema = z.object({
  project_name: z.string().describe('Current name of the project to update'),
  new_name: z.string().optional().describe('New name for the project'),
  new_notes: z.string().optional().describe('New notes for the project'),
  new_due_date: z
    .string()
    .optional()
    .describe("New due date (YYYY-MM-DD format, or 'none' to clear)"),
  new_tags: z.array(z.string()).optional().describe('New list of tag names (empty array clears)'),
  new_area: z.string().optional().describe("New area for the project ('none' to detach)"),
});
export type UpdateProjectArgs = z.infer<typeof UpdateProjectArgsSchema>;

// ── List/Utility Types ──────────────────────────────────────────

export const ListTagsArgsSchema = z.object({});
export type ListTagsArgs = z.infer<typeof ListTagsArgsSchema>;

export const ListAreasArgsSchema = z.object({});
export type ListAreasArgs = z.infer<typeof ListAreasArgsSchema>;

// ── Move Types ──────────────────────────────────────────────────

export const MoveTodoArgsBaseSchema = z.object({
  id: z.string().optional().describe('ID of the todo to move'),
  todo_name: z.string().optional().describe('Name of the todo to move'),
  destination: lowerEnum(['inbox', 'today', 'evening', 'anytime', 'upcoming', 'someday']).describe(
    'Destination list',
  ),
});
export const MoveTodoArgsSchema = MoveTodoArgsBaseSchema.refine(idOrTodoName, idOrTodoNameMsg);
export type MoveTodoArgs = z.infer<typeof MoveTodoArgsSchema>;

export const MoveTodoToProjectArgsBaseSchema = z.object({
  id: z.string().optional().describe('ID of the todo to move'),
  todo_name: z.string().optional().describe('Name of the todo to move'),
  project_name: z.string().describe('Name of the target project'),
});
export const MoveTodoToProjectArgsSchema = MoveTodoToProjectArgsBaseSchema.refine(
  idOrTodoName,
  idOrTodoNameMsg,
);
export type MoveTodoToProjectArgs = z.infer<typeof MoveTodoToProjectArgsSchema>;

export const MoveTodoToAreaArgsBaseSchema = z.object({
  id: z.string().optional().describe('ID of the todo to move'),
  todo_name: z.string().optional().describe('Name of the todo to move'),
  area_name: z.string().describe('Name of the target area'),
});
export const MoveTodoToAreaArgsSchema = MoveTodoToAreaArgsBaseSchema.refine(
  idOrTodoName,
  idOrTodoNameMsg,
);
export type MoveTodoToAreaArgs = z.infer<typeof MoveTodoToAreaArgsSchema>;

export const MoveProjectToAreaArgsSchema = z.object({
  project_name: z.string().describe('Name of the project to move'),
  area_name: z.string().describe('Name of the target area'),
});
export type MoveProjectToAreaArgs = z.infer<typeof MoveProjectToAreaArgsSchema>;

export const RemoveTodoFromProjectArgsBaseSchema = z.object({
  id: z.string().optional().describe('ID of the todo to remove from its project'),
  todo_name: z.string().optional().describe('Name of the todo to remove from its project'),
});
export const RemoveTodoFromProjectArgsSchema = RemoveTodoFromProjectArgsBaseSchema.refine(
  idOrTodoName,
  idOrTodoNameMsg,
);
export type RemoveTodoFromProjectArgs = z.infer<typeof RemoveTodoFromProjectArgsSchema>;

export const RemoveProjectFromAreaArgsSchema = z.object({
  project_name: z.string().describe('Name of the project to remove from its area'),
});
export type RemoveProjectFromAreaArgs = z.infer<typeof RemoveProjectFromAreaArgsSchema>;

// ── JSON Schemas for MCP Tool Registration ──────────────────────

export const toolSchemas = {
  create_todo: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Name of the todo' },
      notes: { type: 'string', description: 'Additional notes for the todo' },
      due_date: { type: 'string', description: 'Due date in YYYY-MM-DD format' },
      tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'List of tag names to apply',
      },
      list: {
        type: 'string',
        enum: ['inbox', 'today', 'anytime', 'someday'],
        description: 'Target list (defaults to inbox). With project: also moves todo to this list',
      },
      project: {
        type: 'string',
        description: 'Project name to create the todo in',
      },
      area: {
        type: 'string',
        description: 'Area name to place the todo in',
      },
    },
    required: ['name'],
  },
  list_todos: {
    type: 'object' as const,
    properties: {
      list: {
        type: 'string',
        enum: ['inbox', 'today', 'anytime', 'upcoming', 'someday', 'logbook'],
        description: 'List to retrieve todos from',
      },
      status: {
        type: 'string',
        enum: ['open', 'completed', 'all'],
        description: 'Filter by status (defaults to all)',
      },
    },
    required: ['list'],
  },
  complete_todo: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'ID of the todo to complete' },
      name: { type: 'string', description: 'Name of the todo to complete' },
    },
    required: [] as string[],
  },
  update_todo: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'ID of the todo to update' },
      name: { type: 'string', description: 'Current name of the todo to update' },
      new_name: { type: 'string', description: 'New name for the todo' },
      new_notes: { type: 'string', description: 'New notes for the todo' },
      new_due_date: {
        type: 'string',
        description: "New due date (YYYY-MM-DD format, or 'none' to clear)",
      },
      new_tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'New list of tag names',
      },
    },
    required: [] as string[],
  },
  search_todos: {
    type: 'object' as const,
    properties: {
      query: { type: 'string', description: 'Search query to find todos by name' },
    },
    required: ['query'],
  },
  create_project: {
    type: 'object' as const,
    properties: {
      name: { type: 'string', description: 'Name of the project' },
      notes: { type: 'string', description: 'Additional notes for the project' },
      area: { type: 'string', description: 'Area to place the project in' },
    },
    required: ['name'],
  },
  update_project: {
    type: 'object' as const,
    properties: {
      project_name: { type: 'string', description: 'Current name of the project to update' },
      new_name: { type: 'string', description: 'New name for the project' },
      new_notes: { type: 'string', description: 'New notes for the project' },
      new_due_date: {
        type: 'string',
        description: "New due date (YYYY-MM-DD format, or 'none' to clear)",
      },
      new_tags: {
        type: 'array',
        items: { type: 'string' },
        description: 'New list of tag names (empty array clears)',
      },
      new_area: { type: 'string', description: "New area for the project ('none' to detach)" },
    },
    required: ['project_name'],
  },
  list_projects: {
    type: 'object' as const,
    properties: {
      area: { type: 'string', description: 'Filter projects by area name' },
    },
    required: [] as string[],
  },
  get_project_todos: {
    type: 'object' as const,
    properties: {
      project_name: { type: 'string', description: 'Name of the project' },
      status: {
        type: 'string',
        enum: ['open', 'completed', 'all'],
        description: 'Filter by status (defaults to all)',
      },
    },
    required: ['project_name'],
  },
  list_tags: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
  list_areas: {
    type: 'object' as const,
    properties: {},
    required: [] as string[],
  },
  move_todo: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'ID of the todo to move' },
      todo_name: { type: 'string', description: 'Name of the todo to move' },
      destination: {
        type: 'string',
        enum: ['inbox', 'today', 'evening', 'anytime', 'upcoming', 'someday'],
        description: 'Destination list',
      },
    },
    required: ['destination'],
  },
  move_todo_to_project: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'ID of the todo to move' },
      todo_name: { type: 'string', description: 'Name of the todo to move' },
      project_name: { type: 'string', description: 'Name of the target project' },
    },
    required: ['project_name'],
  },
  move_todo_to_area: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'ID of the todo to move' },
      todo_name: { type: 'string', description: 'Name of the todo to move' },
      area_name: { type: 'string', description: 'Name of the target area' },
    },
    required: ['area_name'],
  },
  move_project_to_area: {
    type: 'object' as const,
    properties: {
      project_name: { type: 'string', description: 'Name of the project to move' },
      area_name: { type: 'string', description: 'Name of the target area' },
    },
    required: ['project_name', 'area_name'],
  },
  remove_todo_from_project: {
    type: 'object' as const,
    properties: {
      id: { type: 'string', description: 'ID of the todo to remove from its project' },
      todo_name: {
        type: 'string',
        description: 'Name of the todo to remove from its project',
      },
    },
    required: [] as string[],
  },
  remove_project_from_area: {
    type: 'object' as const,
    properties: {
      project_name: {
        type: 'string',
        description: 'Name of the project to remove from its area',
      },
    },
    required: ['project_name'],
  },
};
