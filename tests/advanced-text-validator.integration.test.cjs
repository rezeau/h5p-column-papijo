'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const corePath = process.env.H5P_CORE_PHP_PATH ||
  'C:/wamp64/www/wp-h5p/wp-content/plugins/h5p/h5p-php-library/h5p.classes.php';
const childPath = process.env.H5P_ADVANCEDTEXT_PAPIJO_126_PATH ||
  path.resolve(root, '..', 'papi-jo-h5p-advancedtext');
const php = process.env.H5P_PHP_BINARY || 'php';
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));

test('real H5P PHP validator accepts prospective AdvancedTextPapiJo 1.3 and rejects it with old Column semantics', {
  skip: !fs.existsSync(corePath) || !fs.existsSync(path.join(childPath, 'semantics.json')) ?
    'Installed H5P PHP core or AdvancedTextPapiJo 1.2.6 sources are unavailable' : false
}, () => {
  const columnLibrary = readJson(path.join(root, 'library.json'));
  const columnKey = `${columnLibrary.machineName} ${columnLibrary.majorVersion}.${columnLibrary.minorVersion}`;
  const subContentId = 'f62cce2e-5a86-4edb-8a42-f1ec7b777cc1';
  const input = {
    corePath,
    columnLibrary,
    columnSemantics: readJson(path.join(root, 'semantics.json')),
    oldColumnSemantics: JSON.parse(execFileSync('git', ['show', 'v1.20.0:semantics.json'], {
      cwd: root, encoding: 'utf8'
    })),
    childLibrary: readJson(path.join(childPath, 'library.json')),
    childSemantics: readJson(path.join(childPath, 'semantics.json')),
    libraryRoots: [
      process.env.H5P_LIBRARY_ROOT,
      'C:/my_first_h5p_environment/libraries',
      'C:/wamp64/www/wp-h5p/wp-content/uploads/h5p/libraries'
    ].filter(Boolean),
    content: {
      library: columnKey,
      params: {
        unknownColumnField: 'remove',
        content: [{
          content: {
            library: 'H5P.AdvancedTextPapiJo 1.3',
            subContentId,
            unknownChildAttribute: 'remove',
            params: {
              text: '<p onclick="alert(1)">Kept <strong>formatted</strong><script>alert(2)</script></p>',
              tooltipImages: [],
              inlineImages: [],
              unknownChildField: 'remove'
            },
            metadata: { title: 'Prospective text', license: 'U', unknownMetadata: 'remove' }
          },
          useSeparator: 'auto',
          unknownEntryField: 'remove'
        }]
      }
    }
  };
  const result = JSON.parse(execFileSync(php, [path.join(__dirname, 'helpers', 'advanced-text-validator.php')], {
    cwd: root,
    input: JSON.stringify(input),
    encoding: 'utf8'
  }));

  assert.equal(path.resolve(result.validatorPath), path.resolve(corePath));
  assert.equal(path.resolve(result.dependencyTraversalPath), path.resolve(corePath));
  assert.equal(result.sourceChildVersion, '1.2.6');
  const column = result.updated.content;
  assert.equal(column.library, columnKey);
  assert.equal(column.params.content.length, 1);
  const entry = column.params.content[0];
  const child = entry.content;
  assert.ok(child, 'The nested child must survive recursive validation');
  assert.equal(child.library, 'H5P.AdvancedTextPapiJo 1.3');
  assert.equal(child.subContentId, subContentId);
  assert.equal(child.metadata.title, 'Prospective text');
  assert.equal(child.metadata.license, 'U');
  assert.equal(entry.useSeparator, 'auto');
  assert.match(child.params.text, /Kept <strong>formatted<\/strong>/);
  assert.doesNotMatch(child.params.text, /onclick|<script/i);
  // H5P validateList converts empty lists to null; validateGroup removes them.
  assert.equal(Object.hasOwn(child.params, 'tooltipImages'), false);
  assert.equal(Object.hasOwn(child.params, 'inlineImages'), false);
  for (const [value, key] of [
    [column.params, 'unknownColumnField'], [entry, 'unknownEntryField'],
    [child, 'unknownChildAttribute'], [child.params, 'unknownChildField'],
    [child.metadata, 'unknownMetadata']
  ]) {
    assert.equal(Object.hasOwn(value, key), false, key);
  }
  assert.deepEqual(result.updated.errors, []);
  const dependency = result.updated.dependencies.find((item) => item.machineName === 'H5P.AdvancedTextPapiJo');
  assert.deepEqual(dependency, {
    machineName: 'H5P.AdvancedTextPapiJo', majorVersion: 1, minorVersion: 3, type: 'preloaded'
  });
  assert.ok(result.updated.dependencies.some((item) =>
    item.machineName === 'H5PEditor.AdvancedTextPapiJoTooltip' && item.type === 'editor'
  ), 'Real dependency traversal must retain the child editor dependency');
  assert.equal(result.old.directChild, null);
  assert.equal(result.old.content.params.content[0].content ?? null, null);
  assert.ok(result.old.errors.some((item) =>
    item.message.includes('H5P.AdvancedTextPapiJo 1.3') && item.message.includes('H5P.AdvancedTextPapiJo 1.2')
  ));
  assert.equal(result.old.dependencies.some((item) => item.machineName === 'H5P.AdvancedTextPapiJo'), false);
  console.log('Real PHP validator: prospective 1.3 child survives; HTML and unknown fields filtered; preloaded AdvancedTextPapiJo 1.3 dependency found; old 1.20 semantics produce null.');
});
