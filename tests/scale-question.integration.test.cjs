'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { createHarness } = require('./helpers/h5p-harness.cjs');

const runtimePath = path.resolve(__dirname, '..', 'scripts', 'h5p-column.js');

function createScaleQuestionDouble(helpers, options = {}) {
  const state = {
    awaitingRetry: false,
    terminal: false,
    correct: false,
    selectedIndex: null,
    ...(options.state || {})
  };
  const calls = {
    showSolutions: 0,
    resetTask: 0
  };
  const xAPIData = options.xAPIData || { statement: { id: 'scale-question' } };
  const child = helpers.makeChild({
    machineName: 'H5P.ScaleQuestion',
    isTask: true,
    score: () => state.terminal && state.correct ? 1 : 0,
    maxScore: 1,
    answerGiven: () => state.terminal,
    currentState: () => ({ ...state }),
    showSolutions() {
      calls.showSolutions++;
    },
    resetTask() {
      calls.resetTask++;
      state.awaitingRetry = false;
      state.terminal = false;
      state.correct = false;
      state.selectedIndex = null;
    },
    getXAPIData() {
      return xAPIData;
    }
  });

  child.submitIntermediateIncorrect = function () {
    state.selectedIndex = 0;
    state.awaitingRetry = true;
  };
  child.retry = function () {
    state.selectedIndex = null;
    state.awaitingRetry = false;
  };
  child.submitTerminal = function (correct = true) {
    state.selectedIndex = correct ? 1 : 0;
    state.awaitingRetry = false;
    state.terminal = true;
    state.correct = correct;
    return this.emitScored(correct ? 1 : 0, 1);
  };
  child.scaleState = state;
  child.scaleCalls = calls;
  child.scaleXAPIData = xAPIData;
  return child;
}

test('ScaleQuestion explicit task identity waits for terminal completion and contributes its score', () => {
  let scale;
  const harness = createHarness({
    childFactory(content, index, helpers) {
      scale = createScaleQuestionDouble(helpers);
      return scale;
    }
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.ScaleQuestion 0.2')]
  });

  assert.equal(scale.listenerCount('xAPI'), 1);
  assert.equal(column.getAnswerGiven(), false);
  assert.equal(column.getScore(), 0);
  assert.equal(column.getMaxScore(), 1);

  scale.submitIntermediateIncorrect();
  harness.flushTimers();
  assert.equal(column.getAnswerGiven(), false);
  assert.equal(column.getScore(), 0);
  assert.equal(column._triggerXAPIScoredCalls, undefined);

  scale.retry();
  scale.submitTerminal(true);
  harness.flushTimers();
  assert.equal(column.getAnswerGiven(), true);
  assert.equal(column.getScore(), 1);
  assert.equal(column.getMaxScore(), 1);
  assert.deepEqual(
    column._triggerXAPIScoredCalls.map(({ raw, max, verb }) => ({ raw, max, verb })),
    [{ raw: 1, max: 1, verb: 'completed' }]
  );
});

test('duplicate ScaleQuestion terminal results do not complete an additional Column task', () => {
  const scales = [];
  const harness = createHarness({
    childFactory(content, index, helpers) {
      const scale = createScaleQuestionDouble(helpers);
      scales.push(scale);
      return scale;
    }
  });
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.ScaleQuestion 0.2'),
      harness.makeColumnEntry('H5P.ScaleQuestion 0.2')
    ]
  });

  scales[0].submitTerminal(false);
  scales[0].emitScored(0, 1);
  harness.flushTimers();
  assert.equal(column._triggerXAPIScoredCalls, undefined);

  scales[1].submitTerminal(true);
  harness.flushTimers();
  assert.deepEqual(
    column._triggerXAPIScoredCalls.map(({ raw, max }) => ({ raw, max })),
    [{ raw: 1, max: 2 }]
  );
});

