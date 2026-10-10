'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const pluginRoot = process.env.H5P_PLUGIN_ROOT || 'C:/wamp64/www/wp-test/wp-content/plugins/h5p';
const corePath = process.env.H5P_CORE_PHP_PATH || path.join(pluginRoot, 'h5p-php-library/h5p.classes.php');
const jsPath = process.env.H5P_CORE_JS_PATH || path.join(pluginRoot, 'h5p-php-library/js');
const php = process.env.H5P_PHP_BINARY || 'php';
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const baselineJson = (file) => JSON.parse(execFileSync('git', ['show', `v1.20.0:${file}`], {
  cwd: root, encoding: 'utf8'
}));

function candidate(directory, machineName, version, semantics = true) {
  const manifest = readJson(path.join(directory, 'library.json'));
  assert.deepEqual([manifest.machineName, manifest.majorVersion, manifest.minorVersion, manifest.patchVersion],
    [machineName, ...version], `Actual candidate required at ${directory}; no older-source fallback is allowed`);
  return { directory, manifest, semantics: semantics ? readJson(path.join(directory, 'semantics.json')) : [] };
}

function candidates() {
  const advanced = candidate(process.env.H5P_ADVANCEDTEXT_PAPIJO_13_PATH ||
    path.resolve(root, '..', 'papi-jo-h5p-advancedtext'), 'H5P.AdvancedTextPapiJo', [1, 3, 0]);
  const editor = candidate(process.env.H5P_ADVANCEDTEXT_PAPIJO_EDITOR_12_PATH ||
    path.join(advanced.directory, 'editor'), 'H5PEditor.AdvancedTextPapiJoTooltip', [1, 2, 0], false);
  const accordion = candidate(process.env.H5P_ACCORDION_PAPIJO_12_PATH ||
    path.resolve(root, '..', 'papi-jo-h5p-accordion'), 'H5P.AccordionPapiJo', [1, 2, 0]);
  assert.deepEqual(advanced.manifest.editorDependencies, [{
    machineName: editor.manifest.machineName, majorVersion: 1, minorVersion: 2
  }]);
  assert.ok(accordion.semantics.find((field) => field.name === 'panels')
    .field.fields.find((field) => field.name === 'content').options.includes('H5P.AdvancedTextPapiJo 1.3'));
  return { advanced, editor, accordion };
}

function probe(input) {
  const actual = candidates();
  return JSON.parse(execFileSync(php, ['-d', 'log_errors=0', '-d', 'xdebug.mode=off',
    path.join(__dirname, 'advanced-text-validator.php')], {
    cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
    input: JSON.stringify({ corePath, columnLibrary: readJson(path.join(root, 'library.json')),
      columnSemantics: readJson(path.join(root, 'semantics.json')),
      oldColumnLibrary: baselineJson('library.json'), oldColumnSemantics: baselineJson('semantics.json'),
      candidateLibraries: Object.values(actual).map(({ manifest, semantics }) => ({ manifest, semantics })),
      libraryRoots: [process.env.H5P_LIBRARY_ROOT,
        'C:/wamp64/www/wp-test/wp-content/uploads/h5p/libraries',
        'C:/my_first_h5p_environment/libraries'].filter(Boolean), ...input })
  }));
}

const libraryRow = (manifest, id) => ({ id, name: manifest.machineName,
  major_version: manifest.majorVersion, minor_version: manifest.minorVersion, patch_version: manifest.patchVersion });
function eligibility(target = readJson(path.join(root, 'library.json'))) {
  const source = libraryRow(baselineJson('library.json'), 120);
  return probe({ operation: 'eligibility', source,
    versions: [source, libraryRow({ ...baselineJson('library.json'), patchVersion: 99 }, 1299),
      libraryRow(target, 121)] });
}

