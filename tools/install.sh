#!/usr/bin/env bash
# Older entry point, kept so existing commands still work. It runs the setup CLI without questions:
#
#   bash tools/install.sh <project-dir> [--stack node|fastapi|react ...] [--mcp core,frontend,...]
#                         [--tool claude|agents|antigravity|codex|all] [--lead <github-user>]
#                         [--no-guardrails] [--dry-run]
#
# Same as: node tools/cli.mjs init <project-dir> --yes [options]. Guardrails are on by default now
# (--guardrails is still accepted). The usual way is from the project folder, with no clone:
#   npx github:VIRGO96/nextpak-skills init
# See README.md "Set up a project" and: node tools/cli.mjs help
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
[ $# -gt 0 ] || { sed -n '2,11p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }
exec node "$REPO/tools/cli.mjs" init "$@" --yes
