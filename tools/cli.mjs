#!/usr/bin/env node
// NextPak AI setup: one command to set up a project for the team's AI workflow, and to update it.
// Run it from the project folder; nothing to clone or install first (needs Node 20.11+ and git):
//
//   npx github:VIRGO96/nextpak-skills init      lead, once per project: asks a few questions, installs everything
//   npx github:VIRGO96/nextpak-skills update    lead, later: same choices, latest skills, MCP list and guardrails
//   npx github:VIRGO96/nextpak-skills doctor    anyone: check a project (developers use: npm run ai:setup)
//   npx github:VIRGO96/nextpak-skills list      stacks and MCP servers you can pick
//
// Options (init and update; without them init asks, update keeps the saved choices):
//   [project]               project folder (default: current folder)
//   --stack <s>             node, fastapi, react; repeat or comma list (init detects them from the code)
//   --tool <t>              claude, antigravity, codex or all; comma list (default: all)
//   --mcp <groups/ids>      MCP groups or server ids, comma list (see list)
//   --guardrails / --no-guardrails   team guardrails (default: on)
//   --lead <github-user>    CODEOWNERS entry: agent config changes need this person's review
//   --yes                   don't ask; use the flags, saved choices and detected stacks
//   --dry-run               show what would change, write nothing
//
// It writes skills (.claude/skills, .agents/skills), AGENTS.md and CLAUDE.md, MCP config (tools/mcp.mjs),
// guardrails (tools/guardrails.mjs), .nextpak/config.json (the choices, so update needs no flags),
// .nextpak/doctor.mjs, and "ai:setup"/"prepare" scripts in package.json.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { antigravityEntry, catalog, forTool, select, varsIn, withPlaceholders } from './mcp.mjs';

const REPO = path.resolve(import.meta.dirname, '..');
const PKG = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
const SKILLS = path.join(REPO, 'skills');
const TEMPLATE = path.join(SKILLS, 'lifecycle', 'docs-keeper', 'references', 'agents-md-template.md');
const SOURCE = 'github:VIRGO96/nextpak-skills';
const STACKS = { node: 'node-express-standards', fastapi: 'fastapi-standards', react: 'react-next-standards' };
const STACK_ALIAS = { express: 'node', python: 'fastapi', next: 'react', nextjs: 'react', vite: 'react' };
const TOOLS = ['claude', 'antigravity', 'codex'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'coverage', 'venv', '.venv', '__pycache__']);

function fail(msg) { console.error(`\n${msg}`); process.exit(1); }
const list = (v) => String(v ?? '').split(',').map((x) => x.trim().toLowerCase()).filter(Boolean);
const uniq = (a) => [...new Set(a)];

function parseArgs(argv) {
  const o = { stacks: [], mcp: [], tools: null, guardrails: null, lead: null, yes: false, dry: false, rest: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stack') o.stacks.push(...list(argv[++i]));
    else if (a === '--mcp') o.mcp.push(...list(argv[++i]));
    else if (a === '--tool') o.tools = list(argv[++i]);
    else if (a === '--guardrails') o.guardrails = true;
    else if (a === '--no-guardrails') o.guardrails = false;
    else if (a === '--lead') o.lead = String(argv[++i] ?? '').replace(/^@/, '');
    else if (a === '--yes' || a === '-y') o.yes = true;
    else if (a === '--dry-run') o.dry = true;
    else if (a === '-h' || a === '--help') o.rest.unshift('help');
    else if (a.startsWith('-')) fail(`Unknown option: ${a} (see: help)`);
    else o.rest.push(a);
  }
  return o;
}

// ---------- validation ----------

function normStacks(stacks) {
  return uniq(stacks.map((s) => STACK_ALIAS[s] ?? s)).map((s) => STACKS[s] ? s : fail(`Unknown stack: ${s} (use node, fastapi or react)`));
}

function normTools(tools) {
  const out = tools.flatMap((t) => (t === 'all' ? TOOLS : t === 'agents' ? ['antigravity', 'codex'] : [t]));
  for (const t of out) if (!TOOLS.includes(t)) fail(`Unknown tool: ${t} (use claude, antigravity, codex or all)`);
  return TOOLS.filter((t) => out.includes(t));
}

function normMcp(names) {
  for (const n of names) if (!catalog.groups[n] && !catalog.servers.some((s) => s.id === n)) fail(`Unknown MCP group or server: ${n} (see: list)`);
  return uniq(names);
}

