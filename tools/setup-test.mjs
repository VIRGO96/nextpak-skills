#!/usr/bin/env node
// Tests for the setup CLI (tools/cli.mjs) and the project doctor, in throwaway projects. No network,
// no tokens. Run: node tools/setup-test.mjs
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
const CLI = path.join(REPO, 'tools', 'cli.mjs');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'nextpak-setup-'));
let failed = 0;
let passed = 0;

function expect(label, ok, detail = '') {
  if (ok) { passed++; return; }
  failed++;
  console.log(`FAIL ${label}${detail ? `\n${String(detail).slice(-1500)}` : ''}`);
}

const env = { ...process.env, GIT_AUTHOR_NAME: 'test', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 'test', GIT_COMMITTER_EMAIL: 't@example.com' };
const cli = (...args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', env });
const git = (cwd, ...a) => spawnSync('git', a, { cwd, encoding: 'utf8', env });
const exists = (dir, rel) => fs.existsSync(path.join(dir, rel));
const read = (dir, rel) => fs.readFileSync(path.join(dir, rel), 'utf8');
const json = (dir, rel) => JSON.parse(read(dir, rel));

function project(name, files, { gitInit = true } = {}) {
  const dir = path.join(TMP, name);
  for (const [rel, content] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), typeof content === 'string' ? content : JSON.stringify(content, null, 2) + '\n');
  }
  fs.mkdirSync(dir, { recursive: true });
  if (gitInit) {
    git(dir, 'init', '-q', '-b', 'main');
    git(dir, 'add', '-A');
    git(dir, 'commit', '-q', '-m', 'baseline');
  }
  return dir;
}

// 1. Monorepo: Express API + React web, everything on, no questions.
const mono = project('todo-app', {
  'package.json': { name: 'todo-app', private: true, workspaces: ['api', 'web'], scripts: { test: 'npm test --workspaces' } },
  'api/package.json': { name: 'api', dependencies: { express: '^5.1.0' } },
  'web/package.json': { name: 'web', dependencies: { react: '^19.0.0' }, devDependencies: { vite: '^7.0.0' } },
});
let r = cli('init', mono, '--yes', '--mcp', 'core,frontend', '--lead', 'its-tahir');
expect('init monorepo exits 0', r.status === 0, r.stdout + r.stderr);
const cfg = json(mono, '.nextpak/config.json');
expect('config stacks detected', JSON.stringify(cfg.stacks) === '["node","react"]', JSON.stringify(cfg.stacks));
expect('config tools all', JSON.stringify(cfg.tools) === '["claude","antigravity","codex"]');
expect('config guardrails on', cfg.guardrails === true);
expect('config mcp servers', cfg.mcp.servers.includes('github') && cfg.mcp.servers.includes('chrome-devtools'), JSON.stringify(cfg.mcp));
expect('config env names only', cfg.mcp.env.includes('GITHUB_PAT') && !JSON.stringify(cfg).match(/ghp_|token=/i));
expect('config antigravity global servers', cfg.mcp.antigravityGlobal.includes('github'));
expect('config has no secrets field', !('secrets' in cfg));
for (const dir of ['.claude/skills', '.agents/skills']) {
  expect(`${dir} has lifecycle skill`, exists(mono, `${dir}/ai-dlc/SKILL.md`));
  expect(`${dir} has stack skills`, exists(mono, `${dir}/node-express-standards/SKILL.md`) && exists(mono, `${dir}/react-next-standards/SKILL.md`));
  expect(`${dir} has no fastapi skill`, !exists(mono, `${dir}/fastapi-standards`));
  expect(`${dir} has no repo-only skill`, !exists(mono, `${dir}/skill-authoring`));
}
expect('skills listed in config', cfg.skills.includes('ai-dlc') && cfg.skills.length > 10);
const agentsMd = read(mono, 'AGENTS.md');
expect('AGENTS.md has stack row', agentsMd.includes('`node-express-standards` and `react-next-standards`'));
expect('AGENTS.md has guardrails and MCP blocks', agentsMd.includes('## Guardrails in this project') && agentsMd.includes('BEGIN nextpak-mcp'));
expect('CLAUDE.md imports AGENTS.md', read(mono, 'CLAUDE.md').trim() === '@AGENTS.md');
expect('MCP for every tool', exists(mono, '.mcp.json') && exists(mono, '.agents/mcp_config.json') && exists(mono, '.codex/config.toml'));
expect('guardrails installed', exists(mono, '.guardrails/agent-guard.mjs') && exists(mono, '.agents/hooks.json') && exists(mono, '.codex/hooks.json'));
expect('claude hook installed', JSON.stringify(json(mono, '.claude/settings.json').hooks).includes('agent-guard.mjs'));
expect('doctor copied', exists(mono, '.nextpak/doctor.mjs'));
const pkg = json(mono, 'package.json');
expect('ai:setup script', pkg.scripts['ai:setup'] === 'node .nextpak/doctor.mjs');
expect('prepare script', pkg.scripts.prepare === 'node .nextpak/doctor.mjs --hooks-only');
expect('existing scripts kept', pkg.scripts.test === 'npm test --workspaces' && pkg.workspaces.length === 2);
expect('hooks on for this clone', git(mono, 'config', '--get', 'core.hooksPath').stdout.trim() === '.guardrails/git-hooks');
expect('CODEOWNERS covers .nextpak', read(mono, '.github/CODEOWNERS').includes('/.nextpak/ @its-tahir'));
expect('init prints team steps', r.stdout.includes('npm run ai:setup'));

