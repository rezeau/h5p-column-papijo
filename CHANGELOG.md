# Changelog

## 1.17.4 - 2026-09-01

### Fixed

- Register the presave hook under the `H5P.ColumnPapiJo` namespace.
- Preserve child-state positions when invalid semantic entries are skipped.
- Recognize `H5P.QuestionSetPapiJo` as a task and reset aggregate scoring state cleanly between attempts.
- Prevent children from being attached again when a Column is attached repeatedly.
- Handle missing or malformed Row instance and xAPI structures defensively.

### Maintenance and characterization

- Restore the distinctive PapiJo icon and add the upstream Georgian, Lithuanian, Latvian, Mongolian, Swahili, Telugu, and Ukrainian translations.
- Add 60 Node characterization tests covering construction, attachment, state, scoring, Row handling, resize propagation, and fullscreen suppression.
- Add reproducible browser/container characterization and resize-probe tooling. No user-visible resize or repeated InteractiveBook navigation defect was observed in the tested fixtures.

### Compatibility

- Retain the `H5P.ColumnPapiJo` 1.17 library identity and H5P Core API 1.28 requirement.
- Keep the established PapiJo child-library policy unchanged.
