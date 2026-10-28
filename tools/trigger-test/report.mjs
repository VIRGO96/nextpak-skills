// Reads the headless session logs written by run.sh and checks which skills each prompt loaded.
// Usage: node report.mjs <prompts.tsv> <out-dir>
// prompts.tsv columns: id, fixture dir, expected skill(s) separated by | or "none", prompt.
// A prompt passes if any expected skill loaded; "none" passes only if no skill loaded.
import fs from 'node:fs';
import path from 'node:path';

const PROMPTS = process.argv[2];
const OUT = process.argv[3];
const rows = fs.readFileSync(PROMPTS, 'utf8').trim().split('\n').slice(1)
  .map((l) => { const [id, dir, expected, prompt] = l.split('\t'); return { id, dir, expected, prompt }; });

let hits = 0;
const out = [];
for (const r of rows) {
  const file = path.join(OUT, `${r.id}.jsonl`);
  const loaded = new Set();
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let j; try { j = JSON.parse(line); } catch { continue; }
      const content = j.message?.content;
      if (j.type !== 'assistant' || !Array.isArray(content)) continue;
      for (const c of content) {
        if (c.type !== 'tool_use') continue;
        if (c.name === 'Skill' && c.input?.skill) loaded.add(String(c.input.skill).replace(/^.*:/, ''));
        const p = String(c.input?.file_path ?? c.input?.path ?? '');
        const m = p.replace(/\\/g, '/').match(/skills\/([^/]+)\/SKILL\.md$/i);
        if (m) loaded.add(m[1]);
      }
    }
  }
  const expected = r.expected.split('|');
  const got = [...loaded];
  const ok = expected[0] === 'none' ? got.length === 0 : expected.some((e) => loaded.has(e));
  if (ok) hits++;
  out.push(`${ok ? 'PASS' : 'FAIL'}\t${r.id}\texpected=${r.expected}\tgot=${got.join(',') || '-'}\t${r.prompt}`);
}
console.log(out.join('\n'));
console.log(`\nTOTAL ${hits}/${rows.length}`);