// 2. Doctor in the set-up project.
r = spawnSync(process.execPath, [path.join(mono, '.nextpak', 'doctor.mjs')], { encoding: 'utf8', env: { ...env, GITHUB_PAT: 'set-for-test' } });
expect('doctor exits 0', r.status === 0, r.stdout + r.stderr);
expect('doctor checks the guard', r.stdout.includes('Agent guard works'));
expect('doctor reports token set without value', r.stdout.includes('GITHUB_PAT is set') && !r.stdout.includes('set-for-test'));
expect('doctor flags AGENTS.md TODOs', r.stdout.includes('AGENTS.md has'));
expect('doctor prints tool steps', r.stdout.includes('Antigravity: open the folder') && r.stdout.includes('run printenv'));
r = cli('doctor', mono);
expect('cli doctor runs the project doctor', r.stdout.includes('NextPak AI setup check'), r.stdout + r.stderr);

// 3. A teammate clones: hooks are off until prepare or ai:setup runs.
git(mono, 'add', '-A');
git(mono, 'commit', '-q', '-m', 'chore: NextPak AI setup');
const clone = path.join(TMP, 'teammate');
git(TMP, 'clone', '-q', mono, clone);
expect('fresh clone has hooks off', git(clone, 'config', '--get', 'core.hooksPath').stdout.trim() === '');
spawnSync(process.execPath, [path.join(clone, '.nextpak', 'doctor.mjs'), '--hooks-only'], { cwd: clone, env });
expect('prepare turns hooks on', git(clone, 'config', '--get', 'core.hooksPath').stdout.trim() === '.guardrails/git-hooks');
const clone2 = path.join(TMP, 'teammate-ci');
git(TMP, 'clone', '-q', mono, clone2);
spawnSync(process.execPath, [path.join(clone2, '.nextpak', 'doctor.mjs'), '--hooks-only'], { cwd: clone2, env: { ...env, CI: 'true' } });
expect('prepare does nothing in CI', git(clone2, 'config', '--get', 'core.hooksPath').stdout.trim() === '');
fs.writeFileSync(path.join(clone, '.env'), 'X=1\n');
git(clone, 'add', '-f', '.env');
r = git(clone, 'commit', '-m', 'add env');
expect('pre-commit blocks .env in the clone', r.status !== 0, r.stdout + r.stderr);

