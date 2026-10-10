'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const baseline = 'v1.20.0';
const root = path.resolve(__dirname, '..');
const protectedFiles = [
  'scripts/h5p-column.js',
  'presave.js',
  'semantics.json',
  'styles/h5p-column.css',
  'icon.svg',
];
const languageFiles = execFileSync(
  'git',
  ['ls-tree', '-r', '--name-only', baseline, '--', 'language'],
  { cwd: root, encoding: 'utf8' }
).trim().split(/\r?\n/).filter(Boolean);
protectedFiles.push(...languageFiles);

const changed = [];
const currentLanguageFiles = fs.readdirSync(path.join(root, 'language'), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
  .map((entry) => `language/${entry.name}`)
  .sort();
if (JSON.stringify(currentLanguageFiles) !== JSON.stringify([...languageFiles].sort())) {
  changed.push('language file set');
}

for (const file of protectedFiles) {
  let baselineBytes = execFileSync(
    'git',
    ['show', `${baseline}:${file}`],
    { cwd: root, encoding: 'buffer' }
  );
  if (file === 'semantics.json') {
    let baselineText = baselineBytes.toString('utf8');
    const replacements = [
      ['H5P.AdvancedTextPapiJo 1.2', 'H5P.AdvancedTextPapiJo 1.3'],
      ['H5P.AccordionPapiJo 1.1', 'H5P.AccordionPapiJo 1.2']
    ];
    for (const [from, to] of replacements) {
      if (baselineText.split(from).length !== 2) {
        throw new Error(`Expected exactly one ${from} declaration in ${baseline}:${file}.`);
      }
      baselineText = baselineText.replace(from, to);
    }
    baselineBytes = Buffer.from(baselineText);
  }
  const workingBytes = fs.readFileSync(path.join(root, file));
  if (!baselineBytes.equals(workingBytes)) {
    changed.push(file);
  }
}

if (changed.length > 0) {
  console.error(`Unaffected production immutability check failed: ${changed.join(', ')}`);
  process.exitCode = 1;
}
else {
  console.log(`Unaffected production immutability check passed against ${baseline} (${protectedFiles.length} files).`);
}
