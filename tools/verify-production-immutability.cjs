'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const baseline = 'v1.19.0';
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
for (const file of protectedFiles) {
  let baselineBytes = execFileSync(
    'git',
    ['show', `${baseline}:${file}`],
    { cwd: root, encoding: 'buffer' }
  );
  if (file === 'semantics.json') {
    baselineBytes = Buffer.from(
      baselineBytes.toString('utf8').replace(
        '            "H5P.SingleChoiceSet 1.11",',
        '            "H5P.ScaleQuestion 0.1",\n            "H5P.SingleChoiceSet 1.11",'
      )
    );
  }
  else if (file === 'scripts/h5p-column.js') {
    const baselineText = baselineBytes.toString('utf8');
    const hasMarginsStart = baselineText.indexOf('  var hasMargins = [');
    const anchor = "    'H5P.TrueFalse',";
    const insertionPoint = baselineText.indexOf(anchor, hasMarginsStart);
    if (hasMarginsStart === -1 || insertionPoint === -1) {
      throw new Error(`Unable to locate the hasMargins insertion point in ${baseline}:${file}.`);
    }
    baselineBytes = Buffer.from(
      baselineText.slice(0, insertionPoint + anchor.length) +
      "\n    'H5P.ScaleQuestion'," +
      baselineText.slice(insertionPoint + anchor.length)
    );
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
