'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { createHarness } = require('./helpers/h5p-harness.cjs');

test('constructor normalizes defaults, inherits EventDispatcher, and starts activity', () => {
  const harness = createHarness();
  const params = {};
  const column = harness.instantiate(params);

  assert.equal(params.useSeparators, true);
  assert.equal(params.content.length, 0);
  assert.ok(column instanceof harness.H5P.EventDispatcher);
  assert.equal(column._activityStartedCount, 1);
  assert.deepEqual(Array.from(column.getInstances()), []);
  assert.equal(harness.newRunnableCalls.length, 0);
});

test('children are instantiated eagerly during construction in source order', () => {
  const harness = createHarness();
  const params = {
    content: [
      harness.makeColumnEntry('H5P.AdvancedText 1.1'),
      harness.makeColumnEntry('H5P.Image 1.1'),
      harness.makeColumnEntry('H5P.DragTextPapiJo 1.2')
    ]
  };

  const column = harness.instantiate(params);
  assert.equal(harness.newRunnableCalls.length, 3);
  assert.deepEqual(Array.from(column.getInstances(), (child) => child.libraryInfo.machineName), [
    'H5P.AdvancedText',
    'H5P.Image',
    'H5P.DragTextPapiJo'
  ]);
  assert.deepEqual(Array.from(column.getInstances(), (child) => child.attachCalls.length), [0, 0, 0]);
});

test('newRunnable receives the original content object and current call signature', () => {
  const harness = createHarness();
  const content = harness.makeContent(
    'H5P.DragQuestionPapiJo 1.14',
    { question: 'current' },
    { subContentId: 'sub-123' }
  );
  const params = { content: [{ content }] };
  const previousState = { answer: 'stored' };
  const column = harness.instantiate(params, 91, { previousState: { instances: [previousState] } });
  const call = harness.newRunnableCalls[0];

  assert.strictEqual(call.content, content);
  assert.equal(call.contentId, 91);
  assert.equal(call.subContentId, undefined);
  assert.equal(call.skipResize, true);
  assert.strictEqual(call.contentData.parent, column);
  assert.strictEqual(call.contentData.previousState, previousState);
  assert.equal(call.content.subContentId, 'sub-123');
});

test('invalid semantic entries are skipped and never passed to newRunnable', () => {
  const harness = createHarness();
  const params = {
    content: [
      {},
      harness.makeColumnEntry('H5P.AdvancedTextPapiJo 1.1'),
      { useSeparator: 'disabled' }
    ]
  };
  const column = harness.instantiate(params);

  assert.equal(harness.newRunnableCalls.length, 1);
  assert.equal(column.getInstances().length, 1);
  assert.equal(column.getInstances()[0].libraryInfo.machineName, 'H5P.AdvancedTextPapiJo');
});

test('getInstances returns the internal mutable instance array, not a copy', () => {
  const harness = createHarness();
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.AdvancedText 1.1')]
  });

  const first = column.getInstances();
  const second = column.getInstances();
  assert.strictEqual(first, second);
  first.push({ marker: 'external mutation' });
  assert.equal(column.getInstances().length, 2);
  assert.equal(column.getInstances()[1].marker, 'external mutation');
});

test('first attach clears the target, appends one wrapper, and attaches each child', () => {
  const harness = createHarness();
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.AdvancedText 1.1'),
      harness.makeColumnEntry('H5P.Image 1.1')
    ]
  });
  const target = harness.createContainer();
  target.element.appendChild(new harness.MiniElement('p'));

  column.attach(target.$element);

  assert.deepEqual(target.$element.htmlCalls, ['']);
  assert.equal(target.element.children.length, 1);
  assert.ok(target.element.classList.contains('h5p-column'));
  assert.ok(target.element.classList.contains('h5p-theme'));
  assert.deepEqual(Array.from(column.getInstances(), (child) => child.attachCalls.length), [1, 1]);
});

