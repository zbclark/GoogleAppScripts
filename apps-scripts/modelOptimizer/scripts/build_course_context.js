#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { getSharedConfig } = require('../utilities/configParser');

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(ROOT_DIR, 'data');
const OUTPUT_PATH = path.resolve(ROOT_DIR, 'utilities', 'course_context.json');

const args = process.argv.slice(2);
const includeSourcePath = args.includes('--includeSourcePath')
  || ['1', 'true', 'yes', 'on'].includes(String(process.env.INCLUDE_COURSE_CONTEXT_SOURCEPATH || '').trim().toLowerCase());

// ROOT_DIR = <repo>/apps-scripts/modelOptimizer
// repoRoot = <repo>
const repoRoot = path.resolve(ROOT_DIR, '..', '..', '..');

const toRepoRelativePath = value => {
  if (!value) return null;
  const resolved = path.resolve(String(value));
  const rel = path.relative(repoRoot, resolved);
  // If it's outside the repo, treat as non-portable metadata.
  if (rel.startsWith('..')) return null;
  return rel;
};

const isConfigSheet = name => name.toLowerCase().includes('configuration sheet') && name.toLowerCase().endsWith('.csv');

const collectConfigFiles = dirPath => {
  const results = [];
  if (!fs.existsSync(dirPath)) return results;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  entries.forEach(entry => {
    const fullPath = path.resolve(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectConfigFiles(fullPath));
    } else if (entry.isFile() && isConfigSheet(entry.name)) {
      results.push(fullPath);
    }
  });
  return results;
};

const safeNumber = value => (typeof value === 'number' && Number.isFinite(value) ? value : null);
const normalizeIds = list => (Array.isArray(list) ? list.map(id => String(id || '').trim()).filter(Boolean) : []);

const buildContextEntry = (config, sourcePath) => {
  const courseNum = config.courseNum ? String(config.courseNum) : null;
  const courseSetup = config.courseSetupWeights || {};
  const shotDistribution = {
    under100: safeNumber(courseSetup.under100),
    from100to150: safeNumber(courseSetup.from100to150),
    from150to200: safeNumber(courseSetup.from150to200),
    over200: safeNumber(courseSetup.over200)
  };

  return {
    // Migration-only metadata. We default to null for portability; enable via --includeSourcePath.
    sourcePath: includeSourcePath ? toRepoRelativePath(sourcePath) : null,
    eventId: config.currentEventId ? String(config.currentEventId) : null,
    templateKey: config.courseType ? String(config.courseType) : (config.currentEventId ? String(config.currentEventId) : null),
    courseNum,
    courseNums: courseNum ? [courseNum] : [],
    courseNameKey: config.courseNameKey || null,
    courseType: config.courseType || null,
    similarCourseIds: normalizeIds(config.similarCourseIds),
    puttingCourseIds: normalizeIds(config.puttingCourseIds),
    similarCourseCourseNums: {},
    puttingCourseCourseNums: {},
    similarCoursesWeight: safeNumber(config.similarCoursesWeight),
    puttingCoursesWeight: safeNumber(config.puttingCoursesWeight),
    shotDistribution
  };
};

const configFiles = collectConfigFiles(DATA_DIR);
const byEventId = {};
const byCourseNum = {};

configFiles.forEach(filePath => {
  try {
    const config = getSharedConfig(filePath);
    const entry = buildContextEntry(config, filePath);
    if (entry.eventId) {
      byEventId[entry.eventId] = entry;
    }
    if (entry.courseNum) {
      byCourseNum[entry.courseNum] = entry;
    }
  } catch (error) {
    console.warn(`Skipping ${filePath}: ${error.message}`);
  }
});

const payload = {
  updatedAt: new Date().toISOString(),
  // Portability: store repo-relative directory for debugging only.
  sourceDir: toRepoRelativePath(DATA_DIR),
  byEventId,
  byCourseNum
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));

console.log(`✓ Wrote course context: ${OUTPUT_PATH}`);
console.log(`  Event IDs: ${Object.keys(byEventId).length}`);
console.log(`  Course nums: ${Object.keys(byCourseNum).length}`);
