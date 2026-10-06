// Regenerates config.schema.json from the zod schema — run after changing src/settings/schema.ts.
import { configJsonSchema } from '../src/settings/schema.js';

await Bun.write(
  new URL('../config.schema.json', import.meta.url),
  `${JSON.stringify(configJsonSchema(), null, 2)}\n`,
);
