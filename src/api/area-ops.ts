import { filterTodosByStatus, parseTodoLines } from '../tools/parsers.js';
import type { GetAreaTodosArgs, GetAreaTodosResult, TodoItem } from '../types.js';
import { execute, quoteString, tellThings } from '../utils/applescript.js';

/**
 * Todos that sit directly in an area, without a project. There is no
 * `every to do of area "X"` in Things3 (it fails with -1728, the same way
 * `every project of area "X"` does), so the built-in lists are scanned and
 * filtered by the area name — the exact trick listProjects uses.
 *
 * Anytime overlaps Today and Upcoming, so ids are de-duplicated afterwards.
 * Todos that live inside a project are *not* included: in Things3 a project todo
 * has no area of its own — list the project's todos with get_project_todos.
 */
export async function getAreaTodos(args: GetAreaTodosArgs): Promise<GetAreaTodosResult> {
  const listRef = 'every to do of theList';
  const script = tellThings(`
set wantedArea to ${quoteString(args.area_name)}
set output to {}
repeat with lName in {"Today", "Upcoming", "Anytime", "Someday", "Inbox"}
  try
    set theList to list (contents of lName)
    set todoCount to count of ${listRef}
    if todoCount > 0 then
      set allIds to id of ${listRef}
      set allNames to name of ${listRef}
      set allStatuses to status of ${listRef}
      set allNotes to notes of ${listRef}
      set allDueDates to due date of ${listRef}
      set allTags to tag names of ${listRef}
      set allAreas to {}
      try
        set allAreas to area of ${listRef}
      end try
      repeat with i from 1 to todoCount
        set areaName to ""
        if i is less than or equal to (count of allAreas) then
          set a to item i of allAreas
          if a is not missing value then
            try
              set areaName to name of a
            end try
          end if
        else
          -- The bulk fetch above came back short (or failed outright). Indexed
          -- access costs one event per todo, but an empty answer would be worse.
          try
            set a to area of (to do i of theList)
            if a is not missing value then set areaName to name of a
          end try
        end if
        if areaName is wantedArea then
          set dd to item i of allDueDates
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
          set end of output to (item i of allIds) & tab & (item i of allNames) & tab & (item i of allStatuses as string) & tab & nn & tab & ddStr & tab & tt
        end if
      end repeat
    end if
  end try
end repeat
if (count of output) is 0 then return ""
set tid to AppleScript's text item delimiters
set AppleScript's text item delimiters to linefeed
set outputStr to output as string
set AppleScript's text item delimiters to tid
return outputStr`);

  const output = await execute(script);
  const seen = new Set<string>();
  const todos: TodoItem[] = [];
  for (const todo of parseTodoLines(output)) {
    if (seen.has(todo.id)) continue;
    seen.add(todo.id);
    todos.push(todo);
  }

  return { area: args.area_name, todos: filterTodosByStatus(todos, args.status) };
}
