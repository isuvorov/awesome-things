import { execute, tellThings } from '../utils/applescript.js';

/**
 * Things' URL scheme — the fallback for everything its AppleScript dictionary
 * does not expose: "This Evening", reminder times, checklist items. Every write
 * through `things:///update` needs the token from Things → Settings → General.
 */
export function requireUrlToken(feature: string, hint = ''): string {
  const urlToken = process.env.AWESOME_THINGS_URL_TOKEN;
  if (!urlToken) {
    throw new Error(
      `AWESOME_THINGS_URL_TOKEN is required for ${feature}. ` +
        `Find it in Things → Settings → General.${hint ? ` ${hint}` : ''}`,
    );
  }
  return urlToken;
}

/** Resolves the id lazily — callers that just created the todo already have it. */
export async function resolveId(ref: string, todoId: string | undefined): Promise<string> {
  return todoId || (await execute(tellThings(`return id of ${ref}`)));
}

/**
 * Checklist items exist only in the URL scheme — the Things3 AppleScript
 * dictionary has no checklist class at all. Newline-separated, 100 items max;
 * an empty list clears the checklist.
 */
export async function applyChecklist(
  ref: string,
  todoId: string | undefined,
  items: string[],
): Promise<void> {
  const urlToken = requireUrlToken('checklist items');
  const id = await resolveId(ref, todoId);
  await thingsUpdate(urlToken, id, { 'checklist-items': items.join('\n') });
}

export async function thingsUpdate(
  urlToken: string,
  id: string,
  params: Record<string, string>,
): Promise<void> {
  const query = Object.entries(params)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  const url = `things:///update?auth-token=${encodeURIComponent(urlToken)}&id=${encodeURIComponent(id)}&${query}`;
  await execute(`open location "${url}"`);
}