// Execute the installed upgrade UI's actual click -> version selection -> batch ->
// ContentUpgradeProcess boundary. jQuery transport/UI are in-memory adapters:
// no AJAX reaches WordPress and the completed batch is captured without saving.
async function offeredUpgrade(content, semantics = readJson(path.join(root, 'semantics.json'))) {
  const actual = candidates();
  const offered = eligibility();
  assert.deepEqual(offered, { 121: '1.21.0' });
  const loads = [], invocations = [], batches = [];
  let ready, click, resolveDone, rejectDone;
  const completed = new Promise((resolve, reject) => { resolveDone = resolve; rejectDone = reject; });
  const document = {};
  const context = vm.createContext({ H5P: {}, H5PUpgrades: {}, document, window: {}, console, setTimeout });
  const realm = (value) => vm.runInContext(`(${JSON.stringify(value)})`, context);
  const chain = { html() { return this; }, append() { return this; }, appendTo() { return this; },
    text() { return this; }, val() { return '121'; }, ready(fn) { ready = fn; } };
  const $ = (selector, options) => { if (options?.click) click = options.click; return chain; };
  $.post = (url, data, done) => {
    batches.push(structuredClone(data));
    if (data.params !== undefined) {
      resolveDone(JSON.parse(JSON.parse(data.params)['fixture']));
      return;
    }
    done(realm({ left: 1, token: 'memory', params: {
      fixture: JSON.stringify({ params: content.params, metadata: content.metadata })
    }, skipped: [] }));
  };
  $.ajax = ({ url, dataType }) => ({ fail() { return this; }, done(fn) {
    try {
      if (dataType === 'script') {
        vm.runInContext(fs.readFileSync(path.join(jsPath, path.basename(url)), 'utf8'), context, { filename: url });
        const Engine = context.H5P.ContentUpgradeProcess;
        context.H5P.ContentUpgradeProcess = function (...args) {
          invocations.push([args[0], args[1].toString(), args[2].toString()]);
          return new Engine(...args);
        };
        fn();
      }
      else {
        const match = url.match(/\/([^/]+)\/(\d+)\/(\d+)$/);
        assert.ok(match, url);
        const key = `${match[1]} ${match[2]}.${match[3]}`;
        loads.push(key);
        let librarySemantics;
        if (key === 'H5P.ColumnPapiJo 1.21') librarySemantics = semantics;
        else {
          const library = Object.values(actual).find(({ manifest }) =>
            `${manifest.machineName} ${manifest.majorVersion}.${manifest.minorVersion}` === key);
          assert.ok(library, `Unexpected candidate request: ${key}`);
          assert.equal(fs.existsSync(path.join(library.directory, 'upgrades.js')), false,
            'A new child upgrade script requires explicit loading in this harness');
          librarySemantics = library.semantics;
        }
        fn(realm({ name: match[1], semantics: librarySemantics }));
      }
    }
    catch (error) { rejectDone(error); }
    return this;
  } });
  context.H5P.jQuery = $;
  context.H5PUtils = { throbber: () => chain };
  context.H5PAdminIntegration = { libraryInfo: {
    library: { name: 'H5P.ColumnPapiJo', version: '1.20' }, versions: offered,
    scriptBaseUrl: 'memory://scripts', libraryBaseUrl: 'memory://libraries', infoUrl: 'memory://batch',
    buster: '', inProgress: 'Upgrading %ver', total: 1, token: 'memory',
    error: 'Upgrade error', errorLibrary: 'Missing %lib', errorScript: 'Missing script %lib',
    errorContent: 'Invalid %id', errorNotSupported: 'Unsupported %used',
    errorTooHighVersion: 'Unsupported %used / %supported'
  } };
  for (const file of ['h5p-version.js', 'h5p-content-upgrade.js']) {
    vm.runInContext(fs.readFileSync(path.join(jsPath, file), 'utf8'), context, { filename: file });
  }
  ready();
  click();
  const output = await completed;
  assert.deepEqual(invocations, [['H5P.ColumnPapiJo', '1.20', '1.21.0']]);
  assert.equal(batches[0].libraryId, '121');
  assert.equal(batches[1].libraryId, '121');
  assert.deepEqual(JSON.parse(batches[1].skipped), []);
  return { content: { ...structuredClone(content), library: 'H5P.ColumnPapiJo 1.21', ...output },
    loads, invocations, offered };
}

function textChild(minor = 2, managed = false) {
  const params = {
    text: '<p><strong>Rich text</strong> &amp; accents é ' +
      '<span class="papijo-tooltip" data-papijo-tooltip="Tooltip text" ' +
      'data-papijo-tooltip-id="tip-1">Hover</span></p>',
    tooltipImages: [{ id: 'tip-1', alt: 'Tooltip image', image: {
      path: 'images/tooltip.png', mime: 'image/png', width: 80, height: 40
    } }]
  };
  if (managed) {
    params.text += '<p><span class="papijo-inline-image" data-papijo-inline-image-id="inline-1" ' +
      'data-papijo-inline-image-width="75" data-papijo-inline-image-style="alignLeft" ' +
      'data-papijo-inline-image-link="https://example.org/image">' +
      '<span class="papijo-image-caption">Photo caption</span></span></p>';
    params.inlineImages = [{ id: 'inline-1', alt: 'Managed image', image: {
      path: 'images/managed.png', mime: 'image/png', width: 120, height: 60
    } }];
  }
  return { library: `H5P.AdvancedTextPapiJo 1.${minor}`, params,
    subContentId: managed ? '9fc11e3f-e374-484e-88bb-69462fca2dbe' : 'f62cce2e-5a86-4edb-8a42-f1ec7b777cc1',
    metadata: { title: 'Preserved text', license: 'U', authors: [{ name: 'Author', role: 'Author' }] } };
}
function accordion(children = [textChild()], minor = 1) {
  return { library: `H5P.AccordionPapiJo 1.${minor}`,
    params: { accordionTitle: 'Navigation', hTag: 'h3',
      panels: children.map((content, index) => ({ title: `Panel ${index + 1}`, content })) },
    subContentId: '67d731c4-b62d-4e42-b030-d976f407a39f', metadata: { title: 'Accordion title', license: 'U' } };
}
const unaffected = () => ({ library: 'H5P.AdvancedText 1.1', params: { text: '<p>Unaffected sibling</p>' },
  subContentId: '4eb33cef-b6e7-4f17-a010-587380c3b728', metadata: { title: 'Sibling', license: 'U' } });
const column = (children) => ({ library: 'H5P.ColumnPapiJo 1.20', metadata: { title: 'Column title', license: 'U' },
  params: { content: children.map((content, index) => ({ content, useSeparator: ['auto', 'enabled', 'disabled'][index % 3] })) } });
function expectedUpgrade(content) {
  const expected = structuredClone(content);
  expected.library = 'H5P.ColumnPapiJo 1.21';
  for (const { content: child } of expected.params.content) {
    if (child.library === 'H5P.AdvancedTextPapiJo 1.2') child.library = 'H5P.AdvancedTextPapiJo 1.3';
    if (child.library === 'H5P.AccordionPapiJo 1.1') {
      child.library = 'H5P.AccordionPapiJo 1.2';
      for (const panel of child.params.panels) {
        if (panel.content.library === 'H5P.AdvancedTextPapiJo 1.2') panel.content.library = 'H5P.AdvancedTextPapiJo 1.3';
      }
    }
  }
  return expected;
}
const validate = (content, overrides = {}) => probe({ operation: 'validate', content, ...overrides });

module.exports = { root, pluginRoot, corePath, jsPath, readJson, baselineJson, candidates, eligibility,
  offeredUpgrade, textChild, accordion, unaffected, column, expectedUpgrade, validate };
