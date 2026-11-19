// Package skill/<name>/ into public/skill/<name>-<version>.zip (top-level folder = skill name, as Claude requires).
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import JSZip from 'jszip';

const meta = JSON.parse(readFileSync('skill/skill-meta.json', 'utf8'));
const src = join('skill', meta.name);
const skillMd = readFileSync(join(src, 'SKILL.md'), 'utf8');

if (!skillMd.startsWith('---\nname: ' + meta.name + '\n')) throw new Error('SKILL.md frontmatter name must match skill-meta.json');
if (!skillMd.includes(`Phiên bản skill: **${meta.version}**`)) throw new Error('SKILL.md version must match skill-meta.json');
if (!skillMd.includes(`Giao thức: **${meta.protocol}**`)) throw new Error('SKILL.md protocol must match skill-meta.json');

const zip = new JSZip();
const walk = (dir) => {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else zip.file(`${meta.name}/${relative(src, p).split('\\').join('/')}`, readFileSync(p), { date: new Date('2026-01-01T00:00:00Z') });
  }
};
walk(src);

const out = join('public', 'skill');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const file = `${meta.name}-${meta.version}.zip`;
writeFileSync(join(out, file), await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' }));
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ ...meta, file }, null, 2));
console.log(`skill → public/skill/${file} (${Object.keys(zip.files).filter((n) => !zip.files[n].dir).length} files)`);
