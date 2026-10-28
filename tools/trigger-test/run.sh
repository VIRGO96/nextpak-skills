#!/usr/bin/env bash
# Trigger test: does each prompt load the expected skill?
#
# For every fixture app in fixtures/ (its .stack file names the stack), builds a fresh copy and
# installs the skills with tools/install.sh: .claude/skills/, AGENTS.md from the template (Team
# skills table + Unclear requests rule), CLAUDE.md = @AGENTS.md. Then runs each prompt headless
# in Claude Code and records which skills
# the agent loaded (Skill tool calls or reads of a SKILL.md).
#
# Usage:   bash tools/trigger-test/run.sh [prompts.tsv] [out-dir]
# Env:     PARALLEL (default 4), MODEL (default sonnet), MAX_TURNS (default 3)
# Needs:   the `claude` CLI, logged in. Each prompt is one short headless session (costs tokens).
# Output:  PASS/FAIL per prompt and "TOTAL x/y". Exit code 1 if any prompt fails.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
PROMPTS="$(cd "$(dirname "${1:-$HERE/prompts.tsv}")" && pwd)/$(basename "${1:-$HERE/prompts.tsv}")"
OUT="${2:-$HERE/out/$(date +%Y%m%d-%H%M%S)}"
PARALLEL="${PARALLEL:-4}"
export MODEL="${MODEL:-sonnet}" MAX_TURNS="${MAX_TURNS:-3}"
WORK="$OUT/work"

mkdir -p "$OUT" "$WORK"

# Build one fixture copy per app with the real installer, so the test covers what developers get:
# skills in .claude/skills/, AGENTS.md from the template, CLAUDE.md = @AGENTS.md.
for fixture in "$HERE"/fixtures/*/; do
  name="$(basename "$fixture")"
  dest="$WORK/$name"
  rm -rf "${dest:?}"
  cp -r "$fixture" "$dest"
  bash "$REPO/tools/install.sh" "$dest" --stack "$(tr -d '[:space:]' < "$fixture/.stack")" --tool claude > /dev/null
done

run_one() {
  local id="$1" dir="$2" prompt="$3"
  (cd "$WORK/$dir" && timeout 300 claude -p "$prompt" --output-format stream-json --verbose \
    --max-turns "$MAX_TURNS" --model "$MODEL" --setting-sources project > "$OUT/$id.jsonl" 2>/dev/null) || true
}
export -f run_one
export WORK OUT

tail -n +2 "$PROMPTS" | while IFS=$'\t' read -r id dir expected prompt; do
  printf '%s\0%s\0%s\0' "$id" "$dir" "$prompt"
done | xargs -0 -n 3 -P "$PARALLEL" bash -c 'run_one "$0" "$1" "$2"'

node "$HERE/report.mjs" "$PROMPTS" "$OUT" | tee "$OUT/report.txt"
grep -q '^FAIL' "$OUT/report.txt" && exit 1 || exit 0