test('ScaleQuestion state restores and saves in its original Column content slot', () => {
  const restoredState = {
    awaitingRetry: true,
    terminal: false,
    correct: false,
    selectedIndex: 0
  };
  const harness = createHarness({
    childFactory(content, index, helpers) {
      if (content.library.startsWith('H5P.ScaleQuestion')) {
        return createScaleQuestionDouble(helpers, {
          state: harness.newRunnableCalls[index].contentData.previousState
        });
      }
      return helpers.makeChild({ machineName: 'H5P.AdvancedText' });
    }
  });
  const previousState = { instances: [] };
  previousState.instances[1] = restoredState;
  const column = harness.instantiate({
    content: [
      harness.makeColumnEntry('H5P.AdvancedText 1.1'),
      harness.makeColumnEntry('H5P.ScaleQuestion 0.2')
    ]
  }, 17, { previousState });

  assert.strictEqual(harness.newRunnableCalls[1].contentData.previousState, restoredState);
  assert.deepEqual(column.getCurrentState().instances[1], restoredState);
  assert.equal(0 in column.getCurrentState().instances, false);
});

test('Column delegates Show Solution and Reset to ScaleQuestion', () => {
  let scale;
  const harness = createHarness({
    childFactory(content, index, helpers) {
      scale = createScaleQuestionDouble(helpers, {
        state: { terminal: true, correct: false, selectedIndex: 0 }
      });
      return scale;
    }
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.ScaleQuestion 0.2')]
  });

  column.showSolutions();
  column.resetTask();
  assert.deepEqual(scale.scaleCalls, { showSolutions: 1, resetTask: 1 });
  assert.equal(column.getAnswerGiven(), false);
  assert.equal(column.getScore(), 0);
});

test('Column reporting includes ScaleQuestion child xAPI data', () => {
  let scale;
  const harness = createHarness({
    childFactory(content, index, helpers) {
      scale = createScaleQuestionDouble(helpers, {
        state: { terminal: true, correct: true, selectedIndex: 1 },
        xAPIData: { statement: { id: 'scale-question-answer' } }
      });
      return scale;
    }
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.ScaleQuestion 0.2')]
  });
  const report = column.getXAPIData();

  assert.strictEqual(report.children[0], scale.scaleXAPIData);
  assert.equal(report.children.length, 1);
  assert.deepEqual(report.statement.result.score, { raw: 1, max: 1 });
});

test('ScaleQuestion resize events bubble through Column and Column resize reaches the child', () => {
  let scale;
  const harness = createHarness({
    childFactory(content, index, helpers) {
      scale = createScaleQuestionDouble(helpers);
      return scale;
    }
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.ScaleQuestion 0.2')]
  });
  let columnResizeCount = 0;
  let scaleResizeCount = 0;
  column.on('resize', () => columnResizeCount++);
  scale.on('resize', () => scaleResizeCount++);

  scale.trigger('resize', { source: 'scale' });
  assert.equal(columnResizeCount, 1);
  column.trigger('resize', { source: 'column' });
  assert.equal(scaleResizeCount, 2);
  assert.equal(columnResizeCount, 3);
  assert.equal(column.bubblingUpwards, false);
});

