import { parseSimpleList } from '../tools/parsers.js';
import type { ListAreasResult, ListTagsResult } from '../types.js';
import { execute, tellThings } from '../utils/applescript.js';

/**
 * Coercing a list to string uses `AppleScript's text item delimiters`, which are
 * empty by default — that is what glued every area name into one blob. Tab, not
 * comma: tag and area names contain commas.
 */
function joinedNames(collection: string): string {
  return tellThings(`
set tid to AppleScript's text item delimiters
set AppleScript's text item delimiters to tab
set out to name of ${collection} as string
set AppleScript's text item delimiters to tid
return out`);
}

export async function listTags(): Promise<ListTagsResult> {
  const output = await execute(joinedNames('tags'));
  return { tags: parseSimpleList(output) };
}

export async function listAreas(): Promise<ListAreasResult> {
  const output = await execute(joinedNames('areas'));
  return { areas: parseSimpleList(output) };
}
