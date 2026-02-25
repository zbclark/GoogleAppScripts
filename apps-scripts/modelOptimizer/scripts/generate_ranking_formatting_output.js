#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const { getRankingFormattingSchema } = require('../utilities/rankingFormattingSchema');


const OUTPUT_DIR = path.resolve(__dirname, '../utilities');
const WRITE_JSON = true;
const WRITE_CSV = true;

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const schema = getRankingFormattingSchema();

const writeJson = () => {
  const jsonPath = path.resolve(OUTPUT_DIR, 'ranking_formatting_schema.json');
  fs.writeFileSync(jsonPath, JSON.stringify(schema, null, 2));
  console.log(`✅ Wrote formatting JSON: ${jsonPath}`);
};

const writeCsv = () => {
  const csvPath = path.resolve(OUTPUT_DIR, 'ranking_formatting_schema.csv');
  const lines = [];

  lines.push('key,value');
  lines.push(`sheetName,${JSON.stringify(schema.sheetName)}`);
  lines.push(`headerRow,${schema.headerRow}`);
  if (schema.medianRow !== undefined) lines.push(`medianRow,${schema.medianRow}`);
  lines.push(`dataStartRow,${schema.dataStartRow}`);
  if (schema.conditionalFormattingStartRow !== undefined) {
    lines.push(`conditionalFormattingStartRow,${schema.conditionalFormattingStartRow}`);
  }
  lines.push(`notesColumn,${schema.notesColumn}`);
  lines.push(`notesColumnHeader,${JSON.stringify(schema.notesColumnHeader)}`);
  lines.push(`tableStartColumn,${schema.tableStartColumn}`);
  lines.push(`notesColumnWidth,${schema.notesColumnWidth}`);
  lines.push(`defaultWidth,${schema.columnDefaults.width}`);
  lines.push('');
  lines.push('columnIndex,name,group,format,width,trend,direction,zScoreColoring,zeroAsNoData');

  schema.columns.forEach((column, index) => {
    lines.push([
      index + schema.tableStartColumn,
      JSON.stringify(column.name),
      JSON.stringify(column.group || 'base'),
      JSON.stringify(column.format || schema.columnDefaults.format),
      column.width || schema.columnDefaults.width,
      column.trend ? 'true' : 'false',
      column.direction || 'higher_better',
      column.zScoreColoring ? 'true' : 'false',
      column.zeroAsNoData ? 'true' : 'false'
    ].join(','));
  });

  lines.push('');
  lines.push('zScore.thresholds,' + JSON.stringify(schema.zScoreColoring.thresholds));
  lines.push('zScore.positivePalette,' + JSON.stringify(schema.zScoreColoring.positivePalette));
  lines.push('zScore.negativePalette,' + JSON.stringify(schema.zScoreColoring.negativePalette));
  lines.push('zScore.zeroAsNoData,' + (schema.zScoreColoring.zeroAsNoData ? 'true' : 'false'));
  lines.push('zScore.zeroColor,' + JSON.stringify(schema.zScoreColoring.zeroColor));

  lines.push('');
  lines.push('trend.backgroundGood,' + JSON.stringify(schema.trendFormatting.backgroundGood));
  lines.push('trend.backgroundBad,' + JSON.stringify(schema.trendFormatting.backgroundBad));
  lines.push('trend.textGood,' + JSON.stringify(schema.trendFormatting.textGood));
  lines.push('trend.textBad,' + JSON.stringify(schema.trendFormatting.textBad));
  lines.push('trend.thresholdsByMetricIndex,' + JSON.stringify(schema.trendFormatting.thresholdsByMetricIndex));

  fs.writeFileSync(csvPath, lines.join('\n'));
  console.log(`✅ Wrote formatting CSV: ${csvPath}`);
};

if (WRITE_JSON) writeJson();
if (WRITE_CSV) writeCsv();
