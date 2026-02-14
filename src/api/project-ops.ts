import { filterTodosByStatus, parseProjectLines, parseTodoLines } from '../tools/parsers.js';
import type {
  ActionResult,
  CreateProjectArgs,
  GetProjectTodosArgs,
  GetProjectTodosResult,
  ListProjectsArgs,
  ListProjectsResult,
} from '../types.js';
import { buildProperties, execute, quoteString, tellThings } from '../utils/applescript.js';

export async function createProject(args: CreateProjectArgs): Promise<ActionResult> {
  const props: [string, string][] = [['name', quoteString(args.name)]];

  if (args.notes) {
    props.push(['notes', quoteString(args.notes)]);
  }

  if (args.area) {
    props.push(['area', `area ${quoteString(args.area)}`]);
  }

  const propertiesStr = buildProperties(props);
  const command = `make new project with properties ${propertiesStr}`;
  const script = tellThings(command);

  await execute(script);
  return { message: `Created project: ${args.name}` };
}

export async function listProjects(args: ListProjectsArgs): Promise<ListProjectsResult> {
  let script: string;
  const withArea = !args.area;

  if (args.area) {
    const areaRef = `every project of area ${quoteString(args.area)}`;
    script = tellThings(`
set projCount to count of ${areaRef}
if projCount is 0 then return ""
set allNames to name of ${areaRef}
set allStatuses to status of ${areaRef}
set allNotes to notes of ${areaRef}
set output to {}
repeat with i from 1 to projCount
  set end of output to (item i of allNames) & " | " & (item i of allStatuses as string) & " | " & (item i of allNotes)
end repeat
return output as string`);
  } else {
    script = tellThings(`
set projCount to count of every project
if projCount is 0 then return ""
set allNames to name of every project
set allStatuses to status of every project
set allNotes to notes of every project
set output to {}
repeat with i from 1 to projCount
  set projAreaName to ""
  try
    set projAreaName to name of area of project (item i of allNames)
  end try
  set end of output to (item i of allNames) & " | " & (item i of allStatuses as string) & " | " & (item i of allNotes) & " | Area: " & projAreaName
end repeat
return output as string`);
  }

  const output = await execute(script);
  const projects = parseProjectLines(output, withArea);
  return { area: args.area, projects };
}

export async function getProjectTodos(args: GetProjectTodosArgs): Promise<GetProjectTodosResult> {
  const projRef = `every to do of project ${quoteString(args.project_name)}`;
  const script = tellThings(`
set todoCount to count of ${projRef}
if todoCount is 0 then return ""
set allNames to name of ${projRef}
set allStatuses to status of ${projRef}
set allNotes to notes of ${projRef}
set allDueDates to due date of ${projRef}
set allTags to tag names of ${projRef}
set output to {}
repeat with i from 1 to todoCount
  set todoStatus to item i of allStatuses as string
  set todoDueDate to ""
  try
    set dd to item i of allDueDates
    if dd is not missing value then set todoDueDate to dd as string
  end try
  set end of output to (item i of allNames) & " | " & todoStatus & " | " & (item i of allNotes) & " | " & todoDueDate & " | " & (item i of allTags)
end repeat
return output as string`);

  const output = await execute(script);
  const todos = parseTodoLines(output);
  const filtered = filterTodosByStatus(todos, args.status);
  return { project: args.project_name, todos: filtered };
}
