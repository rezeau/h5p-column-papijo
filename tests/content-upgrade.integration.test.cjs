'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const h5pJsCandidates = [
  process.env.H5P_CORE_JS_PATH,
  'C:\\wamp64\\www\\wp-h5p\\wp-content\\plugins\\h5p\\h5p-php-library\\js'
].filter(Boolean);

function findLibrary(candidates, expected) {
  return candidates.find((candidate) => {
    const libraryPath = path.join(candidate, 'library.json');
    const semanticsPath = path.join(candidate, 'semantics.json');
    if (!fs.existsSync(libraryPath) || !fs.existsSync(semanticsPath)) {
      return false;
    }

    try {
      const library = JSON.parse(fs.readFileSync(libraryPath, 'utf8'));
      return library.machineName === expected.machineName &&
        library.majorVersion === expected.majorVersion &&
        library.minorVersion === expected.minorVersion;
    }
    catch (error) {
      return false;
    }
  });
}

const dragText13Candidates = [
  process.env.H5P_DRAGTEXT_PAPIJO_13_PATH,
  path.resolve(root, '..', 'papi-jo-h5p-dragtext'),
  'C:\\my_first_h5p_environment\\libraries\\H5P.DragTextPapiJo-1.3',
  'C:\\wamp64\\www\\wp-h5p\\wp-content\\uploads\\h5p\\libraries\\H5P.DragTextPapiJo-1.3'
].filter(Boolean);
const questionSet122Candidates = [
  process.env.H5P_QUESTIONSET_PAPIJO_122_PATH,
  'C:\\wamp64\\www\\wp-h5p\\wp-content\\uploads\\h5p\\libraries\\H5P.QuestionSetPapiJo-1.22',
  'C:\\my_first_h5p_environment\\libraries\\H5P.QuestionSetPapiJo-1.22',
  path.resolve(root, '..', 'papi-jo-h5p-questionset'),
].filter(Boolean);
const questionSet123Candidates = [
  process.env.H5P_QUESTIONSET_PAPIJO_123_PATH,
  path.resolve(root, '..', 'papi-jo-h5p-questionset'),
  'C:\\my_first_h5p_environment\\libraries\\H5P.QuestionSetPapiJo-1.23'
].filter(Boolean);
const scaleQuestion02Candidates = [
  process.env.H5P_SCALEQUESTION_02_PATH,
  path.resolve(root, '..', 'papi-jo-h5p-scale-question'),
  'C:\\my_first_h5p_environment\\libraries\\H5P.ScaleQuestion-0.2'
].filter(Boolean);
const h5pJsPath = h5pJsCandidates.find((candidate) =>
  fs.existsSync(path.join(candidate, 'h5p-version.js')) &&
  fs.existsSync(path.join(candidate, 'h5p-content-upgrade-process.js'))
);
const dragTextPath = findLibrary(dragText13Candidates, {
  machineName: 'H5P.DragTextPapiJo',
  majorVersion: 1,
  minorVersion: 3
});
const questionSet122Path = findLibrary(questionSet122Candidates, {
  machineName: 'H5P.QuestionSetPapiJo',
  majorVersion: 1,
  minorVersion: 22
});
const questionSet123Path = findLibrary(questionSet123Candidates, {
  machineName: 'H5P.QuestionSetPapiJo',
  majorVersion: 1,
  minorVersion: 23
});
const scaleQuestion02Path = findLibrary(scaleQuestion02Candidates, {
  machineName: 'H5P.ScaleQuestion',
  majorVersion: 0,
  minorVersion: 2
});

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readGitJson(revision, filePath) {
  return JSON.parse(execFileSync(
    'git',
    ['show', `${revision}:${filePath}`],
    { cwd: root, encoding: 'utf8' }
  ));
}

