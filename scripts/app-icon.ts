// Regenerates assets/AppIcon.icns from docs/logo.png — the icon of the awesome-things.app launcher.
// The logo carries "Awesome Things" in large type; at the 32px of System Settings that is noise,
// so the icon is the tray with the star only.
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const logo = join(root, 'docs', 'logo.png');
const out = join(root, 'assets', 'AppIcon.icns');
const work = mkdtempSync(join(root, '.tmp-icon-'));

function sips(args: string[]) {
  const result = spawnSync('sips', args, { encoding: 'utf-8' });
  if (result.status !== 0) throw new Error(`sips ${args.join(' ')}: ${result.stderr}`);
}

try {
  const crop = join(work, 'crop.png');
  // [offsetY offsetX] of the 660×660 square around the tray in the 1024×1024 logo.
  sips(['-c', '660', '660', '--cropOffset', '60', '182', logo, '--out', crop]);

  const iconset = join(work, 'AppIcon.iconset');
  mkdirSync(iconset);
  // Up to 256@2x: System Settings and Finder lists never need more, and 1024px doubles the file.
  for (const size of [16, 32, 128, 256]) {
    sips(['-z', `${size}`, `${size}`, crop, '--out', join(iconset, `icon_${size}x${size}.png`)]);
    sips(['-z', `${size * 2}`, `${size * 2}`, crop, '--out', join(iconset, `icon_${size}x${size}@2x.png`)]);
  }

  mkdirSync(join(root, 'assets'), { recursive: true });
  const icns = spawnSync('iconutil', ['-c', 'icns', iconset, '-o', out], { encoding: 'utf-8' });
  if (icns.status !== 0) throw new Error(`iconutil: ${icns.stderr}`);
  console.log(`wrote ${out}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
