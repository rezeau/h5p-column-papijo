'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const baseline = '174725530235e4d26ac4b611e5c45bb9b9307779';
const root = path.resolve(__dirname, '..');
const protectedFiles = [
  'scripts/h5p-column.js',
  'semantics.json',
  'presave.js',
  'styles/h5p-column.css',
  'library.json',
  'icon.svg',
  'README.md'
];

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
  console.error(`Production immutability check failed: ${changed.join(', ')}`);
  process.exitCode = 1;
}
else {
  console.log(`Production immutability check passed against ${baseline} (${protectedFiles.length} files).`);
}
