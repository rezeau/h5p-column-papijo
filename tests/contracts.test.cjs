'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

test('library version is exactly ColumnPapiJo 1.19.0', () => {
  const library = JSON.parse(fs.readFileSync(path.join(root, 'library.json'), 'utf8'));

  assert.equal(library.machineName, 'H5P.ColumnPapiJo');
  assert.deepEqual(
    [library.majorVersion, library.minorVersion, library.patchVersion],
    [1, 19, 0]
  );
});

test('presave registers ColumnPapiJo but not official Column', () => {
  const source = fs.readFileSync(path.join(root, 'presave.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: 'presave.js' });

  assert.equal(typeof context.H5PPresave['H5P.ColumnPapiJo'], 'function');
  assert.equal(context.H5PPresave['H5P.Column'], undefined);
});

test('lookup by the ColumnPapiJo machine name resolves the presave hook', () => {
  const source = fs.readFileSync(path.join(root, 'presave.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: 'presave.js' });

  const machineName = 'H5P.ColumnPapiJo';
  assert.equal(typeof context.H5PPresave[machineName], 'function');
});

test('semantics retains exactly the eleven agreed PapiJo child options', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
  const options = semantics[0].field.fields[0].options;
  const papiJoOptions = options.filter((option) => option.includes('PapiJo'));

  assert.deepEqual(papiJoOptions, [
    'H5P.AccordionPapiJo 1.1',
    'H5P.AdvancedBlanksPapiJo 1.4',
    'H5P.AdvancedTextPapiJo 1.2',
    'H5P.DialogcardsPapiJo 1.17',
    'H5P.DragQuestionPapiJo 1.14',
    'H5P.DragTextPapiJo 1.3',
    'H5P.ImageZoomPapiJo 1.0',
    'H5P.MarkTheWordsPapiJo 1.2',
    'H5P.MultiMediaChoicePapiJo 0.4',
    'H5P.QuestionSetPapiJo 1.22',
    'H5P.TextareaPapiJo 1.0'
  ]);
});

test('semantics changes only QuestionSetPapiJo 1.21 to 1.22 from ColumnPapiJo 1.18.0', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
  const options = semantics[0].field.fields[0].options;
  const baseline = JSON.parse(execFileSync(
    'git',
    ['show', 'v1.18.0:semantics.json'],
    { cwd: root, encoding: 'utf8' }
  ));
  const expected = baseline[0].field.fields[0].options.map((option) =>
    option === 'H5P.QuestionSetPapiJo 1.21' ? 'H5P.QuestionSetPapiJo 1.22' : option
  );

  assert.deepEqual(options, expected);
  assert.equal(options.includes('H5P.QuestionSetPapiJo 1.22'), true);
  assert.equal(options.includes('H5P.QuestionSetPapiJo 1.21'), false);
});

test('semantics permits AdvancedBlanksPapiJo 1.4', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
  const options = semantics[0].field.fields[0].options;

  assert.equal(options.includes('H5P.AdvancedBlanksPapiJo 1.4'), true);
});

test('semantics permits ImageZoomPapiJo 1.0', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
  const options = semantics[0].field.fields[0].options;

  assert.equal(options.includes('H5P.ImageZoomPapiJo 1.0'), true);
});

test('semantics temporarily permits TextareaPapiJo 1.0 for legacy content conversion', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
  const options = semantics[0].field.fields[0].options;

  assert.equal(options.includes('H5P.TextareaPapiJo 1.0'), true);
});

test('semantics keeps unsupported libraries excluded', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
  const options = semantics[0].field.fields[0].options;
  const excluded = ['H5P.HighlightTheWords', 'H5P.JigsawPuzzle'];

  for (const machineName of excluded) {
    assert.equal(options.some((option) => option.startsWith(`${machineName} `)), false, machineName);
  }
});
