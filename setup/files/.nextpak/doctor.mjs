#!/usr/bin/env node
// NextPak AI setup check for this project (installed by nextpak-skills; don't edit here, it is
// replaced on every update). Every developer runs it once after cloning, and again when unsure:
//
//   npm run ai:setup              (or: node .nextpak/doctor.mjs)
//
// It turns on the team git hooks for this clone (the only change it makes), then checks Node,
// gitleaks, the skills, the agent guard and the MCP tokens, and prints what is left to do in your
// AI tool. It never prints a secret: for tokens it only says whether they are set.
//
//   --hooks-only   only turn on the git hooks, silently (used by "prepare" on npm install)
//   --root <dir>   check another project (default: the folder above .nextpak/)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const rootArg = args.indexOf('--root');
const ROOT = path.resolve(rootArg >= 0 ? args[rootArg + 1] : path.join(path.dirname(fileURLToPath(import.meta.url)), '..'));
const HOOKS_PATH = '.guardrails/git-hooks';
const MIN_NODE = [20, 11];

const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });
const has = (cmd) => spawnSync(`${cmd} version`, { shell: true, stdio: 'ignore' }).status === 0;
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

const config = readJson(path.join(ROOT, '.nextpak', 'config.json'), null);
const isGit = git('rev-parse', '--is-inside-work-tree').stdout?.trim() === 'true';

// Turn on the team git hooks unless another hook manager (husky, lefthook) owns core.hooksPath.
function turnOnHooks() {
  if (!isGit || !exists(HOOKS_PATH)) return { state: 'skip' };
  const current = git('config', '--get', 'core.hooksPath').stdout.trim();
  if (current === HOOKS_PATH) return { state: 'ok' };
  if (current) return { state: 'other', current };
  git('config', 'core.hooksPath', HOOKS_PATH);
  return { state: 'fixed' };
}

if (args.includes('--hooks-only')) {
  if (!process.env.CI) turnOnHooks();
  process.exit(0);
}

const results = [];
const add = (level, text, fix) => results.push({ level, text, fix });

// 1. Node
const [maj, min] = process.versions.node.split('.').map(Number);
if (maj > MIN_NODE[0] || (maj === MIN_NODE[0] && min >= MIN_NODE[1])) add('ok', `Node ${process.versions.node}`);
else add('fail', `Node ${process.versions.node} is too old`, `Install Node ${MIN_NODE.join('.')} or newer (LTS) from https://nodejs.org`);

// 2. Setup present
if (!config) add('fail', 'This project is not set up yet (.nextpak/config.json missing)', 'Ask the lead to run: npx github:VIRGO96/nextpak-skills init');
if (!isGit) add('fail', 'Not a git repository', 'Clone the project with git, or run git init');

// 3. Git hooks and gitleaks
if (config?.guardrails) {
  const hooks = turnOnHooks();
  if (hooks.state === 'ok') add('ok', 'Team git hooks are on (secret check before every commit)');
  else if (hooks.state === 'fixed') add('fixed', 'Turned on the team git hooks for this clone');
  else if (hooks.state === 'other') {
    add('fail', `Git hooks point to ${hooks.current}, so the team secret check doesn't run`,
      `Call .guardrails/git-hooks/pre-commit from your ${hooks.current}/pre-commit, or ask the lead`);
  } else if (isGit) add('fail', '.guardrails/git-hooks is missing', 'Pull the latest main, or ask the lead to run update');

  if (has('gitleaks')) add('ok', 'gitleaks installed (full secret scan)');
  else {
    const cmd = { win32: 'winget install gitleaks', darwin: 'brew install gitleaks' }[process.platform] ?? 'see https://github.com/gitleaks/gitleaks#installing';
    add('warn', 'gitleaks not installed: only the basic secret check runs before a commit', cmd);
  }

  // 4. Agent guard: feed it a call it must block, in both hook formats.
  const guard = path.join(ROOT, '.guardrails', 'agent-guard.mjs');
  if (fs.existsSync(guard)) {
    const run = (input) => spawnSync(process.execPath, [guard], { input: JSON.stringify(input), cwd: os.tmpdir(), encoding: 'utf8' }).stdout;
    let blocked = false;
    try {
      blocked = JSON.parse(run({ tool_name: 'Bash', tool_input: { command: 'printenv' } })).hookSpecificOutput?.permissionDecision === 'deny'
        && JSON.parse(run({ toolCall: { name: 'run_command', args: { CommandLine: 'printenv' } } })).decision === 'deny';
    } catch { blocked = false; }
    if (blocked) add('ok', 'Agent guard works (blocked a test "printenv")');
    else add('fail', 'Agent guard did not block a test command', 'Send this output to the lead');
  } else add('fail', '.guardrails/agent-guard.mjs is missing', 'Pull the latest main, or ask the lead to run update');
}

