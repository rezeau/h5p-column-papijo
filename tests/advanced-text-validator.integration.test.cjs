'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { root, readJson, baselineJson, offeredUpgrade, textChild, accordion,
  unaffected, column, expectedUpgrade, validate } = require('./helpers/column-candidate.cjs');

function assertDependencies(result, nested = false, sibling = false) {
  assert.deepEqual(result.errors, []);
  const dependencies = result.dependencies;
  const required = [
    ['H5P.ColumnPapiJo', 1, 21, 'preloaded'],
    ['H5P.AdvancedTextPapiJo', 1, 3, 'preloaded'],
    ['H5PEditor.AdvancedTextPapiJoTooltip', 1, 2, 'editor']
  ];
  if (nested) required.push(['H5P.AccordionPapiJo', 1, 2, 'preloaded'],
    ['FontAwesome', 4, 5, 'preloaded'], ['H5PEditor.ShowWhen', 1, 0, 'editor']);
  if (sibling) required.push(['H5P.AdvancedText', 1, 1, 'preloaded']);
  assert.equal(dependencies.length, required.length);
  for (const [machineName, majorVersion, minorVersion, type] of required) {
    assert.deepEqual(dependencies.find((item) => item.machineName === machineName),
      { machineName, majorVersion, minorVersion, type });
  }
}

for (const managed of [false, true]) {
  test(`actual candidates survive installed validation after direct and nested upgrades (inlineImages ${managed ? 'present' : 'absent'})`, async () => {
    const before = column([textChild(2, managed), accordion([textChild(2, managed)]), unaffected()]);
    const upgraded = await offeredUpgrade(before);
    assert.deepEqual(upgraded.content, expectedUpgrade(before));
    const filtered = validate(upgraded.content);
    assert.deepEqual(filtered.content, upgraded.content);
    assertDependencies(filtered, true, true);
    const direct = filtered.content.params.content[0].content;
    const nested = filtered.content.params.content[1].content.params.panels[0].content;
    for (const child of [direct, nested]) {
      assert.ok(child);
      assert.equal(Object.hasOwn(child.params, 'inlineImages'), managed);
      assert.equal(child.params.tooltipImages[0].image.path, 'images/tooltip.png');
      if (managed) assert.equal(child.params.inlineImages[0].image.path, 'images/managed.png');
    }
  });
}

test('normal unsafe HTML and unknown-field filtering preserves both migrated children and managed data', async () => {
  const before = column([textChild(2, true), accordion([textChild()])]);
  const texts = [before.params.content[0].content, before.params.content[1].content.params.panels[0].content];
  before.params.unknown = 'remove';
  before.params.content[0].unknown = 'remove';
  before.params.content[1].content.params.unknown = 'remove';
  for (const child of texts) {
    child.params.text += '<script>alert(1)</script><p onclick="evil()">Safe</p><a href="javascript:evil()">Link</a>';
    child.params.unknown = 'remove';
    child.unknown = 'remove';
    child.metadata.unknown = 'remove';
    child.params.tooltipImages[0].unknown = 'remove';
    child.params.tooltipImages[0].image.unknown = 'remove';
  }
  const upgraded = await offeredUpgrade(before);
  assert.deepEqual(upgraded.content, expectedUpgrade(before), 'Upgrade must preserve data before filtering');
  const filtered = validate(upgraded.content);
  assertDependencies(filtered, true);
  const direct = filtered.content.params.content[0].content;
  const nested = filtered.content.params.content[1].content.params.panels[0].content;
  for (const [child, original] of [[direct, texts[0]], [nested, texts[1]]]) {
    assert.ok(child);
    assert.equal(child.library, 'H5P.AdvancedTextPapiJo 1.3');
    assert.equal(child.subContentId, original.subContentId);
    assert.equal(child.metadata.title, original.metadata.title);
    assert.match(child.params.text, /<strong>Rich text<\/strong>/);
    assert.match(child.params.text, /data-papijo-tooltip="Tooltip text"/);
    assert.doesNotMatch(child.params.text, /<script|onclick|javascript:/i);
    for (const object of [child, child.params, child.metadata,
      child.params.tooltipImages[0], child.params.tooltipImages[0].image]) {
      assert.equal(Object.hasOwn(object, 'unknown'), false);
    }
    assert.equal(child.params.tooltipImages[0].image.path, 'images/tooltip.png');
  }
  for (const object of [filtered.content.params, filtered.content.params.content[0],
    filtered.content.params.content[1].content.params]) assert.equal(Object.hasOwn(object, 'unknown'), false);
  assert.equal(Object.hasOwn(nested.params, 'inlineImages'), false);
  assert.deepEqual(direct.params.inlineImages, texts[0].params.inlineImages);
  assert.match(direct.params.text, /data-papijo-inline-image-id="inline-1"/);
});

test('old Column semantics reject both target children and do not retain their dependency closure', async () => {
  const upgraded = await offeredUpgrade(column([textChild(), accordion()]));
  const filtered = validate(upgraded.content, { columnSemantics: baselineJson('semantics.json') });
  for (const entry of filtered.content.params.content) assert.equal(entry.content ?? null, null);
  assert.equal(filtered.dependencies.some((item) =>
    ['H5P.AdvancedTextPapiJo', 'H5P.AccordionPapiJo'].includes(item.machineName)), false);
  for (const name of ['H5P.AdvancedTextPapiJo 1.3', 'H5P.AccordionPapiJo 1.2']) {
    assert.ok(filtered.errors.some((error) => error.message.includes(name)));
  }
});

test('regression: updating only direct AdvancedText rejects the upgraded Accordion 1.2 child', async () => {
  const upgraded = await offeredUpgrade(column([textChild(), accordion()]));
  const broken = readJson(path.join(root, 'semantics.json'));
  const options = broken[0].field.fields[0].options;
  options[options.indexOf('H5P.AccordionPapiJo 1.2')] = 'H5P.AccordionPapiJo 1.1';
  const filtered = validate(upgraded.content, { columnSemantics: broken });
  assert.equal(filtered.content.params.content[0].content.library, 'H5P.AdvancedTextPapiJo 1.3');
  assert.equal(filtered.content.params.content[1].content ?? null, null);
  assert.ok(filtered.errors.some((error) => error.message.includes('H5P.AccordionPapiJo 1.2')));
});

test('already-current children validate unchanged with the same exact dependency closure', async () => {
  const before = column([textChild(3, true), accordion([textChild(3)], 2)]);
  const upgraded = await offeredUpgrade(before);
  const filtered = validate(upgraded.content);
  assert.deepEqual(filtered.content, expectedUpgrade(before));
  assertDependencies(filtered, true);
});
