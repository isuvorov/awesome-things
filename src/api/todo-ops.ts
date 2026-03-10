import { filterTodosByStatus, parseSearchLines, parseTodoColumns } from '../tools/parsers.js';
import type {
  ActionResult,
  CompleteTodoArgs,
  CreateTodoArgs,
  ListTodosArgs,
  ListTodosResult,
  SearchTodosArgs,
  SearchTodosResult,
  UpdateTodoArgs,
} from '../types.js';
import {
  buildProperties,
  capitalize,
  execute,
  quoteString,
  tellThings,
} from '../utils/applescript.js';

export async function createTodo(args: CreateTodoArgs): Promise<ActionResult> {
  const props: [string, string][] = [['name', quoteString(args.name)]];

  if (args.notes) {
    props.push(['notes', quoteString(args.notes)]);
  }

  if (args.due_date) {
    props.push(['due date', `date ${quoteString(args.due_date)}`]);
  }

  if (args.tags && args.tags.length > 0) {
    props.push(['tag names', quoteString(args.tags.join(', '))]);
  }

  if (args.area && !args.project) {
    props.push(['area', `area ${quoteString(args.area)}`]);
  }

  const propertiesStr = buildProperties(props);

  let container: string;
  if (args.project) {
    container = `at beginning of project ${quoteString(args.project)}`;
  } else {
    const listName = args.list ? capitalize(args.list) : 'Inbox';
    container = `in list ${quoteString(listName)}`;
  }

  const command = `make new to do ${container} with properties ${propertiesStr}`;
  const script = tellThings(command);

  await execute(script);

  if (args.project && args.list) {
    const listName = capitalize(args.list);
    const moveCommand = `move to do named ${quoteString(args.name)} to list ${quoteString(listName)}`;
    await execute(tellThings(moveCommand));
  }

  const suffix = args.project
    ? ` in project "${args.project}"`
    : args.area
      ? ` in area "${args.area}"`
      : '';
  return { message: `Created todo: ${args.name}${suffix}` };
}

export async function listTodos(args: ListTodosArgs): Promise<ListTodosResult> {
  const listName = capitalize(args.list);

  const listRef = `every to do of list ${quoteString(listName)}`;
  const script = tellThings(`
set todoCount to count of ${listRef}
if todoCount is 0 then return ""
set allNames to name of ${listRef}
set allStatuses to status of ${listRef}
set allNotes to notes of ${listRef}
set allDueDates to due date of ${listRef}
set allTags to tag names of ${listRef}
set safeDates to {}
repeat with i from 1 to todoCount
  set dd to item i of allDueDates
  if dd is missing value then
    set end of safeDates to ""
  else
    set end of safeDates to dd as string
  end if
end repeat
set tid to AppleScript's text item delimiters
set AppleScript's text item delimiters to "\t"
set nameLine to allNames as string
set statusLine to allStatuses as string
set noteLine to allNotes as string
set dateLine to safeDates as string
set tagLine to allTags as string
set AppleScript's text item delimiters to tid
return nameLine & "\n" & statusLine & "\n" & noteLine & "\n" & dateLine & "\n" & tagLine`);

  const output = await execute(script);
  const todos = parseTodoColumns(output);
  const filtered = filterTodosByStatus(todos, args.status);
  return { list: listName, todos: filtered };
}

export async function completeTodo(args: CompleteTodoArgs): Promise<ActionResult> {
  const command = `set status of to do named ${quoteString(args.name)} to completed`;
  const script = tellThings(command);

  await execute(script);
  return { message: `Completed todo: ${args.name}` };
}

export async function updateTodo(args: UpdateTodoArgs): Promise<ActionResult> {
  const commands: string[] = [];
  const todoRef = `to do named ${quoteString(args.name)}`;

  if (args.new_name) {
    commands.push(`set name of ${todoRef} to ${quoteString(args.new_name)}`);
  }

  if (args.new_notes !== undefined) {
    commands.push(`set notes of ${todoRef} to ${quoteString(args.new_notes)}`);
  }

  if (args.new_due_date !== undefined) {
    if (args.new_due_date === 'none') {
      commands.push(`set due date of ${todoRef} to missing value`);
    } else {
      commands.push(`set due date of ${todoRef} to date ${quoteString(args.new_due_date)}`);
    }
  }

  if (args.new_tags) {
    commands.push(`set tag names of ${todoRef} to ${quoteString(args.new_tags.join(', '))}`);
  }

  if (commands.length === 0) {
    return { message: `No updates specified for todo: ${args.name}` };
  }

  const script = tellThings(commands.join('\n'));
  await execute(script);
  return { message: `Updated todo: ${args.name}` };
}

export async function searchTodos(args: SearchTodosArgs): Promise<SearchTodosResult> {
  const script = tellThings(`
set allTodos to {}
set searchQuery to ${quoteString(args.query)}
repeat with listName in {"Inbox", "Today", "Anytime", "Upcoming", "Someday"}
  try
    set allNames to name of every to do of list listName
    set allStatuses to status of every to do of list listName
    set todoCount to count of allNames
    repeat with i from 1 to todoCount
      set todoName to item i of allNames
      if todoName contains searchQuery then
        set todoStatus to item i of allStatuses as string
        set end of allTodos to "[" & listName & "] " & todoName & " (" & todoStatus & ")"
      end if
    end repeat
  end try
end repeat
if (count of allTodos) is 0 then
  return ""
else
  return allTodos as string
end if`);

  const output = await execute(script);
  const results = parseSearchLines(output);
  return { query: args.query, results };
}