function readColumn121Semantics() {
  const library = readJson(path.join(root, 'library.json'));
  const semantics = readJson(path.join(root, 'semantics.json'));
  const options = semantics[0].field.fields[0].options;

  assert.deepEqual(
    [library.machineName, library.majorVersion, library.minorVersion, library.patchVersion],
    ['H5P.ColumnPapiJo', 1, 21, 0]
  );
  assert.equal(options.includes('H5P.QuestionSetPapiJo 1.23'), true);
  assert.equal(options.includes('H5P.ScaleQuestion 0.2'), true);
  assert.equal(options.includes('H5P.QuestionSetPapiJo 1.22'), false);
  assert.equal(options.includes('H5P.ScaleQuestion 0.1'), false);
  assert.equal(options.includes('H5P.AdvancedTextPapiJo 1.3'), true);
  assert.equal(options.includes('H5P.AccordionPapiJo 1.2'), true);
  assert.equal(options.includes('H5P.AdvancedTextPapiJo 1.2'), false);
  assert.equal(options.includes('H5P.AccordionPapiJo 1.1'), false);
  return semantics;
}

function createUpgradeContext({ loadScaleUpgrade = false } = {}) {
  const context = vm.createContext({ H5P: {}, H5PUpgrades: {}, console, setTimeout });
  for (const file of ['h5p-version.js', 'h5p-content-upgrade-process.js']) {
    vm.runInContext(
      fs.readFileSync(path.join(h5pJsPath, file), 'utf8'),
      context,
      { filename: file }
    );
  }

  let getScaleUpgradeCalls = () => 0;
  if (loadScaleUpgrade) {
    const upgradesPath = path.join(scaleQuestion02Path, 'upgrades.js');
    vm.runInContext(
      fs.readFileSync(upgradesPath, 'utf8'),
      context,
      { filename: upgradesPath }
    );
    const upgrade = context.H5PUpgrades['H5P.ScaleQuestion'][0][2];
    assert.equal(typeof upgrade.contentUpgrade, 'function');
    const contentUpgrade = upgrade.contentUpgrade;
    let calls = 0;
    upgrade.contentUpgrade = function (parameters, finished, extras) {
      calls++;
      return contentUpgrade(parameters, finished, extras);
    };
    getScaleUpgradeCalls = () => calls;
  }

  return { context, getScaleUpgradeCalls };
}

function createDestinationLibraries({ includeQuestionSet = false, includeScale = false } = {}) {
  const libraries = new Map([
    ['H5P.ColumnPapiJo 1.21', {
      name: 'H5P.ColumnPapiJo',
      semantics: readColumn121Semantics()
    }]
  ]);

  if (includeQuestionSet) {
    libraries.set('H5P.QuestionSetPapiJo 1.23', {
      name: 'H5P.QuestionSetPapiJo',
      semantics: readJson(path.join(questionSet123Path, 'semantics.json'))
    });
  }
  if (includeScale) {
    libraries.set('H5P.ScaleQuestion 0.2', {
      name: 'H5P.ScaleQuestion',
      semantics: readJson(path.join(scaleQuestion02Path, 'semantics.json')),
      upgradesScript: 'upgrades.js'
    });
  }

  return libraries;
}

async function runColumn121Upgrade(context, fixture, libraries, id) {
  const loadRequests = [];
  const loadLibrary = (name, version, done) => {
    const key = `${name} ${version.major}.${version.minor}`;
    loadRequests.push(key);
    const library = libraries.get(key);
    setTimeout(
      () => done(library ? null : { type: 'libraryMissing', library: name }, library),
      0
    );
  };
  const result = await new Promise((resolve, reject) => {
    new context.H5P.ContentUpgradeProcess(
      'H5P.ColumnPapiJo',
      new context.H5P.Version('1.19'),
      new context.H5P.Version('1.21'),
      JSON.stringify({ params: fixture.params, metadata: fixture.metadata }),
      id,
      loadLibrary,
      (error, upgraded) => error ? reject(error) : resolve(JSON.parse(upgraded))
    );
  });

  return { result, loadRequests };
}

function makeAdvancedText(text, subContentId) {
  return {
    library: 'H5P.AdvancedText 1.1',
    params: { text },
    metadata: {
      contentType: 'Text',
      title: 'Preserved text sibling',
      license: 'U'
    },
    subContentId
  };
}