test('repeated attach to the same target reuses the wrapper without reattaching children', () => {
  const harness = createHarness();
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.AdvancedText 1.1')]
  });
  const target = harness.createContainer();
  const instances = column.getInstances();

  column.attach(target.$element);
  const wrapper = target.element.children[0];
  const child = instances[0];
  const childContainer = child.attachCalls[0].element;
  column.attach(target.$element);

  assert.strictEqual(target.element.children[0], wrapper);
  assert.strictEqual(column.getInstances(), instances);
  assert.strictEqual(column.getInstances()[0], child);
  assert.equal(child.attachCalls.length, 1);
  assert.strictEqual(child.attachCalls[0].element, childContainer);
  assert.deepEqual(target.$element.htmlCalls, ['', '']);
});

test('attach to a different target moves the wrapper without reattaching children', () => {
  const harness = createHarness();
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.AdvancedText 1.1')]
  });
  const instances = column.getInstances();
  const child = instances[0];
  const firstTarget = harness.createContainer();
  const secondTarget = harness.createContainer();

  column.attach(firstTarget.$element);
  const wrapper = firstTarget.element.children[0];
  column.attach(secondTarget.$element);

  assert.equal(firstTarget.element.children.length, 0);
  assert.strictEqual(secondTarget.element.children[0], wrapper);
  assert.strictEqual(column.getInstances(), instances);
  assert.strictEqual(column.getInstances()[0], child);
  assert.equal(child.attachCalls.length, 1);
});

test('three or more repeated attaches still attach each child only once', () => {
  const harness = createHarness();
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.AdvancedText 1.1')]
  });
  const firstTarget = harness.createContainer();
  const secondTarget = harness.createContainer();

  column.attach(firstTarget.$element);
  column.attach(firstTarget.$element);
  column.attach(secondTarget.$element);
  column.attach(secondTarget.$element);

  assert.equal(column.getInstances()[0].attachCalls.length, 1);
  assert.equal(firstTarget.element.children.length, 0);
  assert.equal(secondTarget.element.children.length, 1);
});

test('multiple children each attach once across repeated target changes', () => {
  const harness = createHarness();
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.AdvancedText 1.1'),
      harness.makeColumnEntry('H5P.Image 1.1'),
      harness.makeColumnEntry('H5P.Blanks 1.14')
    ]
  });
  const firstTarget = harness.createContainer();
  const secondTarget = harness.createContainer();

  column.attach(firstTarget.$element);
  column.attach(firstTarget.$element);
  column.attach(secondTarget.$element);

  assert.deepEqual(Array.from(column.getInstances(), (child) => child.attachCalls.length), [1, 1, 1]);
});

test('getScore and getMaxScore return zero with no children', () => {
  const column = createHarness().instantiate({ content: [] });
  assert.equal(column.getScore(), 0);
  assert.equal(column.getMaxScore(), 0);
});

test('getScore and getMaxScore aggregate direct child values and ignore missing methods', () => {
  const harness = createHarness({
    childSpecs: [
      { score: 2, maxScore: 3 },
      {},
      { score: 4, maxScore: 7 }
    ]
  });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.Blanks 1.14'),
      harness.makeColumnEntry('H5P.AdvancedText 1.1'),
      harness.makeColumnEntry('H5P.MultiChoice 1.16')
    ]
  });

  assert.equal(column.getScore(), 6);
  assert.equal(column.getMaxScore(), 10);
});

test('score aggregation preserves unusual undefined and string results', () => {
  const undefinedHarness = createHarness({ childSpecs: [{ score: undefined, maxScore: undefined }] });
  const undefinedColumn = undefinedHarness.instantiate({
    content: [undefinedHarness.makeColumnEntry('H5P.Blanks 1.14')]
  });
  assert.ok(Number.isNaN(undefinedColumn.getScore()));
  assert.ok(Number.isNaN(undefinedColumn.getMaxScore()));

  const stringHarness = createHarness({ childSpecs: [{ score: '2', maxScore: '3' }] });
  const stringColumn = stringHarness.instantiate({
    content: [stringHarness.makeColumnEntry('H5P.Blanks 1.14')]
  });
  assert.equal(stringColumn.getScore(), '02');
  assert.equal(stringColumn.getMaxScore(), '03');
});

