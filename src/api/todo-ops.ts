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
  todoLabel,
  todoRef,
} from '../utils/applescript.js';
import { applyWhen } from './when.js';

/**
 * Things3 refuses `set due date to missing value` with -1700 ("Can't make missing
 * value into type date"), so fall back to deleting the property outright.
 */
function clearDueDate(ref: string): string {
  return [
    'try',
    `  set due date of ${ref} to missing value`,
    'on error',
    `  delete due date of ${ref}`,
    'end try',
  ].join('\n');
}

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

  // `make new to do at beginning of project "X"` reports success but silently
  // leaves the todo in the Inbox. Create it, then attach it with the same
  // `set project of` that moveTodoToProject uses — that one actually works.
  // `evening` is not a real container — it is set afterwards, like any other "When".
  const containerList = args.list && args.list !== 'evening' ? capitalize(args.list) : 'Inbox';
  const listName = args.project ? 'Inbox' : containerList;
  const lines = [
    ...preamble,
    `set newTodo to make new to do in list ${quoteString(listName)} with properties ${propertiesStr}`,
  ];
  if (args.project) {
    lines.push(`set project of newTodo to project ${quoteString(args.project)}`);
  }
  lines.push('return id of newTodo');

  const todoId = await execute(tellThings(lines.join('\n')));

  if (args.area && !args.project) {
    const areaCommand = `set area of to do named ${quoteString(args.name)} to area ${quoteString(args.area)}`;
    await execute(tellThings(areaCommand));
  }

  // `move ... to list` pulls a todo OUT of its project, so for a todo that lives
  // in a project the list is expressed as a schedule instead:
  //   today    → scheduled for today, stays in the project
  //   anytime  → an unscheduled project todo already shows up in Anytime
  //   someday  → the only list move that keeps the project
  if (args.project && args.list && args.list !== 'anytime') {
    const ref = `to do id ${quoteString(todoId)}`;
    const command =
      args.list === 'today'
        ? `schedule ${ref} for (current date)`
        : `move ${ref} to list ${quoteString(capitalize(args.list))}`;
    await execute(tellThings(command));
  }

  if (args.list === 'evening' && !args.project) {
    await applyWhen(`to do id ${quoteString(todoId)}`, todoId, 'evening');
  }

  if (args.when) {
    await applyWhen(`to do id ${quoteString(todoId)}`, todoId, args.when);
  }

  const suffix = args.project
    ? ` in project "${args.project}"`
    : args.area
      ? ` in area "${args.area}"`
      : '';
  return { message: `Created todo: ${args.name}${suffix}`, id: todoId };
}

export async function listTodos(args: ListTodosArgs): Promise<ListTodosResult> {
  const listName = capitalize(args.list);

  // Every property is fetched in one bulk call against a bound list reference.
  // Re-inlining `every to do of list "X"` inside the loop made it O(n) full-list
  // scans — that is what turned a 40-item list into a 4-second call.
  const listRef = `every to do of theList`;
  const script = tellThings(`
set theList to list ${quoteString(listName)}
set todoCount to count of ${listRef}
if todoCount is 0 then return ""
set allIds to id of ${listRef}
set allNames to name of ${listRef}
set allStatuses to status of ${listRef}
set allNotes to notes of ${listRef}
set allDueDates to due date of ${listRef}
set allTags to tag names of ${listRef}
set allProjects to {}
try
  set allProjects to project of ${listRef}
end try
set safeDates to {}
set safeNotes to {}
set safeProjects to {}
set safeTags to {}
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
  set tt to item i of allTags
  set AppleScript's text item delimiters to tab
  set tp to text items of tt
  set AppleScript's text item delimiters to " "
  set end of safeTags to tp as string
  set projName to ""
  if i is less than or equal to (count of allProjects) then
    set p to item i of allProjects
    if p is not missing value then
      try
        set projName to name of p
      end try
    end if
  end if
  set end of safeProjects to projName
end repeat
set tid to AppleScript's text item delimiters
set AppleScript's text item delimiters to "\t"
set idLine to allIds as string
set nameLine to allNames as string
set statusLine to allStatuses as string
set noteLine to safeNotes as string
set dateLine to safeDates as string
set tagLine to safeTags as string
set projLine to safeProjects as string
set AppleScript's text item delimiters to tid
return idLine & "\n" & nameLine & "\n" & statusLine & "\n" & noteLine & "\n" & dateLine & "\n" & tagLine & "\n" & projLine`);

  const output = await execute(script);
  const todos = parseTodoColumns(output);
  const filtered = filterTodosByStatus(todos, args.status);
  return { list: listName, todos: filtered };
}

export async function completeTodo(args: CompleteTodoArgs): Promise<ActionResult> {
  const ref = todoRef(args);
  const command = `set status of ${ref} to completed\nreturn id of ${ref}`;
  const script = tellThings(command);

  const todoId = await execute(script);
  return { message: `Completed todo: ${todoLabel(args)}`, id: todoId };
}

export async function updateTodo(args: UpdateTodoArgs): Promise<ActionResult> {
  const commands: string[] = [];
  const ref = todoRef(args);
  const label = todoLabel(args);

  if (args.new_name) {
    commands.push(`set name of ${ref} to ${quoteString(args.new_name)}`);
  }

  if (args.new_notes !== undefined) {
    commands.push(`set notes of ${ref} to ${quoteString(args.new_notes)}`);
  }

  if (args.new_due_date !== undefined) {
    if (args.new_due_date === 'none') {
      commands.push(clearDueDate(ref));
    } else {
      commands.push(buildDateVar(args.new_due_date, 'dueD'));
      commands.push(`set due date of ${ref} to dueD`);
    }
  }

  if (args.new_tags) {
    commands.push(`set tag names of ${ref} to ${quoteString(args.new_tags.join(', '))}`);
  }

  if (commands.length === 0 && args.new_when === undefined) {
    return { message: `No updates specified for todo: ${label}` };
  }

  let todoId = args.id;
  if (commands.length > 0) {
    commands.push(`return id of ${ref}`);
    todoId = await execute(tellThings(commands.join('\n')));
  }

  if (args.new_when !== undefined) {
    await applyWhen(ref, todoId, args.new_when);
    todoId = todoId || (await execute(tellThings(`return id of ${ref}`)));
  }

  return { message: `Updated todo: ${label}`, id: todoId };
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
      set todoId to id of t
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
      set end of allTodos to todoId & "\t" & currentList & "\t" & todoName & "\t" & todoStatus & "\t" & nn & "\t" & ddStr & "\t" & tt & "\t" & projName & "\t" & areaName
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