// 4. Update: no flags, same choices; adds a group; removes dropped team skills, keeps the team's own.
const before = json(mono, '.nextpak/config.json');
before.skills.push('old-team-skill');
fs.writeFileSync(path.join(mono, '.nextpak', 'config.json'), JSON.stringify(before, null, 2));
fs.mkdirSync(path.join(mono, '.agents/skills/old-team-skill'), { recursive: true });
fs.mkdirSync(path.join(mono, '.agents/skills/our-own-skill'), { recursive: true });
fs.writeFileSync(path.join(mono, '.agents/skills/our-own-skill/SKILL.md'), '---\nname: our-own-skill\n---\n');
r = cli('update', mono, '--mcp', 'database');
expect('update exits 0', r.status === 0, r.stdout + r.stderr);
const after = json(mono, '.nextpak/config.json');
expect('update keeps choices', JSON.stringify(after.stacks) === '["node","react"]' && after.lead === 'its-tahir' && after.tools.length === 3);
expect('update adds the new group', after.mcp.selected.join(',') === 'core,frontend,database' && after.mcp.servers.includes('dbhub'));
expect('update creates git-ignored dbhub.toml', exists(mono, 'dbhub.toml') && read(mono, '.gitignore').includes('dbhub.toml'));
expect('update removes dropped team skill', !exists(mono, '.agents/skills/old-team-skill'));
expect('update keeps the team\'s own skill', exists(mono, '.agents/skills/our-own-skill/SKILL.md'));
expect('update prints commit step', r.stdout.includes('chore: update NextPak AI setup'));

// 4b. Updating twice changes nothing, also when a Windows checkout turned the files into CRLF.
const MANAGED = ['.gitignore', '.gitattributes', '.github/CODEOWNERS', 'AGENTS.md', '.codex/config.toml'];
const lf = (rel) => read(mono, rel).replace(/\r\n/g, '\n');
const snapshot = () => MANAGED.map(lf).join('\0');
const once = snapshot();
cli('update', mono);
expect('second update changes nothing', snapshot() === once);
for (const rel of MANAGED) fs.writeFileSync(path.join(mono, rel), lf(rel).replace(/\n/g, '\r\n'));
r = cli('update', mono);
expect('update on CRLF files exits 0', r.status === 0, r.stdout + r.stderr);
expect('update on CRLF files adds no blank lines', snapshot() === once, MANAGED.filter((rel) => /\n\n\n/.test(lf(rel))).join(', '));
expect('agent files are LF in git', read(mono, '.gitattributes').includes('.agents/** text eol=lf') && read(mono, '.gitattributes').includes('AGENTS.md text eol=lf'));

// 5. FastAPI, Antigravity only, no package.json.
const py = project('py-api', { 'requirements.txt': 'fastapi==0.120.0\nuvicorn\n' });
r = cli('init', py, '--yes', '--tool', 'antigravity');
expect('init fastapi exits 0', r.status === 0, r.stdout + r.stderr);
expect('fastapi skill in .agents only', exists(py, '.agents/skills/fastapi-standards/SKILL.md') && !exists(py, '.claude'));
expect('no codex files for antigravity only', !exists(py, '.codex'));
expect('no MCP files without --mcp', !exists(py, '.mcp.json') && !exists(py, '.agents/mcp_config.json'));
expect('no package.json created', !exists(py, 'package.json'));
expect('tells devs to run the doctor with node', r.stdout.includes('node .nextpak/doctor.mjs'));

// 6. Existing "prepare" (husky) is kept, with a note.
const husky = project('husky-app', { 'package.json': { name: 'h', scripts: { prepare: 'husky' }, dependencies: { express: '^5.0.0' } } });
r = cli('init', husky, '--yes', '--tool', 'claude');
expect('husky prepare kept', json(husky, 'package.json').scripts.prepare === 'husky');
expect('husky note printed', r.stdout.includes('already has "prepare"'));

// 7. Existing AGENTS.md without the team sections is kept, and the block is printed.
const own = project('own-agents', { 'AGENTS.md': '# Mine\n\nOur rules.\n', 'package.json': { name: 'o', dependencies: { next: '16.0.0' } } });
r = cli('init', own, '--yes', '--tool', 'codex', '--no-guardrails');
expect('own AGENTS.md kept', read(own, 'AGENTS.md').startsWith('# Mine\n\nOur rules.'));
expect('missing block printed', r.stdout.includes('missing ## Team skills'));
expect('no guardrails when off', !exists(own, '.guardrails') && json(own, 'package.json').scripts.prepare === undefined);

// 8. Dry run writes nothing.
const dry = project('dry-app', { 'package.json': { name: 'd', dependencies: { express: '^5.0.0' } } });
const listing = () => spawnSync('git', ['status', '--porcelain', '--ignored'], { cwd: dry, encoding: 'utf8' }).stdout;
r = cli('init', dry, '--yes', '--mcp', 'core', '--dry-run');
expect('dry run exits 0', r.status === 0, r.stdout + r.stderr);
expect('dry run writes nothing', listing() === '' && git(dry, 'config', '--get', 'core.hooksPath').stdout === '', listing());