test('getAnswerGiven returns true with no children or children without the method', () => {
  const empty = createHarness().instantiate({ content: [] });
  assert.equal(empty.getAnswerGiven(), true);

  const harness = createHarness({ childSpecs: [{}] });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.AdvancedText 1.1')]
  });
  assert.equal(column.getAnswerGiven(), true);
});

test('getAnswerGiven requires every implementing direct child to be answered', () => {
  const allHarness = createHarness({ childSpecs: [{ answerGiven: true }, { answerGiven: true }] });
  const all = allHarness.instantiate({
    content: [
      allHarness.makeColumnEntry('H5P.Blanks 1.14'),
      allHarness.makeColumnEntry('H5P.MultiChoice 1.16')
    ]
  });
  assert.equal(all.getAnswerGiven(), true);

  const mixedHarness = createHarness({ childSpecs: [{ answerGiven: true }, {}, { answerGiven: false }] });
  const mixed = mixedHarness.instantiate({
    content: [
      mixedHarness.makeColumnEntry('H5P.Blanks 1.14'),
      mixedHarness.makeColumnEntry('H5P.AdvancedText 1.1'),
      mixedHarness.makeColumnEntry('H5P.MultiChoice 1.16')
    ]
  });
  assert.equal(mixed.getAnswerGiven(), false);
});

test('showSolutions delegates in child order and skips children without the method', () => {
  const calls = [];
  const harness = createHarness({
    childSpecs: [
      { showSolutions() { calls.push('first'); } },
      {},
      { showSolutions() { calls.push('third'); } }
    ]
  });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.Blanks 1.14'),
      harness.makeColumnEntry('H5P.AdvancedText 1.1'),
      harness.makeColumnEntry('H5P.MultiChoice 1.16')
    ]
  });

  column.showSolutions();
  assert.deepEqual(calls, ['first', 'third']);
});

test('showSolutions brackets capable children with ReadSpeaker toggles', () => {
  const calls = [];
  const harness = createHarness({
    childSpecs: [{
      toggleReadSpeaker(value) { calls.push(`reader:${value}`); },
      showSolutions() { calls.push('solutions'); }
    }]
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.Blanks 1.14')]
  });

  column.showSolutions();
  assert.deepEqual(calls, ['reader:true', 'solutions', 'reader:false']);
});

test('resetTask delegates in child order and skips children without resetTask', () => {
  const calls = [];
  const harness = createHarness({
    childSpecs: [
      { resetTask() { calls.push('first'); } },
      {},
      { resetTask() { calls.push('third'); } }
    ]
  });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.Blanks 1.14'),
      harness.makeColumnEntry('H5P.AdvancedText 1.1'),
      harness.makeColumnEntry('H5P.MultiChoice 1.16')
    ]
  });

  column.resetTask();
  assert.deepEqual(calls, ['first', 'third']);
});

test('reset clears completion caches and requires every task to complete again', () => {
  const resets = [];
  const harness = createHarness({
    childSpecs: [
      { isTask: true, resetTask() { resets.push('first'); } },
      { isTask: true, resetTask() { resets.push('second'); } }
    ]
  });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.CustomTaskA 1.0'),
      harness.makeColumnEntry('H5P.CustomTaskB 1.0')
    ]
  });
  const [first, second] = column.getInstances();

  first.emitScored(1, 2);
  second.emitScored(2, 3);
  harness.flushTimers();
  assert.deepEqual(column._triggerXAPIScoredCalls.map(({ raw, max }) => ({ raw, max })), [{ raw: 3, max: 5 }]);

  column.resetTask();
  assert.deepEqual(resets, ['first', 'second']);
  first.emitScored(0, 2);
  harness.flushTimers();

  assert.deepEqual(column._triggerXAPIScoredCalls.map(({ raw, max }) => ({ raw, max })), [
    { raw: 3, max: 5 }
  ]);

  second.emitScored(1, 3);
  harness.flushTimers();

  assert.deepEqual(column._triggerXAPIScoredCalls.map(({ raw, max }) => ({ raw, max })), [
    { raw: 3, max: 5 },
    { raw: 1, max: 5 }
  ]);
});

