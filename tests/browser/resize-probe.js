(function installColumnPapiJoResizeProbe() {
  'use strict';

  const root = window.top || window;
  const previous = root.__columnPapiJoResizeProbe;
  if (previous && typeof previous.stop === 'function') {
    previous.stop();
  }

  const records = [];
  const patches = [];
  const startedAt = performance.now();

  const getEventName = (event) => {
    if (typeof event === 'string') {
      return event;
    }
    return event && (event.type ||
      (typeof event.getName === 'function' && event.getName()));
  };

  const getLibraryName = (instance) => {
    const libraryInfo = instance && instance.libraryInfo;
    return (libraryInfo && (libraryInfo.machineName || libraryInfo.name)) ||
      (instance && instance.constructor && instance.constructor.name) ||
      'unknown';
  };

  const visitFrames = (frame, frames) => {
    if (frames.includes(frame)) {
      return;
    }
    frames.push(frame);
    for (const child of frame.frames) {
      try {
        visitFrames(child, frames);
      }
      catch (error) {
        // Ignore cross-origin frames; local h5p-dev content is same-origin.
      }
    }
  };

  const frames = [];
  visitFrames(root, frames);

  for (const frame of frames) {
    let H5P;
    try {
      H5P = frame.H5P;
    }
    catch (error) {
      continue;
    }

    const prototype = H5P && H5P.EventDispatcher &&
      H5P.EventDispatcher.prototype;
    if (!prototype || typeof prototype.trigger !== 'function' ||
        patches.some((patch) => patch.prototype === prototype)) {
      continue;
    }

    const original = prototype.trigger;
    const wrapped = function triggerWithResizeProbe(event) {
      if (getEventName(event) === 'resize') {
        records.push({
          atMs: Math.round((performance.now() - startedAt) * 100) / 100,
          bubblingUpwards: Boolean(event && event.bubblingUpwards),
          source: getLibraryName(this)
        });
      }
      return original.apply(this, arguments);
    };
    prototype.trigger = wrapped;
    patches.push({ original, prototype, wrapped });
  }

  const probe = {
    mark(label) {
      records.push({
        atMs: Math.round((performance.now() - startedAt) * 100) / 100,
        label
      });
    },
    reset() {
      records.length = 0;
    },
    snapshot() {
      return records.map((record) => ({ ...record }));
    },
    summary() {
      return records.reduce((summary, record) => {
        if (!record.label) {
          const key = `${record.source}|${record.bubblingUpwards ? 'up' : 'down/unspecified'}`;
          summary[key] = (summary[key] || 0) + 1;
        }
        return summary;
      }, {});
    },
    stop() {
      for (const patch of patches) {
        if (patch.prototype.trigger === patch.wrapped) {
          patch.prototype.trigger = patch.original;
        }
      }
      patches.length = 0;
    }
  };

  root.__columnPapiJoResizeProbe = probe;
  console.info(`ColumnPapiJo resize probe installed in ${patches.length} H5P context(s).`);
}());
