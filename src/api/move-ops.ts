import type {
  ActionResult,
  MoveProjectToAreaArgs,
  MoveTodoArgs,
  MoveTodoToAreaArgs,
  MoveTodoToProjectArgs,
  RemoveProjectFromAreaArgs,
  RemoveTodoFromProjectArgs,
} from '../types.js';
import { capitalize, execute, quoteString, tellThings } from '../utils/applescript.js';

export async function moveTodo(args: MoveTodoArgs): Promise<ActionResult> {
  if (args.destination === 'evening') {
    // "This Evening" is a sub-section of Today. Move to Today, then enable the evening flag.
    const todoRef = `to do named ${quoteString(args.todo_name)}`;
    const script = tellThings(
      `move ${todoRef} to list "Today"\nset properties of ${todoRef} to {evening:true}`,
    );
    await execute(script);
    return {
      message: `Moved todo "${args.todo_name}" to This Evening`,
    };
  }

  if (args.destination === 'upcoming') {
    // "Upcoming" is a smart list showing todos with a future activation date.
    // Things3 doesn't allow moving directly to it — set activation date to tomorrow instead.
    const command = `set activation date of to do named ${quoteString(args.todo_name)} to (current date) + 1 * days`;
    const script = tellThings(command);
    await execute(script);
    return {
      message: `Moved todo "${args.todo_name}" to Upcoming (set activation date to tomorrow)`,
    };
  }

  const listName = capitalize(args.destination);
  const command = `move to do named ${quoteString(args.todo_name)} to list ${quoteString(listName)}`;
  const script = tellThings(command);

  await execute(script);
  return { message: `Moved todo "${args.todo_name}" to ${listName}` };
}

export async function moveTodoToProject(args: MoveTodoToProjectArgs): Promise<ActionResult> {
  const command = `set project of to do named ${quoteString(args.todo_name)} to project ${quoteString(args.project_name)}`;
  const script = tellThings(command);

  await execute(script);
  return { message: `Moved todo "${args.todo_name}" to project "${args.project_name}"` };
}

export async function moveTodoToArea(args: MoveTodoToAreaArgs): Promise<ActionResult> {
  const command = `set area of to do named ${quoteString(args.todo_name)} to area ${quoteString(args.area_name)}`;
  const script = tellThings(command);

  await execute(script);
  return { message: `Moved todo "${args.todo_name}" to area "${args.area_name}"` };
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
  const command = `delete project of to do named ${quoteString(args.todo_name)}`;
  const script = tellThings(command);

  await execute(script);
  return { message: `Removed todo "${args.todo_name}" from its project` };
}

export async function removeProjectFromArea(
  args: RemoveProjectFromAreaArgs,
): Promise<ActionResult> {
  const command = `delete area of project ${quoteString(args.project_name)}`;
  const script = tellThings(command);

  await execute(script);
  return { message: `Removed project "${args.project_name}" from its area` };
}