test('repeated reset is safe and invalidates deferred completion from older attempts', () => {
  const harness = createHarness({ childSpecs: [{ isTask: true }, { isTask: true }] });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.CustomTaskA 1.0'),
      harness.makeColumnEntry('H5P.CustomTaskB 1.0')
    ]
  });
  const [first, second] = column.getInstances();

  first.emitScored(5, 5);
  second.emitScored(5, 5);
  assert.equal(harness.timerQueue.length, 1);

  column.resetTask();
  column.resetTask();
  harness.flushTimers();
  assert.equal(column._triggerXAPIScoredCalls, undefined);

  first.emitScored(1, 5);
  harness.flushTimers();
  assert.equal(column._triggerXAPIScoredCalls, undefined);
  second.emitScored(2, 5);
  harness.flushTimers();
  assert.deepEqual(column._triggerXAPIScoredCalls.map(({ raw, max }) => ({ raw, max })), [
    { raw: 3, max: 10 }
  ]);
});

test('one recognized task emits one deferred aggregate completed event', () => {
  const harness = createHarness({ childSpecs: [{ isTask: true }] });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.CustomTask 1.0')]
  });
  const parentXAPIVerbs = [];
  column.on('xAPI', (event) => parentXAPIVerbs.push(event.verb));
  const childEvent = column.getInstances()[0].emitScored(2, 4);

  assert.equal(column._triggerXAPIScoredCalls, undefined);
  assert.equal(harness.timerQueue.length, 1);
  harness.flushTimers();

  const aggregate = column._triggerXAPIScoredCalls[0];
  assert.deepEqual({ raw: aggregate.raw, max: aggregate.max, verb: aggregate.verb }, {
    raw: 2,
    max: 4,
    verb: 'completed'
  });
  assert.equal(aggregate.event.data.statement.result.completion, true);
  assert.equal(aggregate.event.data.statement.result.success, false);
  assert.equal(childEvent.getScore(), 2);
  assert.deepEqual(parentXAPIVerbs, ['progressed', 'completed']);
});

test('a task xAPI event with null score is ignored', () => {
  const harness = createHarness({ childSpecs: [{ isTask: true }] });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.CustomTask 1.0')]
  });

  column.getInstances()[0].emitScored(null, 4);
  harness.flushTimers();
  assert.equal(harness.timerQueue.length, 0);
  assert.equal(column._triggerXAPIScoredCalls, undefined);
  assert.deepEqual(column._createdXAPIEvents || [], []);
});

test('duplicate scores from one task update its cache but do not complete multiple tasks', () => {
  const harness = createHarness({ childSpecs: [{ isTask: true }, { isTask: true }] });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.CustomTaskA 1.0'),
      harness.makeColumnEntry('H5P.CustomTaskB 1.0')
    ]
  });
  const [first, second] = column.getInstances();

  first.emitScored(1, 2);
  first.emitScored(2, 2);
  harness.flushTimers();
  assert.equal(column._triggerXAPIScoredCalls, undefined);

  second.emitScored(3, 4);
  harness.flushTimers();
  assert.deepEqual(column._triggerXAPIScoredCalls.map(({ raw, max }) => ({ raw, max })), [{ raw: 5, max: 6 }]);
});

test('multiple tasks can complete in reverse order and retain task-index aggregation', () => {
  const harness = createHarness({ childSpecs: [{ isTask: true }, { isTask: true }] });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.CustomTaskA 1.0'),
      harness.makeColumnEntry('H5P.CustomTaskB 1.0')
    ]
  });
  const [first, second] = column.getInstances();

  second.emitScored(4, 5);
  first.emitScored(1, 2);
  harness.flushTimers();
  assert.deepEqual(column._triggerXAPIScoredCalls.map(({ raw, max }) => ({ raw, max })), [{ raw: 5, max: 7 }]);
});