// 9. Bad input fails with a clear message and changes nothing.
const empty = project('empty', {}, { gitInit: false });
const bad = [
  [['init', empty, '--yes'], 'No stack found'],
  [['init', empty, '--yes', '--stack', 'rails'], 'Unknown stack'],
  [['init', empty, '--yes', '--stack', 'node', '--tool', 'cursor'], 'Unknown tool'],
  [['init', empty, '--yes', '--stack', 'node', '--mcp', 'nope'], 'Unknown MCP'],
  [['init', empty, '--yes', '--stack', 'node', '--lead', 'bad name;rm'], 'Not a GitHub username'],
  [['update', empty], 'Run init first'],
  [['init', REPO, '--yes', '--stack', 'node'], 'not in nextpak-skills'],
  [['init', path.join(TMP, 'missing'), '--yes'], 'not found'],
  [['init', empty, '--stack', 'node'], 'No terminal'],
  [['init', empty, '--frobnicate'], 'Unknown option'],
];
for (const [args, msg] of bad) {
  r = cli(...args);
  expect(`fails: ${args.slice(2).join(' ') || args[0]}`, r.status === 1 && r.stderr.includes(msg), r.stdout + r.stderr);
}
expect('failed runs changed nothing', fs.readdirSync(empty).length === 0);

// 10. Old entry point still works.
if (spawnSync('bash', ['--version']).status === 0) {
  const sh = project('sh-app', { 'package.json': { name: 's', dependencies: { express: '^5.0.0' } } });
  r = spawnSync('bash', [path.join(REPO, 'tools', 'install.sh'), sh, '--stack', 'node', '--tool', 'agents', '--guardrails'], { encoding: 'utf8', env });
  expect('install.sh wrapper works', r.status === 0 && exists(sh, '.agents/skills/node-express-standards') && exists(sh, '.codex/hooks.json'), r.stdout + r.stderr);
}

// 11. Interactive init: answer the questions like a lead would.
const ask = project('ask-app', {
  'package.json': { name: 'a', dependencies: { express: '^5.0.0', react: '^19.0.0' } },
});
const answers = [
  [/Create the branch/, 'y'], [/Stacks:/, ''], [/AI tools/, 'antigravity,claude'], [/MCP groups or server ids/, 'core'],
  [/guardrails/, ''], [/GitHub username/, '@its-tahir'], [/Go ahead/, 'y'],
];
// Answers each question when its prompt is the last line on screen.
const runInteractive = (dir) => new Promise((resolve) => {
  const child = spawn(process.execPath, [CLI, 'init', dir], { env: { ...env, NEXTPAK_TEST_INTERACTIVE: '1' } });
  let text = '';
  let next = 0;
  child.stdout.on('data', (d) => {
    text += d;
    while (next < answers.length && answers[next][0].test(text.split('\n').at(-1))) child.stdin.write(`${answers[next++][1]}\n`);
  });
  child.stderr.on('data', (d) => { text += d; });
  child.on('close', (code) => resolve({ code, text, next }));
});
const out = await runInteractive(ask);
expect('interactive init exits 0', out.code === 0 && out.next === answers.length, out.text);
const askCfg = exists(ask, '.nextpak/config.json') ? json(ask, '.nextpak/config.json') : {};
expect('interactive: detected stacks accepted', JSON.stringify(askCfg.stacks) === '["node","react"]', JSON.stringify(askCfg));
expect('interactive: tools in fixed order', JSON.stringify(askCfg.tools) === '["claude","antigravity"]');
expect('interactive: lead without @', askCfg.lead === 'its-tahir');
expect('interactive: branch created', git(ask, 'branch', '--show-current').stdout.trim() === 'chore/nextpak-ai-setup');

// 11b. The setup branch is left over from an earlier run: init uses it instead of failing.
const again = project('again-app', { 'package.json': { name: 'g', dependencies: { express: '^5.0.0', react: '^19.0.0' } } });
git(again, 'branch', 'chore/nextpak-ai-setup');
const out2 = await runInteractive(again);
expect('interactive: existing setup branch is reused', out2.code === 0 && git(again, 'branch', '--show-current').stdout.trim() === 'chore/nextpak-ai-setup', out2.text);

fs.rmSync(TMP, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