function makeTrueFalse(question, subContentId) {
  return {
    library: 'H5P.TrueFalse 1.8',
    params: {
      question,
      correct: 'true',
      behaviour: {
        enableRetry: false,
        enableSolutionsButton: true,
        enableCheckButton: true
      }
    },
    metadata: {
      contentType: 'True/False Question',
      title: 'Preserved true/false sibling',
      license: 'U'
    },
    subContentId
  };
}

function makeScaleQuestion(subContentId) {
  return {
    library: 'H5P.ScaleQuestion 0.1',
    params: {
      question: '<p>Choose the value closest to the target.</p>',
      scaleMode: 'numerical',
      minimum: -5,
      maximum: 15,
      step: 0.5,
      correctValue: 7.5,
      acceptedTolerance: 1,
      maxAttempts: 3,
      orientation: 'vertical',
      behaviour: {
        autoCheck: false,
        enableRetry: true,
        enableSolutionsButton: false
      },
      l10n: {
        scaleLabel: 'Authored numerical scale',
        selectedValue: 'Chosen value: @value',
        checkAnswer: 'Validate',
        tryAgain: 'Try once more',
        showSolution: 'Reveal answer',
        correctFeedback: 'That is correct.'
      }
    },
    metadata: {
      contentType: 'Scale Question',
      title: 'Preserved scale title',
      license: 'CC BY',
      authors: [{ name: 'Test Author', role: 'Author' }],
      changes: []
    },
    subContentId
  };
}

function makeQuestionSet(questions, subContentId) {
  return {
    library: 'H5P.QuestionSetPapiJo 1.22',
    params: {
      progressType: 'dots',
      passPercentage: 70,
      disableBackwardsNavigation: true,
      randomQuestions: false,
      questions,
      override: {
        checkButton: false,
        retryButton: 'off',
        showSolutionButton: 'on'
      },
      endGame: {
        showResultPage: true,
        showSolutionButton: true,
        showRetryButton: false,
        overallFeedback: [{ from: 0, to: 100, feedback: 'Preserved feedback' }]
      }
    },
    metadata: {
      contentType: 'Question Set',
      title: 'Preserved question set title',
      defaultLanguage: 'fr',
      license: 'CC BY-SA'
    },
    subContentId
  };
}

