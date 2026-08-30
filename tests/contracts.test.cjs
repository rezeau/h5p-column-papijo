'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');

test('presave registers official Column but not ColumnPapiJo', () => {
  const source = fs.readFileSync(path.join(root, 'presave.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: 'presave.js' });

  assert.equal(typeof context.H5PPresave['H5P.Column'], 'function');
  assert.equal(context.H5PPresave['H5P.ColumnPapiJo'], undefined);
});

test('lookup by the ColumnPapiJo machine name cannot invoke the current presave hook', () => {
  const source = fs.readFileSync(path.join(root, 'presave.js'), 'utf8');
  const context = vm.createContext({});
  vm.runInContext(source, context, { filename: 'presave.js' });

  const machineName = 'H5P.ColumnPapiJo';
  assert.equal(context.H5PPresave[machineName], undefined);
});

test('semantics retains exactly the eight agreed PapiJo child options', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
  const options = semantics[0].field.fields[0].options;
  const papiJoOptions = options.filter((option) => option.includes('PapiJo'));

  assert.deepEqual(papiJoOptions, [
    'H5P.AccordionPapiJo 1.1',
    'H5P.DialogcardsPapiJo 1.17',
    'H5P.DragQuestionPapiJo 1.14',
    'H5P.DragTextPapiJo 1.2',
    'H5P.AdvancedTextPapiJo 1.1',
    'H5P.MarkTheWordsPapiJo 1.2',
    'H5P.QuestionSetPapiJo 1.21',
    'H5P.MultiMediaChoicePapiJo 0.4'
  ]);
});

test('semantics excludes ImageZoomPapiJo and TextareaPapiJo', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
  const options = semantics[0].field.fields[0].options;

  assert.equal(options.some((option) => option.startsWith('H5P.ImageZoomPapiJo ')), false);
  assert.equal(options.some((option) => option.startsWith('H5P.TextareaPapiJo ')), false);
});

test('semantics keeps the three intentionally removed official libraries excluded', () => {
  const semantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
  const options = semantics[0].field.fields[0].options;
  const excluded = ['H5P.HighlightTheWords', 'H5P.ImageJuxtaposition', 'H5P.JigsawPuzzle'];

  for (const machineName of excluded) {
    assert.equal(options.some((option) => option.startsWith(`${machineName} `)), false, machineName);
  }
});
