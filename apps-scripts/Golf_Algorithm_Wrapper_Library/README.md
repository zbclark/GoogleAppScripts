# Golf Algorithm Wrapper Library

This Apps Script library wraps the Golf Algorithm Library and provides menu + dialog helpers.

## What it is
- `buildMenu()` renders the UI menus.
- `runAutoSetupCheck()` manages the "IS_CONFIGURED" flag using **Document Properties**.
- `showDebugLoggingDialog()` uses `DebugLoggingDialog.html`.
- All other functions are thin wrappers over `GolfAlgorithm`.

## Important
Apps Script **simple triggers** like `onOpen` and `onEdit` must live in the **bound script**.
This library does not auto-run triggers. Your bound project must call these functions.

## Usage (bound script example)
```javascript
function onOpen() {
  WrapperLib.buildMenu();
  WrapperLib.runAutoSetupCheck();
}

function showDebugLoggingDialog() {
  return WrapperLib.showDebugLoggingDialog();
}

function getDebugLoggingSettings() {
  return WrapperLib.getDebugLoggingSettings();
}

function setDebugLoggingSettings(enabled) {
  return WrapperLib.setDebugLoggingSettings(enabled);
}
```

## Library dependency
This library depends on the Golf Algorithm Library and expects it to be added in this script project.
