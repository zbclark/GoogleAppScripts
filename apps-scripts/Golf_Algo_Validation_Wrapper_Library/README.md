# Golf Algo Validation Wrapper Library

This Apps Script library wraps the Golf Algo Validation Library and exposes menu helpers.

## What it is
- `buildMenu()` renders the UI menu.
- `runCompleteModelAnalysisWithYearPrompt()` forwards to `GolfAlgoValidation`.

## Important
Apps Script simple triggers like `onOpen` must live in the **bound script**.
This library does not auto-run triggers. Your bound project must call these functions.

## Usage (bound script example)
```javascript
function onOpen() {
  WrapperLib.buildMenu();
}

function runCompleteModelAnalysisWithYearPrompt() {
  return WrapperLib.runCompleteModelAnalysisWithYearPrompt();
}
```

## Library dependency
This library depends on the Golf Algo Validation Library and expects it to be added in this script project.
