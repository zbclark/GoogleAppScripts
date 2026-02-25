#!/usr/bin/env node
/*
  Sanitize course_context.json for portability.

  Goals:
  - Ensure the JSON is valid and formatted.
  - Strip machine-specific filesystem metadata that was only used during migration.
    - top-level sourceDir -> repo-relative string
    - any entry.sourcePath -> null

  This script is intentionally conservative: it does not change any other fields.
*/

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const COURSE_CONTEXT_PATH = path.resolve(ROOT_DIR, 'utilities', 'course_context.json');

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, obj) {
  fs.writeFileSync(filePath, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function sanitizeEntry(entry) {
  if (!entry || typeof entry !== 'object') return entry;
  if (Object.prototype.hasOwnProperty.call(entry, 'sourcePath')) {
    entry.sourcePath = null;
  }
  return entry;
}

function sanitizeMap(map) {
  if (!map || typeof map !== 'object') return map;
  Object.keys(map).forEach(key => {
    const entry = map[key];
    if (entry && typeof entry === 'object') {
      sanitizeEntry(entry);
    }
  });
  return map;
}

function main() {
  if (!fs.existsSync(COURSE_CONTEXT_PATH)) {
    console.error(`❌ course_context.json not found: ${COURSE_CONTEXT_PATH}`);
    process.exit(1);
  }

  const payload = readJson(COURSE_CONTEXT_PATH);

  // top-level: ensure portability
  payload.sourceDir = 'apps-scripts/modelOptimizer/data';

  if (payload.byEventId) sanitizeMap(payload.byEventId);
  if (payload.byCourseNum) sanitizeMap(payload.byCourseNum);

  writeJson(COURSE_CONTEXT_PATH, payload);
  console.log(`✓ Sanitized: ${COURSE_CONTEXT_PATH}`);
}

main();
