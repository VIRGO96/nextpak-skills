#!/usr/bin/env bash
# Install the team skills into a project.
#
# Usage:  bash tools/install.sh <project-dir> --stack <node|fastapi|react> [--stack ...] [--mcp core,frontend,...]
#                                [--guardrails] [--lead <github-user>] [--tool claude|agents|all] [--dry-run]
#
# Copies every lifecycle skill, the third-party skills and the chosen stack skills, flat, into
#   .claude/skills/<skill>/   (Claude Code)          --tool claude
#   .agents/skills/<skill>/   (Antigravity, Codex)   --tool agents
# Both by default. Re-running updates the team skills and leaves any other skill alone.
# Repo-only skills (skills/repo/) are never installed.
#
# AGENTS.md: created from the template if missing (with the "Team skills" table for your stack and
# the "Unclear requests" and "Production and data safety" rules). If it exists, it is not changed: the script prints the sections to
# add when they are missing. CLAUDE.md: created as "@AGENTS.md" if missing.
#
# --mcp also installs MCP servers (groups or ids from mcp/catalog.json; see: node tools/mcp.mjs list)
# through tools/mcp.mjs: .mcp.json, .agents/mcp_config.json, .codex/config.toml.
#
# --guardrails also installs the team guardrails through tools/guardrails.mjs: the agent guard hook,
# permissions, pre-commit secret check, CI secret scan and PR template (see guardrails/README.md).
# --lead adds a CODEOWNERS entry so agent config changes need that person's review.
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
SKILLS="$REPO/skills"
TEMPLATE="$SKILLS/lifecycle/docs-keeper/references/agents-md-template.md"

usage() { sed -n '2,23p' "$0" | sed 's/^# \{0,1\}//'; exit 1; }

PROJECT="" ; STACKS=() ; TOOL=all ; DRY=0 ; MCP="" ; GUARD=0 ; LEAD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --stack) STACKS+=("${2:-}"); shift 2 ;;
    --tool) TOOL="${2:-}"; shift 2 ;;
    --mcp) MCP="${MCP:+$MCP,}${2:-}"; shift 2 ;;
    --guardrails) GUARD=1; shift ;;
    --lead) LEAD="${2:-}"; shift 2 ;;
    --dry-run) DRY=1; shift ;;
    -h|--help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage ;;
    *) PROJECT="$1"; shift ;;
  esac
done
[ -n "$PROJECT" ] && [ -d "$PROJECT" ] || { echo "Project directory not found: ${PROJECT:-<none>}" >&2; usage; }
[ ${#STACKS[@]} -gt 0 ] || { echo "At least one --stack is required (node, fastapi, react)." >&2; usage; }

STACK_SKILLS=()
for s in "${STACKS[@]}"; do
  case "$s" in
    node|express) STACK_SKILLS+=(node-express-standards) ;;
    fastapi|python) STACK_SKILLS+=(fastapi-standards) ;;
    react|next|nextjs|vite) STACK_SKILLS+=(react-next-standards) ;;
    *) echo "Unknown stack: $s (use node, fastapi or react)" >&2; exit 1 ;;
  esac
done

case "$TOOL" in
  claude) TARGETS=(.claude/skills) ;;
  agents) TARGETS=(.agents/skills) ;;
  all) TARGETS=(.claude/skills .agents/skills) ;;
  *) echo "Unknown --tool: $TOOL (use claude, agents or all)" >&2; exit 1 ;;
esac

# Skill folders to install: lifecycle + third-party + chosen stack skills.
SOURCES=()
for d in "$SKILLS"/lifecycle/*/ "$SKILLS"/third-party/*/*/; do
  [ -f "$d/SKILL.md" ] && SOURCES+=("${d%/}")
done
for s in "${STACK_SKILLS[@]}"; do SOURCES+=("$SKILLS/stack/$s"); done

run() { if [ "$DRY" = 1 ]; then echo "  would: $*"; else "$@"; fi; }