test('a Column with no recognized tasks never emits aggregate completion', () => {
  const harness = createHarness({ childSpecs: [{}] });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.AdvancedText 1.1')]
  });

  column.getInstances()[0].emitScored(1, 1);
  harness.flushTimers();
  assert.equal(column._triggerXAPIScoredCalls, undefined);
});

test('instance.isTask takes precedence for task recognition', () => {
  const trueHarness = createHarness({ childSpecs: [{ isTask: true }] });
  const trueColumn = trueHarness.instantiate({
    content: [trueHarness.makeColumnEntry('H5P.UnknownTask 1.0')]
  });
  assert.equal(trueColumn.getInstances()[0].listenerCount('xAPI'), 1);

  const falseHarness = createHarness({ childSpecs: [{ isTask: false }] });
  const falseColumn = falseHarness.instantiate({
    content: [falseHarness.makeColumnEntry('H5P.DragTextPapiJo 1.2')]
  });
  assert.equal(falseColumn.getInstances()[0].listenerCount('xAPI'), 0);
});

test('all four PapiJo fallback task names are recognized without instance.isTask', () => {
  const names = [
    'H5P.DragQuestionPapiJo',
    'H5P.DragTextPapiJo',
    'H5P.MarkTheWordsPapiJo',
    'H5P.MultiMediaChoicePapiJo'
  ];

  for (const name of names) {
    const harness = createHarness({ childSpecs: [{}] });
    const column = harness.instantiate({
      content: [harness.makeColumnEntry(`${name} 1.0`)]
    });
    assert.equal(column.getInstances()[0].listenerCount('xAPI'), 1, name);
  }
});

test('QuestionSetPapiJo is recognized by fallback without instance.isTask', () => {
  const absentHarness = createHarness({ childSpecs: [{}] });
  const absent = absentHarness.instantiate({
    content: [absentHarness.makeColumnEntry('H5P.QuestionSetPapiJo 1.21')]
  });
  assert.equal(absent.getInstances()[0].listenerCount('xAPI'), 1);

  const explicitHarness = createHarness({ childSpecs: [{ isTask: true }] });
  const explicit = explicitHarness.instantiate({
    content: [explicitHarness.makeColumnEntry('H5P.QuestionSetPapiJo 1.21')]
  });
  assert.equal(explicit.getInstances()[0].listenerCount('xAPI'), 1);
});

test('Row task discovery assumes exactly Row -> row column -> task nesting', () => {
  let nestedTasks;
  const harness = createHarness({
    childFactory(content, index, helpers) {
      nestedTasks = [
        helpers.makeChild({ machineName: 'H5P.Blanks', isTask: true }),
        helpers.makeChild({ machineName: 'H5P.DragTextPapiJo' })
      ];
      const rowColumn = {
        getInstances() {
          return nestedTasks;
        }
      };
      return helpers.makeChild({
        machineName: 'H5P.Row',
        getInstances() {
          return [rowColumn];
        }
      });
    }
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.Row 1.3')]
  });

  assert.equal(column.getInstances().length, 1);
  assert.deepEqual(nestedTasks.map((task) => task.listenerCount('xAPI')), [1, 1]);
  nestedTasks[0].emitScored(1, 2);
  nestedTasks[1].emitScored(2, 3);
  harness.flushTimers();
  assert.deepEqual(column._triggerXAPIScoredCalls.map(({ raw, max }) => ({ raw, max })), [{ raw: 3, max: 5 }]);
});

test('Row construction throws when the expected getInstances API is missing', () => {
  const harness = createHarness({ childSpecs: [{}] });
  assert.throws(
    () => harness.instantiate({
      content: [harness.makeColumnEntry('H5P.Row 1.3')]
    }),
    (error) => error.name === 'TypeError' && /getInstances is not a function/.test(error.message)
  );
});

