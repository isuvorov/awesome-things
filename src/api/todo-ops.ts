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
  buildDateVar,
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

  const preamble: string[] = [];

  if (args.due_date) {
    preamble.push(buildDateVar(args.due_date, 'dueD'));
    props.push(['due date', 'dueD']);
  }

  if (args.tags && args.tags.length > 0) {
    props.push(['tag names', quoteString(args.tags.join(', '))]);
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
  const lines = [...preamble, command];
  const script = tellThings(lines.join('\n'));

  await execute(script);

  if (args.area && !args.project) {
    const areaCommand = `set area of to do named ${quoteString(args.name)} to area ${quoteString(args.area)}`;
    await execute(tellThings(areaCommand));
  }

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
set safeNotes to {}
set safeProjects to {}
repeat with i from 1 to todoCount
  set dd to item i of allDueDates
  if dd is missing value then
    set end of safeDates to ""
  else
    set y to year of dd as string
    set m to month of dd as integer
    if m < 10 then set m to "0" & m
    set d to day of dd
    if d < 10 then set d to "0" & d
    set end of safeDates to y & "-" & m & "-" & d
  end if
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
  set end of safeNotes to np as string
  set projName to ""
  try
    set projName to name of project of item i of ${listRef}
  end try
  set end of safeProjects to projName
end repeat
set safeTags to {}
repeat with i from 1 to todoCount
  set tt to item i of allTags
  set AppleScript's text item delimiters to tab
  set tp to text items of tt
  set AppleScript's text item delimiters to " "
  set end of safeTags to tp as string
end repeat
set tid to AppleScript's text item delimiters
set AppleScript's text item delimiters to "\t"
set nameLine to allNames as string
set statusLine to allStatuses as string
set noteLine to safeNotes as string
set dateLine to safeDates as string
set tagLine to safeTags as string
set projLine to safeProjects as string
set AppleScript's text item delimiters to tid
return nameLine & "\n" & statusLine & "\n" & noteLine & "\n" & dateLine & "\n" & tagLine & "\n" & projLine`);

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
      commands.push(buildDateVar(args.new_due_date, 'dueD'));
      commands.push(`set due date of ${todoRef} to dueD`);
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
    set currentList to contents of listName
    set matches to every to do of list currentList whose name contains searchQuery
    repeat with t in matches
      set todoName to name of t
      set todoStatus to status of t as string
      set nn to notes of t
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
      set dd to due date of t
      if dd is missing value then
        set ddStr to ""
      else
        set y to year of dd as string
        set m to month of dd as integer
        if m < 10 then set m to "0" & m
        set d to day of dd
        if d < 10 then set d to "0" & d
        set ddStr to y & "-" & m & "-" & d
      end if
      set tt to tag names of t
      set AppleScript's text item delimiters to tab
      set tp to text items of tt
      set AppleScript's text item delimiters to " "
      set tt to tp as string
      set projName to ""
      try
        set projName to name of project of t
      end try
      set areaName to ""
      try
        set areaName to name of area of t
      end try
      set end of allTodos to currentList & "\t" & todoName & "\t" & todoStatus & "\t" & nn & "\t" & ddStr & "\t" & tt & "\t" & projName & "\t" & areaName
    end repeat
  end try
end repeat
if (count of allTodos) is 0 then
  return ""
else
  set tid to AppleScript's text item delimiters
  set AppleScript's text item delimiters to linefeed
  set outputStr to allTodos as string
  set AppleScript's text item delimiters to tid
  return outputStr
end if`);

  const output = await execute(script);
  const results = parseSearchLines(output);
  return { query: args.query, results };
}