test(
  'version-specific discovery resolves exact current external library manifests',
  {
    skip: !questionSet123Path || !scaleQuestion02Path ?
      'QuestionSetPapiJo 1.23 or ScaleQuestion 0.2 is unavailable' : false
  },
  () => {
    const questionSet = JSON.parse(fs.readFileSync(
      path.join(questionSet123Path, 'library.json'),
      'utf8'
    ));
    const scaleQuestion = JSON.parse(fs.readFileSync(
      path.join(scaleQuestion02Path, 'library.json'),
      'utf8'
    ));

    assert.deepEqual(
      [questionSet.machineName, questionSet.majorVersion, questionSet.minorVersion],
      ['H5P.QuestionSetPapiJo', 1, 23]
    );
    assert.deepEqual(
      [scaleQuestion.machineName, scaleQuestion.majorVersion, scaleQuestion.minorVersion],
      ['H5P.ScaleQuestion', 0, 2]
    );
    assert.notEqual(questionSet122Path, questionSet123Path);
    assert.equal(findLibrary(questionSet123Candidates, {
      machineName: 'H5P.QuestionSetPapiJo',
      majorVersion: 1,
      minorVersion: 22
    }), undefined);
  }
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
  { skip: !h5pJsPath || !questionSet122Path ? 'H5P core upgrade scripts or QuestionSetPapiJo 1.22 are unavailable' : false },
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
    const columnSemantics = readGitJson('v1.19.0', 'semantics.json');
    const columnOptions = columnSemantics[0].field.fields[0].options;
    const questionSetLibrary = JSON.parse(fs.readFileSync(path.join(questionSet122Path, 'library.json'), 'utf8'));
    const questionSetSemantics = JSON.parse(fs.readFileSync(path.join(questionSet122Path, 'semantics.json'), 'utf8'));
    assert.equal(columnOptions.includes('H5P.QuestionSetPapiJo 1.22'), true);
    assert.equal(columnOptions.includes('H5P.QuestionSetPapiJo 1.23'), false);
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

test(
  'planned Column 1.21 upgrade recursively moves a direct ScaleQuestion 0.1 to 0.2',
  {
    skip: !h5pJsPath || !scaleQuestion02Path ||
      !fs.existsSync(path.join(scaleQuestion02Path, 'upgrades.js')) ?
      'H5P core upgrade scripts or ScaleQuestion 0.2 upgrade sources are unavailable' : false
  },
  async () => {
    const fixture = {
      library: 'H5P.ColumnPapiJo 1.19',
      params: {
        content: [
          {
            content: makeScaleQuestion('0a789c3e-3372-44fd-93bc-acdeedf79389'),
            useSeparator: 'enabled'
          },
          {
            content: makeAdvancedText(
              '<p>This direct sibling must remain unchanged.</p>',
              'a5237331-2480-4a02-bc1b-f5e6795a79d6'
            ),
            useSeparator: 'auto'
          }
        ]
      },
      metadata: {
        title: 'Column direct ScaleQuestion upgrade fixture',
        defaultLanguage: 'fr',
        license: 'CC BY-SA'
      }
    };
    const before = structuredClone(fixture);
    const scaleBefore = structuredClone(fixture.params.content[0].content);
    const siblingBefore = structuredClone(fixture.params.content[1]);
    const expectedParams = structuredClone(fixture.params);
    expectedParams.content[0].content.library = 'H5P.ScaleQuestion 0.2';
    const { context, getScaleUpgradeCalls } = createUpgradeContext({ loadScaleUpgrade: true });
    const libraries = createDestinationLibraries({ includeScale: true });

    const { result, loadRequests } = await runColumn121Upgrade(
      context,
      fixture,
      libraries,
      'column-direct-scale-question-upgrade'
    );

    assert.deepEqual(loadRequests, [
      'H5P.ColumnPapiJo 1.21',
      'H5P.ScaleQuestion 0.2'
    ]);
    assert.equal(getScaleUpgradeCalls(), 1);
    assert.equal(result.params.content[0].content.library, 'H5P.ScaleQuestion 0.2');
    assert.deepEqual(result.params.content[0].content.params, scaleBefore.params);
    assert.deepEqual(result.params.content[0].content.metadata, scaleBefore.metadata);
    assert.equal(result.params.content[0].content.subContentId, scaleBefore.subContentId);
    assert.deepEqual(result.params.content[1], siblingBefore);
    assert.deepEqual(result.params, expectedParams);
    assert.deepEqual(result.metadata, fixture.metadata);
    assert.deepEqual(fixture, before);
    assert.equal(fs.existsSync(path.join(root, 'upgrades.js')), false);
  }
);

test(
  'planned Column 1.21 upgrade recursively moves a direct QuestionSetPapiJo 1.22 to 1.23',
  {
    skip: !h5pJsPath || !questionSet123Path ?
      'H5P core upgrade scripts or QuestionSetPapiJo 1.23 are unavailable' : false
  },
  async () => {
    const fixture = {
      library: 'H5P.ColumnPapiJo 1.19',
      params: {
        content: [
          {
            content: makeQuestionSet([
              makeTrueFalse(
                '<p>This question must remain unchanged.</p>',
                '40cff52a-183b-4a0a-8dd8-055f23e1f75e'
              )
            ], '9a4e59bf-fc3c-49bd-93e8-e9fd52c5d13d'),
            useSeparator: 'disabled'
          },
          {
            content: makeAdvancedText(
              '<p>This QuestionSet sibling must remain unchanged.</p>',
              '4f1e5616-4193-458e-a042-f6d686a335a1'
            ),
            useSeparator: 'auto'
          }
        ]
      },
      metadata: {
        title: 'Column direct QuestionSet upgrade fixture',
        defaultLanguage: 'en',
        license: 'CC BY'
      }
    };
    const before = structuredClone(fixture);
    const questionSetBefore = structuredClone(fixture.params.content[0].content);
    const siblingBefore = structuredClone(fixture.params.content[1]);
    const expectedParams = structuredClone(fixture.params);
    expectedParams.content[0].content.library = 'H5P.QuestionSetPapiJo 1.23';
    const { context } = createUpgradeContext();
    const libraries = createDestinationLibraries({ includeQuestionSet: true });

    const { result, loadRequests } = await runColumn121Upgrade(
      context,
      fixture,
      libraries,
      'column-direct-questionset-upgrade'
    );

    assert.deepEqual(loadRequests, [
      'H5P.ColumnPapiJo 1.21',
      'H5P.QuestionSetPapiJo 1.23'
    ]);
    assert.equal(result.params.content[0].content.library, 'H5P.QuestionSetPapiJo 1.23');
    assert.deepEqual(result.params.content[0].content.params, questionSetBefore.params);
    assert.deepEqual(result.params.content[0].content.metadata, questionSetBefore.metadata);
    assert.equal(
      result.params.content[0].content.subContentId,
      questionSetBefore.subContentId
    );
    assert.deepEqual(result.params.content[1], siblingBefore);
    assert.deepEqual(result.params, expectedParams);
    assert.deepEqual(result.metadata, fixture.metadata);
    assert.deepEqual(fixture, before);
    assert.equal(fs.existsSync(path.join(root, 'upgrades.js')), false);
  }
);

test(
  'planned Column 1.21 upgrade recursively moves nested QuestionSetPapiJo and ScaleQuestion versions',
  {
    skip: !h5pJsPath || !questionSet123Path || !scaleQuestion02Path ||
      !fs.existsSync(path.join(scaleQuestion02Path, 'upgrades.js')) ?
      'H5P core, QuestionSetPapiJo 1.23, or ScaleQuestion 0.2 sources are unavailable' : false
  },
  async () => {
    const fixture = {
      library: 'H5P.ColumnPapiJo 1.19',
      params: {
        content: [
          {
            content: makeQuestionSet([
              makeScaleQuestion('8d92dabc-9e85-4e4f-a3cc-acde64b70d58'),
              makeTrueFalse(
                '<p>This nested sibling must remain unchanged.</p>',
                'ef05d55a-6f50-44bd-a84f-0fb8f3e9762c'
              )
            ], '99f5f7af-9976-4767-9a46-61c8fc6012c2'),
            useSeparator: 'enabled'
          },
          {
            content: makeAdvancedText(
              '<p>This outer sibling must remain unchanged.</p>',
              '0aac679d-8462-4eb6-b475-10301b9a9f5f'
            ),
            useSeparator: 'disabled'
          }
        ]
      },
      metadata: {
        title: 'Column recursive QuestionSet and ScaleQuestion fixture',
        defaultLanguage: 'fr',
        license: 'CC BY-SA'
      }
    };
    const before = structuredClone(fixture);
    const questionSetBefore = structuredClone(fixture.params.content[0].content);
    const scaleBefore = structuredClone(questionSetBefore.params.questions[0]);
    const nestedSiblingBefore = structuredClone(questionSetBefore.params.questions[1]);
    const outerSiblingBefore = structuredClone(fixture.params.content[1]);
    const expectedParams = structuredClone(fixture.params);
    expectedParams.content[0].content.library = 'H5P.QuestionSetPapiJo 1.23';
    expectedParams.content[0].content.params.questions[0].library = 'H5P.ScaleQuestion 0.2';
    const { context, getScaleUpgradeCalls } = createUpgradeContext({ loadScaleUpgrade: true });
    const libraries = createDestinationLibraries({
      includeQuestionSet: true,
      includeScale: true
    });

    const { result, loadRequests } = await runColumn121Upgrade(
      context,
      fixture,
      libraries,
      'column-nested-questionset-scale-question-upgrade'
    );
    const upgradedQuestionSet = result.params.content[0].content;
    const upgradedScale = upgradedQuestionSet.params.questions[0];

    assert.deepEqual(loadRequests, [
      'H5P.ColumnPapiJo 1.21',
      'H5P.QuestionSetPapiJo 1.23',
      'H5P.ScaleQuestion 0.2'
    ]);
    assert.equal(getScaleUpgradeCalls(), 1);
    assert.equal(upgradedQuestionSet.library, 'H5P.QuestionSetPapiJo 1.23');
    assert.deepEqual(upgradedQuestionSet.metadata, questionSetBefore.metadata);
    assert.equal(upgradedQuestionSet.subContentId, questionSetBefore.subContentId);
    assert.equal(upgradedScale.library, 'H5P.ScaleQuestion 0.2');
    assert.deepEqual(upgradedScale.params, scaleBefore.params);
    assert.deepEqual(upgradedScale.metadata, scaleBefore.metadata);
    assert.equal(upgradedScale.subContentId, scaleBefore.subContentId);
    assert.deepEqual(upgradedQuestionSet.params.questions[1], nestedSiblingBefore);
    assert.deepEqual(result.params.content[1], outerSiblingBefore);
    assert.deepEqual(result.params, expectedParams);
    assert.deepEqual(result.metadata, fixture.metadata);
    assert.deepEqual(fixture, before);
    assert.equal(fs.existsSync(path.join(root, 'upgrades.js')), false);
  }
);

test(
  'planned Column 1.21 upgrade preserves unaffected child versions, content, and ordering',
  { skip: !h5pJsPath ? 'H5P core upgrade scripts are unavailable' : false },
  async () => {
    const fixture = {
      library: 'H5P.ColumnPapiJo 1.19',
      params: {
        content: [
          {
            content: makeTrueFalse(
              '<p>This direct child must remain unchanged.</p>',
              'ca62d765-0915-4976-9758-35b414bd9ad2'
            ),
            useSeparator: 'enabled'
          },
          {
            content: makeAdvancedText(
              '<p>This additional sibling must remain second.</p>',
              '5799ffab-0248-4411-8f8e-16e0e5eeacb4'
            ),
            useSeparator: 'disabled'
          }
        ]
      },
      metadata: {
        title: 'Column unaffected children fixture',
        defaultLanguage: 'de',
        license: 'U'
      }
    };
    const before = structuredClone(fixture);
    const { context } = createUpgradeContext();
    const libraries = createDestinationLibraries();

    const { result, loadRequests } = await runColumn121Upgrade(
      context,
      fixture,
      libraries,
      'column-unaffected-children-upgrade'
    );

    assert.deepEqual(loadRequests, ['H5P.ColumnPapiJo 1.21']);
    assert.deepEqual(result.params, fixture.params);
    assert.deepEqual(
      result.params.content.map((entry) => entry.content.library),
      ['H5P.TrueFalse 1.8', 'H5P.AdvancedText 1.1']
    );
    assert.deepEqual(result.metadata, fixture.metadata);
    assert.deepEqual(fixture, before);
    assert.equal(fs.existsSync(path.join(root, 'upgrades.js')), false);
  }
);

const candidate = require('./helpers/column-candidate.cjs');

test('actual AdvancedText 1.3.0, editor 1.2.0 and public Accordion 1.2.0 candidates are required', () => {
  const actual = candidate.candidates();
  for (const { directory, manifest } of Object.values(actual)) {
    console.log(`Actual candidate: ${directory} (${manifest.machineName} ${manifest.majorVersion}.${manifest.minorVersion}.${manifest.patchVersion})`);
  }
  assert.equal(fs.existsSync(path.join(root, 'upgrades.js')), false);
});

test('installed WordPress main-library selection offers Column 1.20 -> 1.21 and excludes patches', () => {
  const admin = fs.readFileSync(path.join(candidate.pluginRoot, 'admin/class-h5p-library-admin.php'), 'utf8');
  assert.match(admin, /ON hl2\.name = hl1\.name/);
  assert.match(admin, /\$upgrades = \$core->getUpgrades\(\$version, \$versions\)/);
  assert.match(admin, /'versions' => \$upgrades/);
  assert.match(admin, /'name' => \$library->name/);
  assert.deepEqual(candidate.eligibility(), { 121: '1.21.0' });
  assert.deepEqual(candidate.eligibility({ ...candidate.baselineJson('library.json'), patchVersion: 99 }), {});
});

for (const managed of [false, true]) {
  for (const nested of [false, true]) {
    test(`installed UI selects Column 1.21 and recursively upgrades ${nested ? 'nested Accordion ->' : 'direct'} AdvancedText (inlineImages ${managed ? 'present' : 'absent'})`, async () => {
      const text = candidate.textChild(2, managed);
      const before = candidate.column([nested ? candidate.accordion([text]) : text]);
      const snapshot = structuredClone(before);
      const upgraded = await candidate.offeredUpgrade(before);
      assert.deepEqual(upgraded.loads, nested ? [
        'H5P.ColumnPapiJo 1.21', 'H5P.AccordionPapiJo 1.2', 'H5P.AdvancedTextPapiJo 1.3'
      ] : ['H5P.ColumnPapiJo 1.21', 'H5P.AdvancedTextPapiJo 1.3']);
      // Whole-content equality checks all params, HTML/data attributes, file stores,
      // metadata, UUIDs, parent settings, ordering, and optional-field absence.
      assert.deepEqual(upgraded.content, candidate.expectedUpgrade(before));
      const child = upgraded.content.params.content[0].content;
      assert.equal(Object.hasOwn((nested ? child.params.panels[0].content : child).params, 'inlineImages'), managed);
      assert.deepEqual(before, snapshot);
    });
  }
}

test('installed Column UI upgrades direct and nested legacy text together without changing sibling order', async () => {
  const before = candidate.column([candidate.unaffected(), candidate.textChild(2, true),
    candidate.accordion([candidate.textChild(2), candidate.textChild(3, true)]), candidate.unaffected()]);
  const upgraded = await candidate.offeredUpgrade(before);
  assert.deepEqual(upgraded.content, candidate.expectedUpgrade(before));
  assert.deepEqual(upgraded.loads, ['H5P.ColumnPapiJo 1.21', 'H5P.AdvancedTextPapiJo 1.3', 'H5P.AccordionPapiJo 1.2']);
});

test('already-current direct AdvancedText and Accordion children survive without child loading', async () => {
  const before = candidate.column([candidate.textChild(3, true),
    candidate.accordion([candidate.textChild(3), candidate.textChild(3, true)], 2), candidate.unaffected()]);
  const upgraded = await candidate.offeredUpgrade(before);
  assert.deepEqual(upgraded.loads, ['H5P.ColumnPapiJo 1.21']);
  assert.deepEqual(upgraded.content, candidate.expectedUpgrade(before));
});

test('regression: retaining Accordion 1.1 prevents the nested AdvancedText upgrade despite selecting Column 1.21', async () => {
  const broken = candidate.readJson(path.join(root, 'semantics.json'));
  const options = broken[0].field.fields[0].options;
  options[options.indexOf('H5P.AccordionPapiJo 1.2')] = 'H5P.AccordionPapiJo 1.1';
  const before = candidate.column([candidate.accordion([candidate.textChild(2, true)])]);
  const upgraded = await candidate.offeredUpgrade(before, broken);
  assert.deepEqual(upgraded.loads, ['H5P.ColumnPapiJo 1.21']);
  assert.equal(upgraded.content.params.content[0].content.library, 'H5P.AccordionPapiJo 1.1');
  assert.equal(upgraded.content.params.content[0].content.params.panels[0].content.library, 'H5P.AdvancedTextPapiJo 1.2');
  assert.notDeepEqual(upgraded.content, candidate.expectedUpgrade(before));
});
