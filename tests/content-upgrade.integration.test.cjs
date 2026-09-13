'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const h5pJsCandidates = [
  process.env.H5P_CORE_JS_PATH,
  'C:\\wamp64\\www\\wp-h5p\\wp-content\\plugins\\h5p\\h5p-php-library\\js'
].filter(Boolean);
const dragTextCandidates = [
  process.env.H5P_DRAGTEXT_PAPIJO_13_PATH,
  path.resolve(root, '..', 'papi-jo-h5p-dragtext')
].filter(Boolean);
const questionSetCandidates = [
  process.env.H5P_QUESTIONSET_PAPIJO_122_PATH,
  path.resolve(root, '..', 'papi-jo-h5p-questionset'),
  'C:\\wamp64\\www\\wp-h5p\\wp-content\\uploads\\h5p\\libraries\\H5P.QuestionSetPapiJo-1.22'
].filter(Boolean);
const h5pJsPath = h5pJsCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'h5p-version.js')) &&
  fs.existsSync(path.join(candidate, 'h5p-content-upgrade-process.js'))
);
const dragTextPath = dragTextCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'library.json')) &&
  fs.existsSync(path.join(candidate, 'semantics.json'))
);
const questionSetPath = questionSetCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'library.json')) &&
  fs.existsSync(path.join(candidate, 'semantics.json'))
);

test(
  'real H5P content upgrade recursively moves DragTextPapiJo 1.2 to 1.3 without changing params',
  { skip: !h5pJsPath || !dragTextPath ? 'H5P core upgrade scripts or DragTextPapiJo 1.3 are unavailable' : false },
  async () => {
    const fixture = JSON.parse(fs.readFileSync(
      path.join(root, 'tests', 'fixtures', 'column-1.17-dragtext-1.2.json'),
      'utf8'
    ));
    const before = structuredClone(fixture);
    const childBefore = fixture.params.content[0].content;
    const childParamsBefore = structuredClone(childBefore.params);

    assert.equal(fixture.library, 'H5P.ColumnPapiJo 1.17');
    assert.equal(childBefore.library, 'H5P.DragTextPapiJo 1.2');

    const context = vm.createContext({
      H5P: {},
      H5PUpgrades: {},
      console,
      setTimeout
    });
    vm.runInContext(
      fs.readFileSync(path.join(h5pJsPath, 'h5p-version.js'), 'utf8'),
      context,
      { filename: 'h5p-version.js' }
    );
    vm.runInContext(
      fs.readFileSync(path.join(h5pJsPath, 'h5p-content-upgrade-process.js'), 'utf8'),
      context,
      { filename: 'h5p-content-upgrade-process.js' }
    );

    const columnSemantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
    const dragTextLibrary = JSON.parse(fs.readFileSync(path.join(dragTextPath, 'library.json'), 'utf8'));
    const dragTextSemantics = JSON.parse(fs.readFileSync(path.join(dragTextPath, 'semantics.json'), 'utf8'));
    assert.deepEqual(
      [dragTextLibrary.machineName, dragTextLibrary.majorVersion, dragTextLibrary.minorVersion],
      ['H5P.DragTextPapiJo', 1, 3]
    );

    const libraries = new Map([
      ['H5P.ColumnPapiJo 1.18', { name: 'H5P.ColumnPapiJo', semantics: columnSemantics }],
      ['H5P.DragTextPapiJo 1.3', { name: 'H5P.DragTextPapiJo', semantics: dragTextSemantics }]
    ]);
    const loadLibrary = (name, version, done) => {
      const library = libraries.get(`${name} ${version.major}.${version.minor}`);
      setTimeout(() => done(library ? null : { type: 'libraryMissing', library: name }, library), 0);
    };

    const result = await new Promise((resolve, reject) => {
      new context.H5P.ContentUpgradeProcess(
        'H5P.ColumnPapiJo',
        new context.H5P.Version('1.17'),
        new context.H5P.Version('1.18'),
        JSON.stringify({ params: fixture.params, metadata: {} }),
        'c2-fixture',
        loadLibrary,
        (error, upgraded) => error ? reject(error) : resolve(JSON.parse(upgraded))
      );
    });

    assert.deepEqual(fixture, before);
    assert.equal(result.params.content[0].content.library, 'H5P.DragTextPapiJo 1.3');
    assert.deepEqual(result.params.content[0].content.params, childParamsBefore);
    assert.equal(fs.existsSync(path.join(root, 'upgrades.js')), false);
  }
);

