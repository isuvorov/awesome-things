import { buildDateVar, execute, quoteString, tellThings } from '../utils/applescript.js';

/**
 * Things3 has two independent dates and they mean different things:
 *   "When"     — the day a todo shows up in your lists (`schedule ... for`)
 *   "Deadline" — the day it is due, shown in red (`due date`)
 * Setting a deadline when the user asked for "on Saturday" is wrong, so `when`
 * is its own parameter everywhere `due_date` is accepted.
 */
export const WHEN_ALIASES = ['today', 'tomorrow', 'evening', 'anytime', 'someday'] as const;
export type WhenAlias = (typeof WHEN_ALIASES)[number];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isWhenAlias(value: string): value is WhenAlias {
  return (WHEN_ALIASES as readonly string[]).includes(value);
}

/** Human description for the action result — `when: "2026-09-12"` → `for 2026-09-12`. */
export function describeWhen(when: string): string {
  if (when === 'none') return 'cleared';
  return isWhenAlias(when) ? `for ${when}` : `for ${when}`;
}

/**
 * Evening is the one value AppleScript cannot express: Things3 exposes it only
 * through its URL scheme, which needs the token from Things → Settings → General.
 */
async function scheduleEvening(ref: string, todoId: string | undefined): Promise<void> {
  const urlToken = process.env.AWESOME_THINGS_URL_TOKEN;
  if (!urlToken) {
    throw new Error(
      'AWESOME_THINGS_URL_TOKEN is required for evening. Find it in Things → Settings → General.',
    );
  }
  const id = todoId || (await execute(tellThings(`return id of ${ref}`)));
  await execute(tellThings(`move ${ref} to list "Today"`));
  const url = `things:///update?auth-token=${encodeURIComponent(urlToken)}&id=${encodeURIComponent(id)}&when=evening`;
  await execute(`open location "${url}"`);
}

/**
 * Sets the "When" of an existing todo. `none` clears it, which in Things3 means
 * the todo falls back to Anytime.
 */
export async function applyWhen(ref: string, todoId: string | undefined, when: string) {
  if (when === 'evening') return scheduleEvening(ref, todoId);

  if (when === 'none' || when === 'anytime') {
    await execute(tellThings(`move ${ref} to list "Anytime"`));
    return;
  }

  if (when === 'someday') {
    await execute(tellThings(`move ${ref} to list "Someday"`));
    return;
  }

  if (when === 'today') {
    await execute(tellThings(`schedule ${ref} for (current date)`));
    return;
  }

  if (when === 'tomorrow') {
    await execute(tellThings(`schedule ${ref} for ((current date) + 1 * days)`));
    return;
  }

  if (!ISO_DATE.test(when)) {
    throw new Error(
      `Invalid when: ${quoteString(when)}. Use YYYY-MM-DD or one of: ${WHEN_ALIASES.join(', ')}, none`,
    );
  }

  await execute(tellThings(`${buildDateVar(when, 'whenD')}\nschedule ${ref} for whenD`));
}
