'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const baseline = '292cefa0c14b24562d01da3cccd0a3553fc542d9';
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

if (version !== expectedVersion) {
  throw new Error(`Expected next minor version ${expectedVersion}, found ${version}.`);
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

console.log(`Release metadata validation passed for H5P.ColumnPapiJo ${version}.`);