test('QuestionSetPapiJo containing ScaleQuestions remains one Column task until aggregate completion', () => {
  let questionSet;
  let nestedScales;
  const harness = createHarness({
    childFactory(content, index, helpers) {
      nestedScales = [
        createScaleQuestionDouble(helpers),
        createScaleQuestionDouble(helpers)
      ];
      const aggregate = { terminal: false, score: 0 };
      questionSet = helpers.makeChild({
        machineName: 'H5P.QuestionSetPapiJo',
        score: () => aggregate.score,
        maxScore: 2,
        answerGiven: () => aggregate.terminal,
        currentState: () => ({ terminal: aggregate.terminal }),
        getXAPIData() {
          return {
            statement: { id: 'questionset' },
            children: nestedScales.map((scale) => scale.getXAPIData())
          };
        }
      });
      questionSet.getQuestions = () => nestedScales;
      questionSet.completeAggregate = function (score) {
        aggregate.score = score;
        aggregate.terminal = true;
        this.emitScored(score, 2);
      };
      return questionSet;
    }
  });
  const column = harness.instantiate({
    content: [harness.makeColumnEntry('H5P.QuestionSetPapiJo 1.23')]
  });

  assert.equal(questionSet.listenerCount('xAPI'), 1);
  assert.deepEqual(nestedScales.map((scale) => scale.listenerCount('xAPI')), [0, 0]);

  nestedScales[0].submitTerminal(true);
  nestedScales[1].submitIntermediateIncorrect();
  harness.flushTimers();
  assert.equal(column.getAnswerGiven(), false);
  assert.equal(column._triggerXAPIScoredCalls, undefined);

  nestedScales[1].retry();
  nestedScales[1].submitTerminal(false);
  harness.flushTimers();
  assert.equal(column._triggerXAPIScoredCalls, undefined);

  questionSet.completeAggregate(1);
  harness.flushTimers();
  assert.equal(column.getAnswerGiven(), true);
  assert.deepEqual(
    column._triggerXAPIScoredCalls.map(({ raw, max, verb }) => ({ raw, max, verb })),
    [{ raw: 1, max: 2, verb: 'completed' }]
  );
});

test('ScaleQuestion joins TrueFalse in the exact hasMargins classification', () => {
  const source = fs.readFileSync(runtimePath, 'utf8');
  const match = source.match(/var hasMargins = \[([\s\S]*?)\n  \];/);
  assert.ok(match);
  const classifiedLibraries = Array.from(
    match[1].matchAll(/'([^']+)'/g),
    (entry) => entry[1]
  );

  assert.deepEqual(classifiedLibraries, [
    'H5P.AdvancedText',
    'H5P.AdvancedTextPapiJo',
    'H5P.AudioRecorder',
    'H5P.Essay',
    'H5P.Link',
    'H5P.Accordion',
    'H5P.AccordionPapiJo',
    'H5P.Table',
    'H5P.GuessTheAnswer',
    'H5P.Blanks',
    'H5P.AdvancedBlanksPapiJo',
    'H5P.MultiChoice',
    'H5P.TrueFalse',
    'H5P.ScaleQuestion',
    'H5P.DragQuestion',
    'H5P.DragQuestionPapiJo',
    'H5P.Summary',
    'H5P.DragText',
    'H5P.DragTextPapiJo',
    'H5P.MarkTheWords',
    'H5P.MarkTheWordsPapiJo',
    'H5P.ImageHotspotQuestion',
    'H5P.MemoryGame',
    'H5P.Dialogcards',
    'H5P.DialogcardsPapiJo',
    'H5P.QuestionSet',
    'H5P.QuestionSetPapiJo',
    'H5P.DocumentationTool'
  ]);
});

test('automatic separators give ScaleQuestion the same container boundaries as TrueFalse', () => {
  function automaticBoxSizes(questionLibrary) {
    const harness = createHarness();
    const column = harness.instantiate({
      useSeparators: true,
      content: [
        harness.makeColumnEntry('H5P.AdvancedTextPapiJo 1.2', {}, { useSeparator: 'auto' }),
        harness.makeColumnEntry(questionLibrary, {}, { useSeparator: 'auto' }),
        harness.makeColumnEntry('H5P.AdvancedTextPapiJo 1.2', {}, { useSeparator: 'auto' })
      ]
    });
    const target = harness.createContainer();
    column.attach(target.$element);
    const wrapper = target.element.children[0];
    return wrapper.children.map((box) => box.children.length);
  }

  assert.deepEqual(automaticBoxSizes('H5P.TrueFalse 1.8'), [1, 1, 1]);
  assert.deepEqual(automaticBoxSizes('H5P.ScaleQuestion 0.2'), [1, 1, 1]);
});