test(
  'real H5P content upgrade recursively moves QuestionSetPapiJo 1.21 to 1.22 without changing params',
  { skip: !h5pJsPath || !questionSetPath ? 'H5P core upgrade scripts or QuestionSetPapiJo 1.22 are unavailable' : false },
  async () => {
    const fixture = JSON.parse(fs.readFileSync(
      path.join(root, 'tests', 'fixtures', 'column-1.18-questionset-1.21.json'),
      'utf8'
    ));
    const before = structuredClone(fixture);
    const childBefore = fixture.params.content[0].content;
    const childParamsBefore = structuredClone(childBefore.params);

    assert.equal(fixture.library, 'H5P.ColumnPapiJo 1.18');
    assert.equal(childBefore.library, 'H5P.QuestionSetPapiJo 1.21');

    const context = vm.createContext({
      H5P: {},
      H5PUpgrades: {},
      console,
      setTimeout
    });
    vm.runInContext(
      fs.readFileSync(path.join(h5pJsPath, 'h5p-version.js'), 'utf8'),
      context,
      { filename: 'h5p-version.js' }
    );
    vm.runInContext(
      fs.readFileSync(path.join(h5pJsPath, 'h5p-content-upgrade-process.js'), 'utf8'),
      context,
      { filename: 'h5p-content-upgrade-process.js' }
    );

    assert.equal(typeof context.H5P.ContentUpgradeProcess, 'function');
    const columnSemantics = JSON.parse(fs.readFileSync(path.join(root, 'semantics.json'), 'utf8'));
    const questionSetLibrary = JSON.parse(fs.readFileSync(path.join(questionSetPath, 'library.json'), 'utf8'));
    const questionSetSemantics = JSON.parse(fs.readFileSync(path.join(questionSetPath, 'semantics.json'), 'utf8'));
    assert.deepEqual(
      [questionSetLibrary.machineName, questionSetLibrary.majorVersion, questionSetLibrary.minorVersion],
      ['H5P.QuestionSetPapiJo', 1, 22]
    );

    const libraries = new Map([
      ['H5P.ColumnPapiJo 1.19', { name: 'H5P.ColumnPapiJo', semantics: columnSemantics }],
      ['H5P.QuestionSetPapiJo 1.22', { name: 'H5P.QuestionSetPapiJo', semantics: questionSetSemantics }]
    ]);
    const loadLibrary = (name, version, done) => {
      const library = libraries.get(`${name} ${version.major}.${version.minor}`);
      setTimeout(() => done(library ? null : { type: 'libraryMissing', library: name }, library), 0);
    };

    const result = await new Promise((resolve, reject) => {
      new context.H5P.ContentUpgradeProcess(
        'H5P.ColumnPapiJo',
        new context.H5P.Version('1.18'),
        new context.H5P.Version('1.19'),
        JSON.stringify({ params: fixture.params, metadata: {} }),
        'questionset-fixture',
        loadLibrary,
        (error, upgraded) => error ? reject(error) : resolve(JSON.parse(upgraded))
      );
    });

    assert.deepEqual(fixture, before);
    assert.equal(result.params.content[0].content.library, 'H5P.QuestionSetPapiJo 1.22');
    assert.deepEqual(result.params.content[0].content.params, childParamsBefore);
    assert.equal(fs.existsSync(path.join(root, 'upgrades.js')), false);
  }
);
