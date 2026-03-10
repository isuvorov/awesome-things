import type {
  ActionResult,
  MoveProjectToAreaArgs,
  MoveTodoArgs,
  MoveTodoToAreaArgs,
  MoveTodoToProjectArgs,
  RemoveProjectFromAreaArgs,
  RemoveTodoFromProjectArgs,
} from '../types.js';
import {
  capitalize,
  execute,
  quoteString,
  tellThings,
  todoLabel,
  todoRef,
} from '../utils/applescript.js';

export async function moveTodo(args: MoveTodoArgs): Promise<ActionResult> {
  const ref = todoRef(args);
  const label = todoLabel(args);

  if (args.destination === 'evening') {
    const urlToken = process.env.AWESOME_THINGS_URL_TOKEN;
    if (!urlToken) {
      throw new Error(
        'AWESOME_THINGS_URL_TOKEN is required for evening. Find it in Things → Settings → General.',
      );
    }
    // Evening requires Things URL scheme — get the id first, then use URL scheme
    const todoId = args.id || (await execute(tellThings(`return id of ${ref}`)));
    // Move to Today first via AppleScript
    const moveScript = tellThings(`move ${ref} to list "Today"`);
    await execute(moveScript);
    // Then set evening via URL scheme (requires auth-token)
    const urlScheme = `things:///update?auth-token=${encodeURIComponent(urlToken)}&id=${encodeURIComponent(todoId)}&when=evening`;
    await execute(`open location "${urlScheme}"`);
    return { message: `Moved todo ${label} to This Evening`, id: todoId };
  }

  if (args.destination === 'upcoming') {
    const command = `set activation date of ${ref} to (current date) + 1 * days\nreturn id of ${ref}`;
    const script = tellThings(command);
    const todoId = await execute(script);
    return {
      message: `Moved todo ${label} to Upcoming (set activation date to tomorrow)`,
      id: todoId,
    };
  }

  const listName = capitalize(args.destination);
  const command = `move ${ref} to list ${quoteString(listName)}\nreturn id of ${ref}`;
  const script = tellThings(command);
  const todoId = await execute(script);
  return { message: `Moved todo ${label} to ${listName}`, id: todoId };
}

export async function moveTodoToProject(args: MoveTodoToProjectArgs): Promise<ActionResult> {
  const ref = todoRef(args);
  const label = todoLabel(args);
  const command = `set project of ${ref} to project ${quoteString(args.project_name)}\nreturn id of ${ref}`;
  const script = tellThings(command);

  const todoId = await execute(script);
  return { message: `Moved todo ${label} to project "${args.project_name}"`, id: todoId };
}

export async function moveTodoToArea(args: MoveTodoToAreaArgs): Promise<ActionResult> {
  const ref = todoRef(args);
  const label = todoLabel(args);
  const command = `set area of ${ref} to area ${quoteString(args.area_name)}\nreturn id of ${ref}`;
  const script = tellThings(command);

  const todoId = await execute(script);
  return { message: `Moved todo ${label} to area "${args.area_name}"`, id: todoId };
}

export async function moveProjectToArea(args: MoveProjectToAreaArgs): Promise<ActionResult> {
  const command = `set area of project ${quoteString(args.project_name)} to area ${quoteString(args.area_name)}`;
  const script = tellThings(command);

  await execute(script);
  return { message: `Moved project "${args.project_name}" to area "${args.area_name}"` };
}

export async function removeTodoFromProject(
  args: RemoveTodoFromProjectArgs,
): Promise<ActionResult> {
  const ref = todoRef(args);
  const label = todoLabel(args);
  const command = `delete project of ${ref}\nreturn id of ${ref}`;
  const script = tellThings(command);

  const todoId = await execute(script);
  return { message: `Removed todo ${label} from its project`, id: todoId };
}

export async function removeProjectFromArea(
  args: RemoveProjectFromAreaArgs,
): Promise<ActionResult> {
  const command = `delete area of project ${quoteString(args.project_name)}`;
  const script = tellThings(command);

  await execute(script);
  return { message: `Removed project "${args.project_name}" from its area` };
}
