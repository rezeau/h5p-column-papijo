'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const runtimePath = path.resolve(__dirname, '..', '..', 'scripts', 'h5p-column.js');
const runtimeSource = fs.readFileSync(runtimePath, 'utf8');

class MiniClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach((name) => this.values.add(name));
  }

  contains(name) {
    return this.values.has(name);
  }
}

class MiniElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.classList = new MiniClassList();
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
  }

  appendChild(child) {
    if (child.parentNode) {
      const previousIndex = child.parentNode.children.indexOf(child);
      if (previousIndex !== -1) {
        child.parentNode.children.splice(previousIndex, 1);
      }
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }
}

class JQueryWrapper {
  constructor(element) {
    this.element = element;
    this.addClassCalls = [];
    this.htmlCalls = [];
    this.appendCalls = [];
  }

  addClass(names) {
    this.addClassCalls.push(names);
    String(names).split(/\s+/).filter(Boolean).forEach((name) => this.element.classList.add(name));
    return this;
  }

  html(value) {
    this.htmlCalls.push(value);
    if (value === '') {
      for (const child of this.element.children) {
        child.parentNode = null;
      }
      this.element.children = [];
    }
    return this;
  }

  append(child) {
    this.appendCalls.push(child);
    this.element.appendChild(child instanceof JQueryWrapper ? child.element : child);
    return this;
  }
}

function machineNameFromLibrary(library) {
  return String(library).split(' ')[0];
}

function createXAPIEvent(verb, score, maxScore) {
  const event = {
    type: 'xAPI',
    verb,
    data: {
      statement: {
        verb: { id: verb },
        object: {
          definition: {
            extensions: {}
          }
        }
      }
    },
    getScore() {
      return score;
    },
    getMaxScore() {
      return maxScore;
    },
    getVerifiedStatementValue(pathParts) {
      let value = this.data.statement;
      for (const part of pathParts) {
        if (!value[part]) {
          value[part] = {};
        }
        value = value[part];
      }
      return value;
    },
    setScoredResult(raw, max, source, completion, success) {
      this.setScoredResultArgs = { raw, max, source, completion, success };
      this.data.statement.result = {
        score: { raw, max },
        completion,
        success
      };
    }
  };
  return event;
}

