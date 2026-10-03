#!/usr/bin/env bash
# Build and publish dist/ to the gh-pages branch (GitHub Pages serves it).
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
npm run build
D=$(mktemp -d)
cp -r dist/. "$D" && touch "$D/.nojekyll"
git -C "$D" init -q -b gh-pages
git -C "$D" add -A
git -C "$D" commit -qm "Deploy $(git rev-parse --short HEAD)"
git -C "$D" push -f "$(git remote get-url origin)" gh-pages
echo "Deployed → https://nitheesh-me.github.io/no-peeking/"
