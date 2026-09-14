import { errorMessage } from '../server/errors.js';
import type { ActionResult, BatchItemResult } from '../types.js';

/**
 * Runs a single-todo operation once per id. Trashing seven todos used to be seven
 * round-trips through the MCP client; `ids` makes it one call.
 *
 * Sequential on purpose — Things3 answers Apple Events one at a time, and a
 * failing id (already trashed, renamed, gone) must not abort the rest of the batch.
 */
export async function runBatch<A extends { id?: string; ids?: string[] }>(
  ids: string[],
  args: A,
  op: (one: A) => Promise<ActionResult>,
  verb: string,
): Promise<ActionResult> {
  const results: BatchItemResult[] = [];

  for (const id of ids) {
    // `name` / `todo_name` are cleared with `ids`: the id is the target now, and a
    // leftover name would otherwise end up in the message for the wrong todo.
    const one = { ...args, id, ids: undefined, name: undefined, todo_name: undefined } as A;
    try {
      const result = await op(one);
      results.push({ id, ok: true, message: result.message });
    } catch (error) {
      results.push({ id, ok: false, message: errorMessage(error) });
    }
  }

  const okIds = results.filter((r) => r.ok).map((r) => r.id);
  const failed = results.length - okIds.length;
  const noun = results.length === 1 ? 'todo' : 'todos';
  const message =
    failed === 0
      ? `${verb} ${okIds.length} ${noun}`
      : `${verb} ${okIds.length} of ${results.length} ${noun} (${failed} failed)`;

  return { message, ids: okIds, results };
}