function createHarness(options = {}) {
  const timerQueue = [];
  const animationFrameQueue = [];
  const newRunnableCalls = [];
  let childIndex = 0;

  function EventDispatcher() {
    if (!Object.hasOwn(this, '_listeners')) {
      this._listeners = new Map();
    }
    if (!Object.hasOwn(this, '_triggerLog')) {
      this._triggerLog = [];
    }
  }

  EventDispatcher.prototype.on = function (name, handler) {
    const handlers = this._listeners.get(name) || [];
    handlers.push(handler);
    this._listeners.set(name, handlers);
    return this;
  };

  EventDispatcher.prototype.trigger = function (name, event) {
    if (typeof name === 'object' && name !== null) {
      event = name;
      name = event.type || 'xAPI';
    }
    else if (event === undefined) {
      event = { type: name };
    }

    this._triggerLog.push({ name, event, bubblingUpwards: this.bubblingUpwards });
    const handlers = [...(this._listeners.get(name) || [])];
    handlers.forEach((handler) => handler.call(this, event));
    return this;
  };

  EventDispatcher.prototype.listenerCount = function (name) {
    return (this._listeners.get(name) || []).length;
  };

  EventDispatcher.prototype.createXAPIEventTemplate = function (verb) {
    const event = createXAPIEvent(verb);
    this._createdXAPIEvents = this._createdXAPIEvents || [];
    this._createdXAPIEvents.push(event);
    return event;
  };

  EventDispatcher.prototype.triggerXAPIScored = function (raw, max, verb) {
    const event = createXAPIEvent(verb, raw, max);
    event.setScoredResult(raw, max, this, true, raw === max);
    this._triggerXAPIScoredCalls = this._triggerXAPIScoredCalls || [];
    this._triggerXAPIScoredCalls.push({ raw, max, verb, event });
    this.trigger('xAPI', event);
  };

  EventDispatcher.prototype.setActivityStarted = function () {
    this._activityStartedCount = (this._activityStartedCount || 0) + 1;
  };

  function makeChild(spec = {}) {
    const child = Object.create(EventDispatcher.prototype);
    EventDispatcher.call(child);
    child.libraryInfo = {
      machineName: spec.machineName || 'H5P.AdvancedText'
    };
    child.attachCalls = [];
    child.attach = function ($container) {
      this.attachCalls.push($container);
      if (typeof spec.attach === 'function') {
        return spec.attach.call(this, $container);
      }
    };
    child.emitScored = function (score, maxScore) {
      const event = createXAPIEvent('answered', score, maxScore);
      this.trigger('xAPI', event);
      return event;
    };

    if (Object.hasOwn(spec, 'isTask')) {
      child.isTask = spec.isTask;
    }
    if (Object.hasOwn(spec, 'score')) {
      child.getScore = typeof spec.score === 'function' ? spec.score : () => spec.score;
    }
    if (Object.hasOwn(spec, 'maxScore')) {
      child.getMaxScore = typeof spec.maxScore === 'function' ? spec.maxScore : () => spec.maxScore;
    }
    if (Object.hasOwn(spec, 'answerGiven')) {
      child.getAnswerGiven = typeof spec.answerGiven === 'function' ? spec.answerGiven : () => spec.answerGiven;
    }
    if (Object.hasOwn(spec, 'currentState')) {
      child.getCurrentState = typeof spec.currentState === 'function' ? spec.currentState : () => spec.currentState;
    }
    if (typeof spec.showSolutions === 'function') {
      child.showSolutions = spec.showSolutions;
    }
    if (typeof spec.resetTask === 'function') {
      child.resetTask = spec.resetTask;
    }
    if (typeof spec.getInstances === 'function') {
      child.getInstances = spec.getInstances;
    }
    if (typeof spec.getXAPIData === 'function') {
      child.getXAPIData = spec.getXAPIData;
    }
    if (typeof spec.getXAPIDataFromChildren === 'function') {
      child.getXAPIDataFromChildren = spec.getXAPIDataFromChildren;
    }
    if (spec.$fullScreenButton) {
      child.$fullScreenButton = spec.$fullScreenButton;
    }
    if (spec.controls) {
      child.controls = spec.controls;
    }
    if (typeof spec.toggleReadSpeaker === 'function') {
      child.toggleReadSpeaker = spec.toggleReadSpeaker;
    }
    return child;
  }

  const document = {
    createElement(tagName) {
      return new MiniElement(tagName);
    }
  };

  const window = {
    requestAnimationFrame(callback) {
      animationFrameQueue.push(callback);
      return animationFrameQueue.length;
    }
  };

  function jquery(value) {
    return value instanceof JQueryWrapper ? value : new JQueryWrapper(value);
  }
  jquery.extend = function (target, source) {
    return Object.assign(target, source);
  };

  const H5P = {
    EventDispatcher,
    jQuery: jquery,
    createTitle(title) {
      return String(title);
    },
    newRunnable(content, contentId, subContentId, skipResize, contentData) {
      const call = { content, contentId, subContentId, skipResize, contentData };
      newRunnableCalls.push(call);
      const spec = options.childSpecs ? options.childSpecs[childIndex] || {} : {};
      const child = options.childFactory
        ? options.childFactory(content, childIndex, { makeChild, createXAPIEvent })
        : makeChild({ ...spec, machineName: spec.machineName || machineNameFromLibrary(content.library) });
      childIndex++;
      return child;
    }
  };

  const context = vm.createContext({
    H5P,
    document,
    window,
    console,
    setTimeout(callback) {
      timerQueue.push(callback);
      return timerQueue.length;
    }
  });
  vm.runInContext(runtimeSource, context, { filename: runtimePath });

  function makeContent(library, params = {}, extra = {}) {
    return {
      library,
      params,
      ...extra
    };
  }

  function makeColumnEntry(library, params = {}, entry = {}, contentExtra = {}) {
    return {
      content: makeContent(library, params, contentExtra),
      ...entry
    };
  }

  function instantiate(params = {}, id = 17, data = {}) {
    return new context.H5P.ColumnPapiJo(params, id, data);
  }

  function createContainer() {
    const element = new MiniElement('div');
    return { element, $element: new JQueryWrapper(element) };
  }

  function flushTimers() {
    while (timerQueue.length > 0) {
      timerQueue.shift()();
    }
  }

  function flushAnimationFrames() {
    while (animationFrameQueue.length > 0) {
      animationFrameQueue.shift()();
    }
  }

  return {
    H5P,
    context,
    document,
    window,
    newRunnableCalls,
    timerQueue,
    animationFrameQueue,
    instantiate,
    makeChild,
    makeContent,
    makeColumnEntry,
    createContainer,
    createXAPIEvent,
    flushTimers,
    flushAnimationFrames,
    MiniElement,
    JQueryWrapper
  };
}

module.exports = {
  createHarness,
  createXAPIEvent,
  MiniElement,
  JQueryWrapper
};
