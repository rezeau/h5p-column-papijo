'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['.git', 'node_modules']);
const failures = [];
let checked = 0;

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      visit(entryPath);
      continue;
    }

    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== '.json') {
      continue;
    }

    checked++;
    try {
      JSON.parse(fs.readFileSync(entryPath, 'utf8'));
    }
    catch (error) {
      failures.push(`${path.relative(root, entryPath)}: ${error.message}`);
    }
  }
}

visit(root);

if (failures.length > 0) {
  console.error(`JSON validation failed:\n${failures.join('\n')}`);
  process.exitCode = 1;
}
else {
  console.log(`JSON validation passed (${checked} files).`);
}
