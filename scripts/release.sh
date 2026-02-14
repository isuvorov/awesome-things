#!/bin/bash
set -euo pipefail

BUMP=${1:-patch}
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RELEASE_DIR="$ROOT_DIR/.release"

cd "$ROOT_DIR"

echo "==> Fix"
bun run fix

echo "==> Test"
bun run test

echo "==> Bump version ($BUMP)"
OLD_VERSION=$(node -p "require('./package.json').version")
NEW_VERSION=$(node -e "
  const [major, minor, patch] = '$OLD_VERSION'.split('.').map(Number);
  const bump = '$BUMP';
  if (bump === 'major') console.log((major+1) + '.0.0');
  else if (bump === 'minor') console.log(major + '.' + (minor+1) + '.0');
  else if (bump === 'patch') console.log(major + '.' + minor + '.' + (patch+1));
  else { console.error('Unknown bump type: ' + bump); process.exit(1); }
")

node -e "
  const fs = require('fs');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  pkg.version = '$NEW_VERSION';
  fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"
echo "    $OLD_VERSION -> $NEW_VERSION"

echo "==> Build"
bun run build

echo "==> Pack to .release/"
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

cp package.json "$RELEASE_DIR/"
cp README.md "$RELEASE_DIR/"
[ -f LICENSE ] && cp LICENSE "$RELEASE_DIR/"
cp -r lib "$RELEASE_DIR/lib"

echo ""
echo "Release v$NEW_VERSION ready in .release/"
echo ""
echo "To publish:"
echo "  cd .release && npm publish"
echo ""
echo "To preview contents:"
echo "  ls -la .release/"
