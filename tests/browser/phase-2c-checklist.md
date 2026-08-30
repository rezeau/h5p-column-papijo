# Phase 2C browser characterization

This checklist exercises `H5P.ColumnPapiJo` without changing production code. It was used with h5p-dev at `http://localhost:8080/dashboard`, Core API 1.28, ColumnPapiJo 1.17.3, and InteractiveBookPapiJo 1.14.2.

## Resize probe

Open browser developer tools on the h5p-dev view page, paste the complete contents of `resize-probe.js` into the console, and run it after the H5P content has rendered. The probe wraps only the test page's `H5P.EventDispatcher.prototype.trigger` and records `resize` events. It does not modify repository production files.

Use these console calls around one action at a time:

```js
__columnPapiJoResizeProbe.reset();
__columnPapiJoResizeProbe.mark('before action');
// Perform one browser action.
__columnPapiJoResizeProbe.mark('after action');
__columnPapiJoResizeProbe.summary();
__columnPapiJoResizeProbe.snapshot();
```

Run `__columnPapiJoResizeProbe.stop()` before reloading or leaving the test. A duplicate count is evidence of a defect only when it also produces visible flicker, incorrect height, recursive growth, slowdown, or an error/warning.

## Reproducible checks

For standalone ColumnPapiJo, record the initial wrapper and child count, ordering, spacing, height, horizontal overflow, and console output. Exercise one scorable child through Check and Retry or Reset, then reload using the same h5p-dev session and confirm state. Repeat at approximately 1280, 768, and 390 CSS pixels. Run the resize probe separately for initial load, a task interaction, viewport resize, media load, show solution, and reset.

For InteractiveBookPapiJo, visit every page once, then navigate away and back at least five times. After every transition record total and visible `.h5p-column` and `.h5p-column-content` counts, iframe height, state/score, and console output. Counts may reflect one retained wrapper per visited page, but must not grow on subsequent visits. Repeat with the book navigation panel expanded and collapsed at narrow width.

Create dedicated fixtures for each case that was absent from the Phase 2C environment:

- InteractiveBookPapiJo -> ColumnPapiJo -> Row -> task.
- Two ColumnPapiJo instances on one book page.
- ColumnPapiJo containing CoursePresentation.
- ColumnPapiJo containing InteractiveVideo.
- Supported audio, image-hotspot, drag, and media-loading children needed to assess historical CSS and resize behavior.

For CoursePresentation and InteractiveVideo, confirm that the nested child's own fullscreen control is suppressed without exceptions while the container's fullscreen control remains usable. For historical CSS checks, compare only currently supported children; ImageZoomPapiJo and TextareaPapiJo are intentionally excluded.

## Phase 2C observations (2026-08-30)

The existing standalone fixture rendered one Column wrapper and four ordered PapiJo child containers: DragTextPapiJo, DragQuestionPapiJo, MarkTheWordsPapiJo, and DialogcardsPapiJo. The existing book fixture contained two single-child ColumnPapiJo pages: official TrueFalse and DialogcardsPapiJo. Five away/back cycles retained two total wrappers with exactly one visible, stable page heights, the completed TrueFalse score/state, and no console warnings or errors. A full host reload restored the selected TrueFalse answer in the h5p-dev session; as expected, it returned to an unchecked task state rather than restoring result feedback. InteractiveBook fullscreen entered and exited cleanly, resized the content from its embedded width to the viewport and back, and retained one visible Column.

At 1280, 768, and 390 pixel viewports, standalone and embedded content matched their frame width without horizontal document overflow. At 390 pixels, InteractiveBook intentionally hid page content while its navigation panel was expanded; collapsing the panel restored the content and correct frame height. Direct browser resize-event counts, Row nesting, multiple Columns on one page, media-load behavior, CoursePresentation, InteractiveVideo, and the historical audio/image-hotspot CSS cases were not covered by the available fixtures.