function normLead(lead) {
  if (!lead) return '';
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/.test(lead)) fail(`Not a GitHub username: ${lead}`);
  return lead;
}

// ---------- reading the project ----------

const readJson = (file, fallback) => {
  if (!fs.existsSync(file)) return fallback;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail(`${file} is not valid JSON; fix it and run again.`); }
};
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8' });

function subdirs(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.') && !SKIP_DIRS.has(e.name))
    .map((e) => path.join(dir, e.name));
}

// Stacks from package.json and Python manifests in the root, its subfolders, and apps/* and packages/*.
function detectStacks(project) {
  const found = new Map();
  const note = (stack, dir) => found.set(stack, [...(found.get(stack) ?? []), path.relative(project, dir) || '.']);
  const dirs = uniq([project, ...subdirs(project), ...subdirs(path.join(project, 'apps')), ...subdirs(path.join(project, 'packages'))]);
  for (const dir of dirs) {
    const pkg = readJson(path.join(dir, 'package.json'), null);
    if (pkg) {
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (['express', 'fastify', 'koa', '@nestjs/core', '@hapi/hapi'].some((d) => deps[d])) note('node', dir);
      if (deps.react || deps.next) note('react', dir);
    }
    const py = ['requirements.txt', 'requirements-dev.txt', 'pyproject.toml', 'Pipfile']
      .map((f) => path.join(dir, f)).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    if (/\bfastapi\b/i.test(py)) note('fastapi', dir);
  }
  return found;
}

// ---------- questions ----------

let rl;
async function ask(question, fallback) {
  rl ??= readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
  return answer || fallback || '';
}
const yesNo = async (q, def) => /^y/i.test(await ask(`${q} (y/n)`, def ? 'y' : 'n'));

async function chooseInteractively(project, saved, o) {
  const detected = detectStacks(project);
  console.log('');
  if (detected.size) console.log(`Found in the code: ${[...detected].map(([s, d]) => `${s} (${d.join(', ')})`).join(', ')}`);
  else console.log('No stack found in the code yet (an empty project is fine).');
  const stackDefault = (o.stacks.length ? o.stacks : saved?.stacks?.length ? saved.stacks : [...detected.keys()]).join(',');
  const stacks = normStacks(list(await ask('Stacks: node, fastapi, react (comma list)', stackDefault || 'node')));

  const tools = normTools(list(await ask('AI tools the team uses: claude, antigravity, codex or all', (o.tools ?? saved?.tools ?? ['all']).join(','))));

  console.log('\nMCP groups (tools the agent can use):');
  for (const [g, desc] of Object.entries(catalog.groups)) {
    console.log(`  ${g.padEnd(9)} ${desc}: ${catalog.servers.filter((s) => s.group === g).map((s) => s.id).join(', ')}`);
  }
  const mcpDefault = o.mcp.length ? o.mcp : saved?.mcp?.selected ?? ['core', ...(stacks.includes('react') ? ['frontend'] : [])];
  const mcp = normMcp(list(await ask('MCP groups or server ids (comma list, "none" for none)', mcpDefault.join(',') || 'none')).filter((x) => x !== 'none'));

  const guardrails = await yesNo('Install the team guardrails (recommended)', o.guardrails ?? saved?.guardrails ?? true);
  const lead = guardrails ? normLead((await ask('Lead\'s GitHub username, reviews agent config changes (Enter to skip)', o.lead ?? saved?.lead ?? '')).replace(/^@/, '')) : '';
  return { stacks, tools, mcp, guardrails, lead };
}

// ---------- installing ----------

