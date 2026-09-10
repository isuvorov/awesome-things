export function resolveDomain(domain?: string): string | undefined {
  return domain || process.env.AWESOME_THINGS_DOMAIN || undefined;
}

export type TunnelProvider = 'localtunnel' | 'ngrok' | 'frp';

const TUNNEL_PROVIDERS: TunnelProvider[] = ['localtunnel', 'ngrok', 'frp'];

/**
 * `AWESOME_THINGS_TUNNEL` used to be read only by the CLI, so `bun run server`
 * silently started without a tunnel. Both entry points resolve it here now.
 * `true`/`1`/`yes` mean "any tunnel" and land on the default provider.
 */
export function resolveTunnelProvider(value?: string): TunnelProvider | undefined {
  const raw = (value ?? process.env.AWESOME_THINGS_TUNNEL ?? '').trim().toLowerCase();
  if (!raw || raw === 'false' || raw === '0' || raw === 'none') return undefined;
  if (raw === 'true' || raw === '1' || raw === 'yes') return 'localtunnel';
  return TUNNEL_PROVIDERS.find((provider) => provider === raw);
}

export async function openTunnel(
  port: number,
  provider: TunnelProvider,
  ngrokToken?: string,
  domain?: string,
): Promise<string> {
  if (provider === 'ngrok') {
    const ngrok = await import('@ngrok/ngrok');
    const listener = await ngrok.forward({
      addr: port,
      authtoken: ngrokToken || process.env.NGROK_AUTHTOKEN,
      ...(domain ? { domain } : {}),
    });
    const url = listener.url();
    if (!url) throw new Error('ngrok did not return a URL');
    return url;
  }

  if (provider === 'frp') {
    return openFrpTunnel(port, domain);
  }

  const localtunnel = (await import('localtunnel')).default;
  const subdomain = domain ? domain.replace(/\.loca\.lt$/i, '').split('.')[0] : undefined;
  const tunnel = await localtunnel({ port, subdomain });
  return tunnel.url;
}

async function openFrpTunnel(port: number, domain?: string): Promise<string> {
  const { spawn } = await import('node:child_process');

  const env = (key: string) =>
    process.env[`AWESOME_THINGS_FRP_${key}`] || process.env[`FRP_${key}`];

  const serverAddr = env('SERVER_ADDR');
  if (!serverAddr)
    throw new Error(
      'AWESOME_THINGS_FRP_SERVER_ADDR (or FRP_SERVER_ADDR) env is required for frp tunnel',
    );

  const serverPort = env('SERVER_PORT') || '7000';
  const token = env('TOKEN') || '';
  const protocol = env('PROTOCOL') || 'https';
  const remotePort = env('REMOTE_PORT');

  // domain can be full (ismcp.axxx.pro) → -d, or just subdomain (ismcp) → --sd
  const isFullDomain = domain ? domain.includes('.') : false;
  const subdomain = !domain || isFullDomain ? env('SUBDOMAIN') : domain;
  const fallbackUrl = domain && isFullDomain ? `${protocol}://${domain}` : undefined;

  const proxyName = env('PROXY_NAME') || 'things';
  const args = ['http', '-s', serverAddr, '-P', serverPort, '-l', String(port), '-n', proxyName];
  if (token) args.push('-t', token);
  if (domain && isFullDomain) args.push('-d', domain);
  else if (subdomain) args.push('--sd', subdomain);
  if (remotePort) args.push('--remote-port', remotePort);

  return new Promise<string>((resolve, reject) => {
    // console.log('args', args);
    const frpc = spawn('frpc', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let output = '';
    let resolved = false;

    const handleData = (data: Buffer) => {
      const text = data.toString();
      output += text;
      const match = text.match(/https?:\/\/[^\s]+/);
      if (match && !resolved) {
        resolved = true;
        resolve(match[0]);
      }
    };

    frpc.stdout.on('data', handleData);
    frpc.stderr.on('data', handleData);

    frpc.on('error', (err) => {
      if (!resolved) {
        resolved = true;
        reject(new Error(`Failed to start frpc: ${err.message}. Is frpc installed?`));
      }
    });

    frpc.on('exit', (code) => {
      if (!resolved) {
        resolved = true;
        // Strip ANSI color codes for cleaner error messages
        // biome-ignore lint/suspicious/noControlCharactersInRegex: need to strip ANSI escape sequences
        const clean = output.replace(/\x1b\[[0-9;]*m/g, '').trim();
        reject(new Error(`frpc exited with code ${code}: ${clean}`));
      }
    });

    // Timeout after 15s — construct URL from domain or subdomain+serverAddr
    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const url =
          fallbackUrl || (subdomain ? `${protocol}://${subdomain}.${serverAddr}` : undefined);
        if (url) {
          resolve(url);
        } else {
          reject(new Error('frpc timed out waiting for tunnel URL'));
        }
      }
    }, 15_000);
  });
}
