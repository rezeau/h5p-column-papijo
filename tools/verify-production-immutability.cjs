'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const baseline = 'b1433897f6ff84d70e3da01d27096ecc32f618d9';
const root = path.resolve(__dirname, '..');
const protectedFiles = [
  'semantics.json',
  'styles/h5p-column.css',
  'library.json',
  'icon.svg',
  'README.md'
];

const languageFiles = execFileSync(
  'git',
  ['ls-tree', '-r', '--name-only', baseline, '--', 'language'],
  { cwd: root, encoding: 'utf8' }
).trim().split(/\r?\n/).filter(Boolean);
protectedFiles.push(...languageFiles);

const changed = [];
for (const file of protectedFiles) {
  const baselineBytes = execFileSync(
    'git',
    ['show', `${baseline}:${file}`],
    { cwd: root, encoding: 'buffer' }
  );
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
