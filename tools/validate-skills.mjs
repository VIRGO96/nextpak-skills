#!/usr/bin/env node
// Checks every skill in this repo against the Agent Skills spec and team conventions
// (docs/writing-skills.md). Usage: node tools/validate-skills.mjs [skills-root]
// Exit code 1 if any error is found; warnings don't fail.
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? path.join(import.meta.dirname, '..'));
const SKIP_DIRS = new Set(['node_modules', '.git', 'tools', 'docs']);
const MAX_LINES = 500; // spec and Anthropic guide: keep SKILL.md under 500 lines
const TARGET_LINES = 250; // team target; above this is a warning
const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

let errors = 0;
let warnings = 0;

function findSkills(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (fs.existsSync(path.join(full, 'SKILL.md'))) out.push(full);
    else out.push(...findSkills(full));
  }
  return out;
}

// Minimal frontmatter reader: top-level `key: value` lines plus one nested `metadata:` map.
// Our skills keep every value on one line, which is also a team rule.
function readFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!m) return null;
  const fm = { metadata: {} };
  let inMetadata = false;
  for (const line of m[1].split(/\r?\n/)) {
    const nested = line.match(/^\s+([\w-]+):\s*(.*)$/);
    if (inMetadata && nested) { fm.metadata[nested[1]] = nested[2]; continue; }
    const top = line.match(/^([\w-]+):\s*(.*)$/);
    if (top) { inMetadata = top[1] === 'metadata'; if (!inMetadata) fm[top[1]] = top[2]; }
  }
  return { fm, body: text.slice(m[0].length) };
}

function check(skillDir) {
  const rel = path.relative(root, skillDir).split(path.sep).join('/');
  const thirdParty = rel.includes('third-party/');
  const problems = [];
  const err = (msg) => { problems.push(`  ERROR ${msg}`); errors++; };
  const warn = (msg) => { problems.push(`  warn  ${msg}`); warnings++; };

  const text = fs.readFileSync(path.join(skillDir, 'SKILL.md'), 'utf8');
  const parsed = readFrontmatter(text);
  if (!parsed) { err('no YAML frontmatter between --- lines'); return report(rel, problems); }
  const { fm, body } = parsed;
  const folder = path.basename(skillDir);

  if (!fm.name) err('missing name');
  else {
    if (fm.name.length > 64) err(`name longer than 64 characters`);
    if (!NAME_RE.test(fm.name)) err(`name "${fm.name}" must be lowercase letters, digits and single hyphens`);
    if (fm.name !== folder) err(`name "${fm.name}" does not match folder "${folder}"`);
    if (/anthropic|claude/.test(fm.name)) err('name contains a reserved word (anthropic, claude)');
  }

  const d = fm.description ?? '';
  if (!d) err('missing description (or it is not on one line)');
  else {
    if (d.length > 1024) err(`description is ${d.length} characters (max 1024)`);
    if (/[<>]/.test(d)) err('description contains < or >');
    if (/\s#/.test(d)) err('description contains " #": YAML treats the rest as a comment');
    if (!thirdParty && !/^Use when/.test(d)) warn('description should start with "Use when ..."');
    if (!thirdParty && !/Not for/.test(d)) warn('description has no "Not for ..." line');
  }

  if (!thirdParty) {
    if (!fm.metadata.version) err('missing metadata.version');
    if (!fm.metadata.author) warn('missing metadata.author');
  }

  const lines = body.split('\n').length;
  if (lines > MAX_LINES) err(`SKILL.md body is ${lines} lines (max ${MAX_LINES})`);
  else if (lines > TARGET_LINES && !thirdParty) warn(`SKILL.md body is ${lines} lines (team target ${TARGET_LINES})`);

  if (fs.existsSync(path.join(skillDir, 'README.md'))) err('README.md inside a skill folder');

  // Team section structure (docs/writing-skills.md section 5).
  if (!thirdParty) {
    for (const [label, re] of [
      ['CRITICAL rules', /^##\s+(CRITICAL|Critical)/m],
      ['Definition of done', /^##\s+Definition of done/im],
      ['Red flags', /^##\s+Red flags/im],
    ]) if (!re.test(body)) warn(`no "## ${label}" section`);
  }

  // Local links must exist, use forward slashes, and stay one level deep.
  // Links inside code blocks or inline code are templates/examples, not real links.
  const prose = stripCode(body);
  const linkedFromSkill = new Set();
  for (const [, target] of prose.matchAll(/\]\(([^)\s]+)\)/g)) {
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    if (target.includes('\\')) err(`link uses backslashes: ${target}`);
    const file = target.split('#')[0];
    if (file && !fs.existsSync(path.join(skillDir, file))) err(`broken link: ${target}`);
    if (file) linkedFromSkill.add(path.posix.normalize(file));
  }
  const refDir = path.join(skillDir, 'references');
  if (fs.existsSync(refDir)) {
    for (const f of fs.readdirSync(refDir).filter((x) => x.endsWith('.md'))) {
      if (!thirdParty && !linkedFromSkill.has(`references/${f}`)) warn(`references/${f} is not linked from SKILL.md`);
      const ref = fs.readFileSync(path.join(refDir, f), 'utf8');
      // A reference may point to a sibling only if SKILL.md links that sibling too (still one level deep).
      for (const [, target] of stripCode(ref).matchAll(/\]\(([^)\s#]+\.md)(#[^)]*)?\)/g)) {
        if (/^https?:/.test(target)) continue;
        const sibling = path.posix.normalize(`references/${target}`);
        if (!linkedFromSkill.has(sibling)) warn(`references/${f} links to ${target}, which SKILL.md doesn't link (keep references one level deep)`);
      }
      if (ref.split('\n').length > 100 && !/^##\s*Contents/im.test(ref.slice(0, 1500))) {
        warn(`references/${f} is over 100 lines with no "## Contents" at the top`);
      }
    }
  }

  return report(rel, problems);
}

function stripCode(md) {
  return md.replace(/^(```|~~~)[\s\S]*?^\1/gm, '').replace(/`[^`\n]*`/g, '');
}

function report(rel, problems) {
  console.log(`${problems.some((p) => p.includes('ERROR')) ? 'FAIL' : 'ok  '} ${rel}`);
  for (const p of problems) console.log(p);
}

const skills = findSkills(root);
if (skills.length === 0) { console.error(`No skills found under ${root}`); process.exit(1); }
skills.forEach(check);
console.log(`\n${skills.length} skills, ${errors} errors, ${warnings} warnings`);
process.exit(errors ? 1 : 0);