test('getCurrentState returns an empty instances array for zero children', () => {
  const column = createHarness().instantiate({ content: [] }, 17, {});
  const state = column.getCurrentState();
  assert.deepEqual(Array.from(state.instances), []);
});

test('getCurrentState saves dense content in matching semantic positions', () => {
  const harness = createHarness({
    childSpecs: [
      { currentState: { answer: 'one' } },
      {},
      { currentState: { answer: 'three' } }
    ]
  });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.Blanks 1.14'),
      harness.makeColumnEntry('H5P.AdvancedText 1.1'),
      harness.makeColumnEntry('H5P.MultiChoice 1.16')
    ]
  });
  const state = column.getCurrentState();

  assert.deepEqual(state.instances[0], { answer: 'one' });
  assert.equal(1 in state.instances, false);
  assert.deepEqual(state.instances[2], { answer: 'three' });
});

test('getCurrentState reuses and mutates the supplied previousState object', () => {
  const previousState = { instances: [{ old: true }], marker: 'same object' };
  const harness = createHarness({ childSpecs: [{ currentState: { fresh: true } }] });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.Blanks 1.14')]
  }, 17, { previousState });

  const state = column.getCurrentState();
  assert.strictEqual(state, previousState);
  assert.deepEqual(previousState.instances[0], { fresh: true });
  assert.equal(previousState.marker, 'same object');
});

test('a skipped first semantic entry keeps restoration and saving at the original index', () => {
  const slotZero = { slot: 0 };
  const slotOne = { slot: 1 };
  const previousState = { instances: [slotZero, slotOne] };
  const harness = createHarness({ childSpecs: [{ currentState: { saved: 'dense-zero' } }] });
  const column = harness.instantiate({
    content: [
      {},
      harness.makeColumnEntry('H5P.Blanks 1.14')
    ]
  }, 17, { previousState });

  assert.strictEqual(harness.newRunnableCalls[0].contentData.previousState, slotOne);
  const state = column.getCurrentState();
  assert.strictEqual(state.instances[0], slotZero);
  assert.deepEqual(state.instances[1], { saved: 'dense-zero' });
});

test('a skipped semantic entry between children preserves both semantic state slots', () => {
  const previousState = {
    instances: [
      { previous: 'first' },
      { previous: 'skipped' },
      { previous: 'third' }
    ]
  };
  const harness = createHarness({
    childSpecs: [
      { currentState: { current: 'first' } },
      { currentState: { current: 'third' } }
    ]
  });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.Blanks 1.14'),
      {},
      harness.makeColumnEntry('H5P.MultiChoice 1.16')
    ]
  }, 17, { previousState });

  assert.equal(harness.newRunnableCalls[0].contentData.previousState.previous, 'first');
  assert.equal(harness.newRunnableCalls[1].contentData.previousState.previous, 'third');
  const state = column.getCurrentState();
  assert.deepEqual(state.instances[0], { current: 'first' });
  assert.deepEqual(state.instances[1], { previous: 'skipped' });
  assert.deepEqual(state.instances[2], { current: 'third' });
});

test('a skipped last semantic entry does not displace the preceding child state', () => {
  const previousState = {
    instances: [{ previous: 'first' }, { previous: 'skipped-last' }]
  };
  const harness = createHarness({ childSpecs: [{ currentState: { current: 'first' } }] });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.Blanks 1.14'),
      {}
    ]
  }, 17, { previousState });

  const state = column.getCurrentState();
  assert.deepEqual(state.instances[0], { current: 'first' });
  assert.deepEqual(state.instances[1], { previous: 'skipped-last' });
});

