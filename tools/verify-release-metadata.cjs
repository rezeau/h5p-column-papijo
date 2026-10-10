'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const baseline = 'v1.20.0';
const requiredVersion = '1.21.0';
const root = path.resolve(__dirname, '..');
const library = JSON.parse(fs.readFileSync(path.join(root, 'library.json'), 'utf8'));
const packageMetadata = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const baselineLibrary = JSON.parse(execFileSync(
  'git',
  ['show', `${baseline}:library.json`],
  { cwd: root, encoding: 'utf8' }
));

const version = `${library.majorVersion}.${library.minorVersion}.${library.patchVersion}`;
const expectedVersion = `${baselineLibrary.majorVersion}.${baselineLibrary.minorVersion + 1}.0`;

if (version !== requiredVersion || version !== expectedVersion) {
  throw new Error(`Expected minor-version transition ${baselineLibrary.majorVersion}.${baselineLibrary.minorVersion}.${baselineLibrary.patchVersion} to ${requiredVersion}, found ${version}.`);
}
if (library.majorVersion !== baselineLibrary.majorVersion) {
  throw new Error(`library.json majorVersion changed from ${baselineLibrary.majorVersion} to ${library.majorVersion}.`);
}
if (packageMetadata.version !== version) {
  throw new Error(`package.json version ${packageMetadata.version} does not match library version ${version}.`);
}
if (packageMetadata.private !== true) {
  throw new Error('The npm characterization package must remain private.');
}

const comparableLibrary = {
  ...library,
  minorVersion: baselineLibrary.minorVersion,
  patchVersion: baselineLibrary.patchVersion
};
if (JSON.stringify(comparableLibrary) !== JSON.stringify(baselineLibrary)) {
  throw new Error('library.json contains release changes beyond minorVersion and patchVersion.');
}

const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
if (!readme.includes(`Current release: **${version}**`)) {
  throw new Error(`README.md does not identify release ${version}.`);
}
if (!changelog.includes(`## ${version} - `)) {
  throw new Error(`CHANGELOG.md has no ${version} release section.`);
}

const substitutions = [
  ['H5P.AdvancedTextPapiJo 1.2', 'H5P.AdvancedTextPapiJo 1.3'],
  ['H5P.AccordionPapiJo 1.1', 'H5P.AccordionPapiJo 1.2']
];
let expectedSemantics = execFileSync('git', ['show', `${baseline}:semantics.json`], {
  cwd: root, encoding: 'utf8'
});
for (const [from, to] of substitutions) {
  if (expectedSemantics.split(from).length !== 2) {
    throw new Error(`Expected exactly one ${from} in ${baseline} semantics.`);
  }
  expectedSemantics = expectedSemantics.replace(from, to);
  for (const [file, text] of [['README.md', readme], ['CHANGELOG.md', changelog.split('## 1.20.0')[0]]]) {
    if (!text.includes(to)) throw new Error(`${file} must document ${to} for ${version}.`);
  }
}
if (JSON.stringify(JSON.parse(expectedSemantics)) !==
    JSON.stringify(JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8')))) {
  throw new Error('Release semantics must contain exactly the two approved child-version substitutions.');
}
if (fs.existsSync(path.join(root, 'upgrades.js'))) {
  throw new Error('Column 1.21 uses H5P recursive upgrades without a custom upgrades.js.');
}

console.log(`Release metadata validation passed for H5P.ColumnPapiJo ${version}.`);