// 5. Skills and instructions
const tools = config?.tools ?? [];
const skillDirs = [...new Set(tools.map((t) => (t === 'claude' ? '.claude/skills' : '.agents/skills')))];
for (const dir of skillDirs) {
  const n = exists(dir) ? fs.readdirSync(path.join(ROOT, dir)).filter((d) => exists(`${dir}/${d}/SKILL.md`)).length : 0;
  if (n) add('ok', `${n} team skills in ${dir}/`);
  else add('fail', `No skills in ${dir}/`, 'Pull the latest main, or ask the lead to run update');
}
if (exists('AGENTS.md')) {
  const todos = (fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8').match(/TODO\(question\)/g) ?? []).length;
  if (todos) add('warn', `AGENTS.md has ${todos} TODO line(s)`, 'Lead: ask the agent "is this project AI-ready?" and fill them in');
  else add('ok', 'AGENTS.md is filled in');
} else if (config) add('fail', 'AGENTS.md is missing', 'Ask the lead to run update');

// 6. MCP tokens (names only, never values)
for (const v of config?.mcp?.env ?? []) {
  if (process.env[v]) add('ok', `${v} is set`);
  else add('warn', `${v} is not set (an MCP server needs it)`, `Set it in your user environment variables, then restart your AI tool. Never put it in a file in the project.`);
}
const globalServers = config?.mcp?.antigravityGlobal ?? [];
if (tools.includes('antigravity') && globalServers.length) {
  const file = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
  const have = Object.keys(readJson(file, {}).mcpServers ?? {});
  const missing = globalServers.filter((s) => !have.includes(s));
  if (!missing.length) add('ok', `Antigravity global MCP config has ${globalServers.join(', ')}`);
  else {
    const snippet = JSON.stringify({ mcpServers: Object.fromEntries(missing.map((s) => [s, config.mcp.antigravitySnippet?.[s] ?? {}])) }, null, 2);
    add('warn', `Antigravity: ${missing.join(', ')} not in your global MCP config`,
      `Add this to ${file} (merge into "mcpServers" if the file exists), replace each <VAR> with your own value, then reload Antigravity. That file is on your machine only; never copy it into a project:\n${snippet.replace(/^/gm, '           ')}`);
  }
}

// Report
const mark = { ok: '[ok]  ', fixed: '[done]', warn: '[todo]', fail: '[FAIL]' };
console.log(`\nNextPak AI setup check: ${ROOT}\n`);
for (const r of results) {
  console.log(`${mark[r.level]} ${r.text}`);
  if (r.fix) console.log(`        -> ${r.fix}`);
}

const steps = {
  claude: 'Claude Code: open the project, approve the project MCP servers when asked, sign in with /mcp.',
  antigravity: 'Antigravity: open the folder and trust it, permission preset Default or Request Review (never Turbo), then Reload Window. Guide: https://github.com/VIRGO96/nextpak-skills/blob/main/guardrails/antigravity.md',
  codex: 'Codex: trust the project, run /hooks once to trust the guard hook, and codex mcp login <id> for servers with sign-in.',
};
const mine = tools.filter((t) => steps[t]);
if (mine.length) {
  console.log('\nIn your AI tool (once):');
  for (const t of mine) console.log(`  - ${steps[t]}`);
  if (config?.guardrails) console.log('  - Last check: ask the agent "run printenv". It must answer "Blocked by team guardrails".');
}

const failed = results.filter((r) => r.level === 'fail').length;
const todo = results.filter((r) => r.level === 'warn').length;
console.log(`\n${failed ? `${failed} problem(s) to fix` : 'Ready'}${todo ? `, ${todo} thing(s) to do` : ''}.`);
process.exit(failed ? 1 : 0);