for target in "${TARGETS[@]}"; do
  echo "Installing ${#SOURCES[@]} skills into $PROJECT/$target"
  run mkdir -p "$PROJECT/$target"
  for src in "${SOURCES[@]}"; do
    name="$(basename "$src")"
    run rm -rf "${PROJECT:?}/$target/${name:?}"
    run cp -r "$src" "$PROJECT/$target/$name"
  done
done

# The template's AGENTS.md block, from "## Team skills" up to "## Decisions and handoffs",
# with the stack placeholder replaced by this project's stack skills.
stack_list="$(printf '`%s` and ' "${STACK_SKILLS[@]}")"; stack_list="${stack_list% and }"
skill_sections() {
  awk '/^## Team skills/{f=1} /^## Decisions and handoffs/{f=0} f' "$TEMPLATE" \
    | sed "s#\`<node-express-standards / fastapi-standards / react-next-standards>\`#$stack_list#"
}

AGENTS="$PROJECT/AGENTS.md"
if [ ! -f "$AGENTS" ]; then
  echo "Creating AGENTS.md (fill in the TODO lines, or ask the agent: \"is this project AI-ready?\")"
  if [ "$DRY" = 0 ]; then
    {
      echo "# $(basename "$(cd "$PROJECT" && pwd)")"
      echo
      echo "TODO(question): one or two sentences on what this product does and who uses it."
      echo
      skill_sections
    } > "$AGENTS"
  fi
else
  missing=0
  grep -q '^## Team skills' "$AGENTS" || missing=1
  grep -q '^## Unclear requests' "$AGENTS" || missing=1
  grep -q '^## Production and data safety' "$AGENTS" || missing=1
  if [ "$missing" = 1 ]; then
    echo
    echo "AGENTS.md exists but is missing the required sections. Add this block to it:"
    echo "----------------------------------------------------------------------"
    skill_sections
    echo "----------------------------------------------------------------------"
  else
    echo "AGENTS.md already has the Team skills, Unclear requests and Production safety sections (not changed)."
    echo "Check its stack row lists: $stack_list"
  fi
fi

if [ ! -f "$PROJECT/CLAUDE.md" ]; then
  echo "Creating CLAUDE.md (@AGENTS.md)"
  [ "$DRY" = 1 ] || echo "@AGENTS.md" > "$PROJECT/CLAUDE.md"
elif ! grep -q '@AGENTS.md' "$PROJECT/CLAUDE.md"; then
  echo "CLAUDE.md exists but doesn't import AGENTS.md: add the line @AGENTS.md at the top."
fi

if [ -n "$MCP" ]; then
  echo
  dry_flag=""; [ "$DRY" = 1 ] && dry_flag="--dry-run"
  case "$TOOL" in
    claude) node "$REPO/tools/mcp.mjs" install "$PROJECT" --mcp "$MCP" --tool claude $dry_flag ;;
    agents) node "$REPO/tools/mcp.mjs" install "$PROJECT" --mcp "$MCP" --tool agents $dry_flag
            node "$REPO/tools/mcp.mjs" install "$PROJECT" --mcp "$MCP" --tool codex $dry_flag ;;
    all)    node "$REPO/tools/mcp.mjs" install "$PROJECT" --mcp "$MCP" --tool all $dry_flag ;;
  esac
fi

if [ "$GUARD" = 1 ]; then
  echo
  gflags=(); [ "$DRY" = 1 ] && gflags+=(--dry-run); [ -n "$LEAD" ] && gflags+=(--lead "$LEAD")
  case "$TOOL" in
    claude) node "$REPO/tools/guardrails.mjs" install "$PROJECT" --tool claude "${gflags[@]}" ;;
    agents) node "$REPO/tools/guardrails.mjs" install "$PROJECT" --tool agents,codex "${gflags[@]}" ;;
    all)    node "$REPO/tools/guardrails.mjs" install "$PROJECT" --tool all "${gflags[@]}" ;;
  esac
fi

echo
echo "Done. Next: ask the agent \"is this project AI-ready?\""