test('state save and restore round-trip retains semantic-slot alignment', () => {
  const firstHarness = createHarness({
    childSpecs: [
      { currentState: { answer: 'first' } },
      { currentState: { answer: 'third' } }
    ]
  });
  const firstColumn = firstHarness.instantiate({
    content: [
      firstHarness.makeColumnEntry('H5P.Blanks 1.14'),
      {},
      firstHarness.makeColumnEntry('H5P.MultiChoice 1.16')
    ]
  });
  const saved = firstColumn.getCurrentState();

  const secondHarness = createHarness();
  secondHarness.instantiate({
    content: [
      secondHarness.makeColumnEntry('H5P.Blanks 1.14'),
      {},
      secondHarness.makeColumnEntry('H5P.MultiChoice 1.16')
    ]
  }, 17, { previousState: saved });

  assert.deepEqual(secondHarness.newRunnableCalls[0].contentData.previousState, { answer: 'first' });
  assert.deepEqual(secondHarness.newRunnableCalls[1].contentData.previousState, { answer: 'third' });
  assert.equal(1 in saved.instances, false);
});

test('previous-state restoration handles absent and shorter state arrays without adding state', () => {
  const absentHarness = createHarness();
  absentHarness.instantiate({
    content: [absentHarness.makeColumnEntry('H5P.AdvancedText 1.1')]
  }, 17, {});
  assert.equal(Object.hasOwn(absentHarness.newRunnableCalls[0].contentData, 'previousState'), false);

  const shortHarness = createHarness();
  shortHarness.instantiate({
    content: [
      shortHarness.makeColumnEntry('H5P.AdvancedText 1.1'),
      shortHarness.makeColumnEntry('H5P.Image 1.1')
    ]
  }, 17, { previousState: { instances: [{ slot: 0 }] } });
  assert.deepEqual(shortHarness.newRunnableCalls[0].contentData.previousState, { slot: 0 });
  assert.equal(Object.hasOwn(shortHarness.newRunnableCalls[1].contentData, 'previousState'), false);
});

test('getXAPIData returns a compound parent statement and ordinary child data', () => {
  const childData = { statement: { id: 'child' } };
  const harness = createHarness({
    childSpecs: [
      { score: 2, maxScore: 4, getXAPIData() { return childData; } },
      {}
    ]
  });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.Blanks 1.14'),
      harness.makeColumnEntry('H5P.AdvancedText 1.1')
    ]
  });
  const data = column.getXAPIData();

  assert.equal(data.statement.object.definition.interactionType, 'compound');
  assert.equal(data.statement.object.definition.type, 'http://adlnet.gov/expapi/activities/cmi.interaction');
  assert.strictEqual(data.children[0], childData);
  assert.equal(data.children.length, 1);
  assert.deepEqual(data.statement.result.score, { raw: 2, max: 4 });
  assert.equal(data.statement.result.completion, true);
  assert.equal(data.statement.result.success, false);
});

test('getXAPIData marks zero score over zero max as successful', () => {
  const column = createHarness().instantiate({ content: [] });
  const data = column.getXAPIData();

  assert.deepEqual(Array.from(data.children), []);
  assert.deepEqual(data.statement.result.score, { raw: 0, max: 0 });
  assert.equal(data.statement.result.completion, true);
  assert.equal(data.statement.result.success, true);
});

test('getXAPIData uses the Row-specific child extraction path', () => {
  const rowChildren = [{ statement: { id: 'nested-a' } }, { statement: { id: 'nested-b' } }];
  const harness = createHarness({
    childFactory(content, index, helpers) {
      return helpers.makeChild({
        machineName: 'H5P.Row',
        getInstances() { return []; },
        getXAPIDataFromChildren() { return rowChildren; }
      });
    }
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.Row 1.3')]
  });

  assert.deepEqual(Array.from(column.getXAPIData().children), rowChildren);
});

test('getXAPIData throws when Row lacks getXAPIDataFromChildren', () => {
  const harness = createHarness({
    childFactory(content, index, helpers) {
      return helpers.makeChild({ machineName: 'H5P.Row', getInstances() { return []; } });
    }
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.Row 1.3')]
  });
  assert.throws(
    () => column.getXAPIData(),
    (error) => error.name === 'TypeError' && /getXAPIDataFromChildren is not a function/.test(error.message)
  );
});

