import { z } from 'zod';

const port = z.number().int().min(1).max(65535);

/**
 * `~/.config/awesome-things/config.json`. Every key is the JSON face of an environment
 * variable the code already reads, so `toEnvironment()` is the whole integration — nothing
 * downstream needs to know a file exists.
 */
export const userConfigSchema = z
  .object({
    $schema: z.string().optional().describe('JSON Schema for editor autocompletion'),
    port: port.optional().describe('HTTP port (AWESOME_THINGS_PORT). Default 32123'),
    token: z
      .string()
      .min(1)
      .optional()
      .describe('Bearer token for the HTTP API and MCP (AWESOME_THINGS_TOKEN)'),
    urlToken: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Things URL-scheme token for evening, reminders and checklists (AWESOME_THINGS_URL_TOKEN)',
      ),
    tunnel: z
      .union([z.enum(['frp', 'ngrok', 'localtunnel']), z.literal(false)])
      .optional()
      .describe('Public tunnel to open, or false for none (AWESOME_THINGS_TUNNEL)'),
    domain: z
      .string()
      .min(1)
      .optional()
      .describe('Tunnel domain or subdomain (AWESOME_THINGS_DOMAIN)'),
    signIdentity: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Certificate for the daemon launcher: SHA-1 or part of its name, "-" for ad-hoc. Default: Developer ID, then Apple Development (AWESOME_THINGS_SIGN_IDENTITY)',
      ),
    frp: z
      .object({
        serverAddr: z.string().min(1).optional().describe('frps host (FRP_SERVER_ADDR)'),
        serverPort: port.optional().describe('frps port (FRP_SERVER_PORT). Default 7000'),
        token: z.string().min(1).optional().describe('frps auth token (FRP_TOKEN)'),
        protocol: z
          .enum(['http', 'https'])
          .optional()
          .describe('Scheme of the public URL (FRP_PROTOCOL). Default https'),
        remotePort: port.optional().describe('Remote port on frps (FRP_REMOTE_PORT)'),
        subdomain: z.string().min(1).optional().describe('frp subdomain (FRP_SUBDOMAIN)'),
        proxyName: z
          .string()
          .min(1)
          .optional()
          .describe('Proxy name in frpc (FRP_PROXY_NAME). Default things'),
      })
      .strict()
      .optional()
      .describe('frp tunnel settings'),
    ngrok: z
      .object({
        authtoken: z.string().min(1).optional().describe('ngrok auth token (NGROK_AUTHTOKEN)'),
      })
      .strict()
      .optional()
      .describe('ngrok tunnel settings'),
  })
  .strict();

export type UserConfig = z.infer<typeof userConfigSchema>;

/**
 * JSON has no comments, so a key starting with `_` (or `//`, the npm convention) is one:
 * `"_frp": {...}` switches a section off, `"_note": "..."` explains a value. Any other unknown
 * key is still a typo and still an error — the schema stays strict.
 */
export const COMMENT_KEY = /^(_|\/\/)/;

export function stripCommentKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripCommentKeys);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !COMMENT_KEY.test(key))
      .map(([key, inner]) => [key, stripCommentKeys(inner)]),
  );
}

/** Let editors accept the comment keys too, wherever the schema forbids unknown properties. */
function allowCommentKeys(node: unknown): void {
  if (!node || typeof node !== 'object') return;
  const schema = node as Record<string, unknown>;
  if (schema.additionalProperties === false) {
    schema.patternProperties = { [COMMENT_KEY.source]: {} };
  }
  for (const inner of Object.values(schema)) allowCommentKeys(inner);
}

const FRP_KEYS = {
  serverAddr: 'SERVER_ADDR',
  serverPort: 'SERVER_PORT',
  token: 'TOKEN',
  protocol: 'PROTOCOL',
  remotePort: 'REMOTE_PORT',
  subdomain: 'SUBDOMAIN',
  proxyName: 'PROXY_NAME',
} as const;

/**
 * One environment variable per setting. Each entry lists every name the code accepts for it:
 * a setting already present under any of them in the real environment beats the file.
 */
export function toEnvironment(config: UserConfig): Array<{ names: string[]; value: string }> {
  const entries: Array<{ names: string[]; value: string }> = [];
  const add = (names: string[], value: string | number | boolean | undefined) => {
    if (value === undefined) return;
    entries.push({ names, value: String(value) });
  };

  add(['AWESOME_THINGS_PORT'], config.port);
  add(['AWESOME_THINGS_TOKEN'], config.token);
  add(['AWESOME_THINGS_URL_TOKEN'], config.urlToken);
  add(['AWESOME_THINGS_TUNNEL'], config.tunnel);
  add(['AWESOME_THINGS_DOMAIN'], config.domain);
  add(['AWESOME_THINGS_SIGN_IDENTITY'], config.signIdentity);
  for (const [key, suffix] of Object.entries(FRP_KEYS)) {
    add(
      [`AWESOME_THINGS_FRP_${suffix}`, `FRP_${suffix}`],
      config.frp?.[key as keyof typeof FRP_KEYS],
    );
  }
  add(['NGROK_AUTHTOKEN'], config.ngrok?.authtoken);
  return entries;
}

/** What `config.schema.json` contains — generated, never hand-edited. */
export function configJsonSchema(): Record<string, unknown> {
  const schema = z.toJSONSchema(userConfigSchema, { io: 'input' });
  allowCommentKeys(schema);
  return {
    ...schema,
    $id: 'https://unpkg.com/awesome-things/config.schema.json',
    title: 'awesome-things config',
  };
}
