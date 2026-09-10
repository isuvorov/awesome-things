import { filterTodosByStatus, parseProjectLines, parseTodoLines } from '../tools/parsers.js';
import type {
  ActionResult,
  CreateProjectArgs,
  GetProjectTodosArgs,
  GetProjectTodosResult,
  ListProjectsArgs,
  ListProjectsResult,
  UpdateProjectArgs,
} from '../types.js';
import {
  buildDateVar,
  buildProperties,
  execute,
  quoteString,
  tellThings,
} from '../utils/applescript.js';

export async function createProject(args: CreateProjectArgs): Promise<ActionResult> {
  const props: [string, string][] = [['name', quoteString(args.name)]];

  if (args.notes) {
    props.push(['notes', quoteString(args.notes)]);
  }

  const propertiesStr = buildProperties(props);
  const commands = [`set newProj to make new project with properties ${propertiesStr}`];

  // `area` inside `with properties` makes the whole `make new project` fail —
  // createTodo has always set the area as a separate step, and that one works.
  if (args.area) {
    commands.push(`set area of newProj to area ${quoteString(args.area)}`);
  }

  commands.push('return id of newProj');

  const projId = await execute(tellThings(commands.join('\n')));
  const suffix = args.area ? ` in area "${args.area}"` : '';
  return { message: `Created project: ${args.name}${suffix}`, id: projId };
}

export async function updateProject(args: UpdateProjectArgs): Promise<ActionResult> {
  const label = `"${args.project_name}"`;

  // Bind the project to a variable up front so a rename does not break the
  // subsequent commands (which would otherwise resolve it by its old name).
  const commands = [`set theProject to project ${quoteString(args.project_name)}`];

  if (args.new_name) {
    commands.push(`set name of theProject to ${quoteString(args.new_name)}`);
  }

  if (args.new_notes !== undefined) {
    commands.push(`set notes of theProject to ${quoteString(args.new_notes)}`);
  }

  if (args.new_due_date !== undefined) {
    if (args.new_due_date === 'none') {
      // Things3 rejects `missing value` for a date with -1700; delete the property.
      commands.push(
        [
          'try',
          '  set due date of theProject to missing value',
          'on error',
          '  delete due date of theProject',
          'end try',
        ].join('\n'),
      );
    } else {
      commands.push(buildDateVar(args.new_due_date, 'dueD'));
      commands.push('set due date of theProject to dueD');
    }
  }

  // An empty array is how you clear tags — `tag names` takes a comma-joined string.
  if (args.new_tags) {
    commands.push(`set tag names of theProject to ${quoteString(args.new_tags.join(', '))}`);
  }

  if (args.new_area !== undefined) {
    commands.push(
      args.new_area === 'none'
        ? 'set area of theProject to missing value'
        : `set area of theProject to area ${quoteString(args.new_area)}`,
    );
  }

  if (commands.length === 1) {
    return { message: `No updates specified for project: ${label}` };
  }

  commands.push('return id of theProject');
  const script = tellThings(commands.join('\n'));
  const projId = await execute(script);
  return { message: `Updated project: ${label}`, id: projId };
}

export async function listProjects(args: ListProjectsArgs): Promise<ListProjectsResult> {
  // Always fetch every project with its area and filter here. Things3 has no
  // `every project of area "X"` — that call fails with -1728.
  const script = tellThings(`
set projCount to count of every project
if projCount is 0 then return ""
set allIds to id of every project
set allNames to name of every project
set allStatuses to status of every project
set allNotes to notes of every project
set allAreas to {}
try
  set allAreas to area of every project
end try
set output to {}
repeat with i from 1 to projCount
  set nn to item i of allNotes
  set AppleScript's text item delimiters to return
  set np to text items of nn
  set AppleScript's text item delimiters to "%0A"
  set nn to np as string
  set AppleScript's text item delimiters to linefeed
  set np to text items of nn
  set AppleScript's text item delimiters to "%0A"
  set nn to np as string
  set AppleScript's text item delimiters to tab
  set np to text items of nn
  set AppleScript's text item delimiters to " "
  set nn to np as string
  set areaName to ""
  if i is less than or equal to (count of allAreas) then
    set a to item i of allAreas
    if a is not missing value then
      try
        set areaName to name of a
      end try
    end if
  end if
  set end of output to (item i of allIds) & tab & (item i of allNames) & tab & (item i of allStatuses as string) & tab & nn & tab & areaName
end repeat
set AppleScript's text item delimiters to linefeed
return output as string`);

  const output = await execute(script);
  const projects = parseProjectLines(output, true);
  if (!args.area) return { projects };

  const wanted = args.area.toLowerCase();
  const filtered = projects
    .filter((project) => (project.area || '').toLowerCase() === wanted)
    .map(({ area: _area, ...project }) => project);
  return { area: args.area, projects: filtered };
}

export async function getProjectTodos(args: GetProjectTodosArgs): Promise<GetProjectTodosResult> {
  const projRef = `every to do of project ${quoteString(args.project_name)}`;
  const script = tellThings(`
set todoCount to count of ${projRef}
if todoCount is 0 then return ""
set allIds to id of ${projRef}
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
    if dd is not missing value then
      set y to year of dd as string
      set m to month of dd as integer
      if m < 10 then set m to "0" & m
      set d to day of dd
      if d < 10 then set d to "0" & d
      set todoDueDate to y & "-" & m & "-" & d
    end if
  end try
  set nn to item i of allNotes
  set AppleScript's text item delimiters to return
  set np to text items of nn
  set AppleScript's text item delimiters to "%0A"
  set nn to np as string
  set AppleScript's text item delimiters to linefeed
  set np to text items of nn
  set AppleScript's text item delimiters to "%0A"
  set nn to np as string
  set AppleScript's text item delimiters to tab
  set np to text items of nn
  set AppleScript's text item delimiters to " "
  set nn to np as string
  set tt to item i of allTags
  set AppleScript's text item delimiters to tab
  set tp to text items of tt
  set AppleScript's text item delimiters to " "
  set tt to tp as string
  set end of output to (item i of allIds) & tab & (item i of allNames) & tab & todoStatus & tab & nn & tab & todoDueDate & tab & tt
end repeat
set AppleScript's text item delimiters to linefeed
return output as string`);

  const output = await execute(script);
  const todos = parseTodoLines(output);
  const filtered = filterTodosByStatus(todos, args.status);
  return { project: args.project_name, todos: filtered };
}