test('child resize bubbles once to Column with bubblingUpwards set during dispatch', () => {
  const harness = createHarness();
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.AdvancedText 1.1')]
  });
  const child = column.getInstances()[0];
  const observations = [];
  column.on('resize', () => observations.push(column.bubblingUpwards));

  child.trigger('resize', { source: 'child' });

  assert.deepEqual(observations, [true]);
  assert.equal(column.bubblingUpwards, false);
});

test('Column resize propagates to all children and produces bounded bounce-back events', () => {
  const harness = createHarness();
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.AdvancedText 1.1'),
      harness.makeColumnEntry('H5P.Image 1.1')
    ]
  });
  const childCounts = [0, 0];
  column.getInstances().forEach((child, index) => child.on('resize', () => childCounts[index]++));
  let parentCount = 0;
  column.on('resize', () => parentCount++);

  column.trigger('resize', { source: 'parent' });

  assert.deepEqual(childCounts, [1, 1]);
  assert.equal(parentCount, 3);
  assert.equal(column.bubblingUpwards, false);
});

test('Video construction forces visuals.fit to false', () => {
  const harness = createHarness();
  let fit = true;
  let fitAssignments = 0;
  const visuals = {};
  Object.defineProperty(visuals, 'fit', {
    get() { return fit; },
    set(value) {
      fit = value;
      fitAssignments++;
    }
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.Video 1.6', { visuals })]
  });
  const target = harness.createContainer();
  column.attach(target.$element);
  column.attach(target.$element);
  column.attach(target.$element);

  assert.equal(visuals.fit, false);
  assert.equal(fitAssignments, 1);
  assert.equal(column.getInstances()[0].attachCalls.length, 1);
});

test('Image loaded event triggers a Column resize', () => {
  const harness = createHarness();
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.Image 1.1')]
  });
  const target = harness.createContainer();
  const image = column.getInstances()[0];
  const loadedListeners = image.listenerCount('loaded');
  const resizeListeners = image.listenerCount('resize');
  column.attach(target.$element);
  column.attach(target.$element);
  let parentResizeCount = 0;
  column.on('resize', () => parentResizeCount++);

  assert.equal(image.listenerCount('loaded'), loadedListeners);
  assert.equal(image.listenerCount('resize'), resizeListeners);
  assert.equal(image.attachCalls.length, 1);
  image.trigger('loaded');
  assert.equal(parentResizeCount, 2);
});

test('Collage animation-frame cleanup removes style from its box container', () => {
  const harness = createHarness();
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.Collage 0.3')]
  });
  const target = harness.createContainer();
  column.attach(target.$element);
  column.attach(target.$element);
  const wrapper = target.element.children[0];
  const boxContainer = wrapper.children[0];
  boxContainer.setAttribute('style', 'height: 10px');

  assert.equal(harness.animationFrameQueue.length, 1);
  assert.equal(column.getInstances()[0].attachCalls.length, 1);
  harness.flushAnimationFrames();
  assert.equal(boxContainer.hasAttribute('style'), false);
});

test('CoursePresentation fullscreen button is removed during attach', () => {
  let removes = 0;
  const harness = createHarness({
    childSpecs: [{$fullScreenButton: { remove() { removes++; } }}]
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.CoursePresentation 1.27')]
  });

  const target = harness.createContainer();
  column.attach(target.$element);
  column.attach(target.$element);
  column.attach(target.$element);
  assert.equal(removes, 1);
  assert.equal(column.getInstances()[0].attachCalls.length, 1);
});

test('InteractiveVideo fullscreen control is removed after controls event', () => {
  let removes = 0;
  const harness = createHarness({
    childSpecs: [{controls: {$fullscreen: { remove() { removes++; } }}}]
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.InteractiveVideo 1.28')]
  });
  const child = column.getInstances()[0];

  const target = harness.createContainer();
  column.attach(target.$element);
  column.attach(target.$element);
  assert.equal(removes, 0);
  assert.equal(child.listenerCount('controls'), 1);
  assert.equal(child.attachCalls.length, 1);
  child.trigger('controls');
  assert.equal(removes, 1);
});