function makeOps(dry) {
  return {
    write(file, content) {
      if (dry) return console.log(`  would write ${file}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, content);
    },
    copyDir(src, dest) {
      if (dry) return;
      fs.rmSync(dest, { recursive: true, force: true });
      fs.cpSync(src, dest, { recursive: true });
    },
    remove(dest) { if (!dry) fs.rmSync(dest, { recursive: true, force: true }); },
  };
}

function skillSources(stacks) {
  const dirs = [
    ...subdirs(path.join(SKILLS, 'lifecycle')),
    ...subdirs(path.join(SKILLS, 'third-party')).flatMap(subdirs),
    ...stacks.map((s) => path.join(SKILLS, 'stack', STACKS[s])),
  ];
  return dirs.filter((d) => fs.existsSync(path.join(d, 'SKILL.md')));
}

// Copies the team skills flat into each tool's folder; removes team skills that were dropped from the
// repo since the last install. Other skills in the folder are left alone.
function installSkills(project, choice, saved, ops) {
  const sources = skillSources(choice.stacks);
  const names = sources.map((s) => path.basename(s));
  const targets = uniq(choice.tools.map((t) => (t === 'claude' ? '.claude/skills' : '.agents/skills')));
  for (const target of targets) {
    console.log(`Skills: ${names.length} into ${target}/`);
    for (const src of sources) ops.copyDir(src, path.join(project, target, path.basename(src)));
    for (const old of (saved?.skills ?? []).filter((n) => !names.includes(n))) {
      console.log(`  removed ${target}/${old} (no longer a team skill)`);
      ops.remove(path.join(project, target, old));
    }
  }
  return names;
}

// The template's block from "## Team skills" up to "## Decisions and handoffs", with this project's stack skills.
function skillSections(stacks) {
  const text = fs.readFileSync(TEMPLATE, 'utf8');
  const block = text.slice(text.indexOf('## Team skills'), text.indexOf('## Decisions and handoffs')).trimEnd();
  const stackList = stacks.map((s) => `\`${STACKS[s]}\``).join(' and ');
  return block.replace('`<node-express-standards / fastapi-standards / react-next-standards>`', stackList);
}

function installInstructions(project, choice, ops) {
  const agents = path.join(project, 'AGENTS.md');
  if (!fs.existsSync(agents)) {
    console.log('AGENTS.md: created (the lead fills in the TODO lines: ask the agent "is this project AI-ready?")');
    ops.write(agents, `# ${path.basename(project)}\n\nTODO(question): one or two sentences on what this product does and who uses it.\n\n${skillSections(choice.stacks)}\n`);
  } else {
    const text = fs.readFileSync(agents, 'utf8');
    const missing = ['## Team skills', '## Unclear requests', '## Production and data safety'].filter((h) => !text.includes(h));
    if (missing.length) {
      console.log(`AGENTS.md: kept as is, but it is missing ${missing.join(', ')}. Add this block:\n${'-'.repeat(70)}\n${skillSections(choice.stacks)}\n${'-'.repeat(70)}`);
    } else console.log(`AGENTS.md: kept as is (check its stack row lists ${choice.stacks.map((s) => STACKS[s]).join(', ')})`);
  }
  const claude = path.join(project, 'CLAUDE.md');
  if (!fs.existsSync(claude)) ops.write(claude, '@AGENTS.md\n');
  else if (!fs.readFileSync(claude, 'utf8').includes('@AGENTS.md')) console.log('CLAUDE.md: add the line @AGENTS.md at the top.');
}

function runTool(script, args) {
  console.log('');
  const r = spawnSync(process.execPath, [path.join(REPO, 'tools', script), ...args], { stdio: 'inherit' });
  if (r.status !== 0) fail(`${script} failed (see above).`);
}

// "ai:setup" for every developer; "prepare" turns the git hooks on during npm install.
function installScripts(project, choice, ops) {
  const file = path.join(project, 'package.json');
  if (!fs.existsSync(file)) return 'Developers run: node .nextpak/doctor.mjs  (no package.json in the project root)';
  const raw = fs.readFileSync(file, 'utf8');
  const pkg = readJson(file, {});
  const indent = raw.match(/^[ \t]+(?=")/m)?.[0] ?? '  ';
  pkg.scripts ??= {};
  const notes = [];
  pkg.scripts['ai:setup'] = 'node .nextpak/doctor.mjs';
  if (choice.guardrails) {
    const prepare = 'node .nextpak/doctor.mjs --hooks-only';
    if (!pkg.scripts.prepare) pkg.scripts.prepare = prepare;
    else if (!pkg.scripts.prepare.includes('.nextpak/doctor.mjs')) {
      notes.push(`package.json already has "prepare": "${pkg.scripts.prepare}". Kept it; developers turn on the git hooks with npm run ai:setup.`);
    }
  }
  ops.write(file, JSON.stringify(pkg, null, indent) + (raw.endsWith('\n') ? '\n' : ''));
  return notes.join('\n');
}

// What each developer needs for the chosen MCP servers: env var names (Claude Code, Codex), and for
// Antigravity the servers that need a token in their global config, with <VAR> placeholders only.
function mcpSummary(selected, tools) {
  const servers = selected.length ? select(selected) : [];
  const env = uniq(servers.filter((s) => tools.some((t) => t !== 'antigravity' && forTool(s, t))).flatMap((s) => varsIn(s.config)));
  const global = tools.includes('antigravity') ? servers.filter((s) => forTool(s, 'antigravity') && varsIn(s.antigravity ?? s.config).length) : [];
  return {
    selected,
    servers: servers.map((s) => s.id),
    env,
    antigravityGlobal: global.map((s) => s.id),
    antigravitySnippet: Object.fromEntries(global.map((s) => [s.id, withPlaceholders(antigravityEntry(s))])),
    requires: Object.fromEntries(servers.filter((s) => s.requires).map((s) => [s.id, s.requires])),
  };
}

function sourceCommit() {
  const r = git(REPO, 'rev-parse', '--short', 'HEAD');
  return r.status === 0 ? r.stdout.trim() : null;
}

async function setup(mode, o) {
  const project = path.resolve(o.rest[1] ?? '.');
  if (!fs.existsSync(project) || !fs.statSync(project).isDirectory()) fail(`Project folder not found: ${project}`);
  if (project === REPO) fail('Run this in your project folder, not in nextpak-skills.');
  const configFile = path.join(project, '.nextpak', 'config.json');
  const saved = readJson(configFile, null);
  if (mode === 'update' && !saved) fail('This project has no .nextpak/config.json yet. Run init first.');

  console.log(`NextPak AI setup ${PKG.version}${sourceCommit() ? ` (${sourceCommit()})` : ''}: ${mode} ${project}${o.dry ? ' (dry run)' : ''}`);
  if (saved) console.log(`Set up before with ${saved.version}${saved.commit ? ` (${saved.commit})` : ''} on ${saved.updated}.`);

  const isGit = git(project, 'rev-parse', '--is-inside-work-tree').stdout?.trim() === 'true';
  const interactive = mode === 'init' && !o.yes;
  if (interactive && !process.stdin.isTTY && !process.env.NEXTPAK_TEST_INTERACTIVE) fail('No terminal to ask questions in: pass --yes with the flags (see: help).');
  if (!isGit) console.log('\nNote: not a git repository yet. The git hooks are turned on when you run npm run ai:setup after git init.');
  else {
    if (git(project, 'status', '--porcelain').stdout.trim()) console.log('\nNote: you have uncommitted changes. Commit them first so the setup is one clean change to review.');
    const branch = git(project, 'branch', '--show-current').stdout.trim();
    if (interactive && ['main', 'master'].includes(branch) && await yesNo(`\nYou are on ${branch}. Create the branch chore/nextpak-ai-setup for this`, true)) {
      if (!o.dry) {
        const r = git(project, 'switch', '-c', 'chore/nextpak-ai-setup');
        if (r.status !== 0) fail(`git switch failed: ${r.stderr.trim()}`);
      }
      console.log('On branch chore/nextpak-ai-setup.');
    }
  }

  let choice;
  if (interactive) choice = await chooseInteractively(project, saved, o);
  else {
    const detected = [...detectStacks(project).keys()];
    choice = {
      stacks: normStacks(uniq([...(saved?.stacks ?? []), ...o.stacks, ...(saved || o.stacks.length ? [] : detected)])),
      tools: normTools(o.tools ?? saved?.tools ?? ['all']),
      mcp: normMcp(uniq([...(saved?.mcp?.selected ?? []), ...o.mcp])),
      guardrails: o.guardrails ?? saved?.guardrails ?? true,
      lead: normLead(o.lead ?? saved?.lead ?? ''),
    };
  }
  if (!choice.stacks.length) fail('No stack found in the code: pass --stack node, fastapi or react.');
  if (!choice.tools.length) fail('No AI tool chosen: pass --tool claude, antigravity, codex or all.');

  console.log(`\nStacks: ${choice.stacks.join(', ')} | Tools: ${choice.tools.join(', ')} | MCP: ${choice.mcp.join(', ') || 'none'} | Guardrails: ${choice.guardrails ? 'on' : 'off'}${choice.lead ? ` | Lead: @${choice.lead}` : ''}`);
  if (interactive && !(await yesNo('Go ahead', true))) fail('Stopped. Nothing was changed.');
  rl?.close();

  const ops = makeOps(o.dry);
  const dryFlag = o.dry ? ['--dry-run'] : [];
  console.log('');
  const skills = installSkills(project, choice, saved, ops);
  installInstructions(project, choice, ops);

  if (choice.mcp.length) {
    const mcpTool = choice.tools.length === 3 ? ['all'] : choice.tools.map((t) => (t === 'antigravity' ? 'agents' : t));
    for (const t of mcpTool) runTool('mcp.mjs', ['install', project, '--mcp', choice.mcp.join(','), '--tool', t, '--brief', ...dryFlag]);
  }
  if (choice.guardrails) {
    const tools = choice.tools.map((t) => (t === 'antigravity' ? 'agents' : t)).join(',');
    runTool('guardrails.mjs', ['install', project, '--tool', tools, ...(choice.lead ? ['--lead', choice.lead] : []), '--brief', ...dryFlag]);
  }

  ops.write(path.join(project, '.nextpak', 'doctor.mjs'), fs.readFileSync(path.join(REPO, 'setup', 'files', '.nextpak', 'doctor.mjs')));
  const config = {
    $comment: 'Written by nextpak-skills (npx github:VIRGO96/nextpak-skills update). Choices only, never secrets.',
    source: SOURCE,
    version: PKG.version,
    commit: sourceCommit(),
    updated: new Date().toISOString().slice(0, 10),
    ...choice,
    mcp: mcpSummary(choice.mcp, choice.tools),
    skills,
  };
  ops.write(configFile, JSON.stringify(config, null, 2) + '\n');
  const scriptNote = installScripts(project, choice, ops);

  if (!o.dry && isGit && choice.guardrails) spawnSync(process.execPath, [path.join(project, '.nextpak', 'doctor.mjs'), '--hooks-only'], { stdio: 'ignore' });

  console.log(`\n${'='.repeat(70)}\nDone${o.dry ? ' (dry run, nothing written)' : ''}. Next steps:\n`);
  const steps = mode === 'init'
    ? [
      'Review the changes: git status, git diff.',
      'Fill in AGENTS.md: open the project in your AI tool and ask "is this project AI-ready?".',
      'Commit everything on a branch and open a PR (nothing here is secret): "chore: NextPak AI setup".',
      ...(choice.guardrails ? ['Repo admin, in GitHub settings: protect main (require a PR, the "AI guardrails" checks and Code Owner review; block force-push).'] : []),
      'Tell the team: git pull, npm install, npm run ai:setup (and follow what it prints).',
    ]
    : [
      `Review the changes (git diff), commit them as "chore: update NextPak AI setup to ${PKG.version}" and open a PR.`,
      'Tell the team: after the PR is merged, git pull and npm run ai:setup.',
    ];
  steps.forEach((s, i) => console.log(`${i + 1}. ${s}`));
  if (scriptNote) console.log(`\n${scriptNote}`);
  const { env, antigravityGlobal, requires } = config.mcp;
  if (env.length || antigravityGlobal.length || Object.keys(requires).length) {
    console.log('\nWhat each developer needs (npm run ai:setup checks it and shows them how):');
    if (env.length) console.log(`  - Environment variables, set on their own machine: ${env.join(', ')}`);
    if (antigravityGlobal.length) console.log(`  - Antigravity: ${antigravityGlobal.join(', ')} in their global MCP config, with their own token`);
    for (const [id, need] of Object.entries(requires)) console.log(`  - ${id}: ${need}`);
  }
}

// ---------- other commands ----------

function doctor(o) {
  const project = path.resolve(o.rest[1] ?? '.');
  const local = path.join(project, '.nextpak', 'doctor.mjs');
  const script = fs.existsSync(local) ? local : path.join(REPO, 'setup', 'files', '.nextpak', 'doctor.mjs');
  const r = spawnSync(process.execPath, [script, '--root', project], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

function showList() {
  console.log('Stacks:');
  for (const [s, skill] of Object.entries(STACKS)) console.log(`  ${s.padEnd(9)} ${skill}`);
  console.log('\nTools: claude (Claude Code), antigravity (Google Antigravity), codex (OpenAI Codex), all');
  console.log('\nMCP groups and servers:');
  runTool('mcp.mjs', ['list']);
}

function help() {
  const text = fs.readFileSync(import.meta.filename, 'utf8').split('\n');
  const end = text.findIndex((l) => l.startsWith('import '));
  console.log(text.slice(1, end).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
}

const o = parseArgs(process.argv.slice(2));
const cmd = o.rest[0] ?? 'help';
if (cmd === 'init' || cmd === 'update') await setup(cmd, o);
else if (cmd === 'doctor') doctor(o);
else if (cmd === 'list') showList();
else if (cmd === 'help') help();
else fail(`Unknown command: ${cmd} (use init, update, doctor, list or help)`);
