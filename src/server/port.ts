import { appName } from '../config.js';

export const APP_ID = appName;
export const MAX_PORT_ATTEMPTS = 10;

export async function probePort(port: number): Promise<'ours' | 'other' | 'free'> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 1000);
    const res = await fetch(`http://localhost:${port}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json().catch(() => null);
    if (data?.app === APP_ID) return 'ours';
    return 'other';
  } catch {
    return 'free';
  }
}
