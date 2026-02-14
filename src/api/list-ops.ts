import { parseSimpleList } from '../tools/parsers.js';
import type { ListAreasResult, ListTagsResult } from '../types.js';
import { execute, tellThings } from '../utils/applescript.js';

export async function listTags(): Promise<ListTagsResult> {
  const script = tellThings('return name of tags as string');
  const output = await execute(script);
  return { tags: parseSimpleList(output) };
}

export async function listAreas(): Promise<ListAreasResult> {
  const script = tellThings('return name of areas as string');
  const output = await execute(script);
  return { areas: parseSimpleList(output) };
}
