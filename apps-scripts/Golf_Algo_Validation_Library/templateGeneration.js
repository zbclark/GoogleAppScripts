/**
 * Template Generation Module
 * Analyzes all tournaments post-hoc to generate reusable weight templates by course type
 * 
 * Workflow:
 * 1. User manually classifies each tournament as POWER, TECHNICAL, or BALANCED in Configuration Sheet (G10)
 * 2. This function analyzes each tournament and determines which metric weights produced top finisher rankings
 * 3. Groups results by course type and generates optimal weight templates
 * 4. Stores templates in Configuration Sheet for future tournament application
 */

/**
 * Generates weight templates by analyzing all 9 tournaments post-hoc
 * Determines optimal metric weights for POWER vs TECHNICAL course types
 */
function generateWeightTemplates() {
  try {
    const masterSs = SpreadsheetApp.getActiveSpreadsheet();

    const folderName = getGolfFolderName();
    const folders = DriveApp.getFoldersByName(folderName);
    if (!folders.hasNext()) {
      SpreadsheetApp.getUi().alert(`${folderName} folder not found`);
      return;
    }

    const golfFolder = folders.next();
    const workbookFiles = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    
    const NORMALIZED_METRICS = [
      "Driving Distance",
      "Driving Accuracy",
      "SG OTT",
      "Approach <100 GIR",
      "Approach <100 SG",
      "Approach <100 Prox",
      "Approach <150 FW GIR",
      "Approach <150 FW SG",
      "Approach <150 FW Prox",
      "Approach <150 Rough GIR",
      "Approach <150 Rough SG",
      "Approach <150 Rough Prox",
      "Approach <200 FW GIR",
      "Approach <200 FW SG",
      "Approach <200 FW Prox",
      "Approach >150 Rough GIR",
      "Approach >150 Rough SG",
      "Approach >150 Rough Prox",
      "Approach >200 FW GIR",
      "Approach >200 FW SG",
      "Approach >200 FW Prox",
      "SG Putting",
      "SG Around Green",
      "SG T2G",
      "Scoring Average",
      "Birdie Chances Created",
      "Birdies or Better",
      "Greens in Regulation",
      "Scoring: Approach <100 SG",
      "Scoring: Approach <150 FW SG",
      "Scoring: Approach <150 Rough SG",
      "Scoring: Approach >150 Rough SG",
      "Scoring: Approach <200 FW SG",
      "Scoring: Approach >200 FW SG",
      "Scrambling",
      "Great Shots",
      "Poor Shot Avoidance",
      "Course Management: Approach <100 Prox",
      "Course Management: Approach <150 FW Prox",
      "Course Management: Approach <150 Rough Prox",
      "Course Management: Approach >150 Rough Prox",
      "Course Management: Approach <200 FW Prox",
      "Course Management: Approach >200 FW Prox"
    ];

    const METRIC_ALIASES = {
      "Poor Shot Avoidance": "Poor Shots",
      "Scoring: Approach <100 SG": "Approach <100 SG",
      "Scoring: Approach <150 FW SG": "Approach <150 FW SG",
      "Scoring: Approach <150 Rough SG": "Approach <150 Rough SG",
      "Scoring: Approach >150 Rough SG": "Approach >150 Rough SG",
      "Scoring: Approach <200 FW SG": "Approach <200 FW SG",
      "Scoring: Approach >200 FW SG": "Approach >200 FW SG",
      "Course Management: Approach <100 Prox": "Approach <100 Prox",
      "Course Management: Approach <150 FW Prox": "Approach <150 FW Prox",
      "Course Management: Approach <150 Rough Prox": "Approach <150 Rough Prox",
      "Course Management: Approach >150 Rough Prox": "Approach >150 Rough Prox",
      "Course Management: Approach <200 FW Prox": "Approach <200 FW Prox",
      "Course Management: Approach >200 FW Prox": "Approach >200 FW Prox"
    };

    const createMetricBuckets = () => {
      const buckets = {};
      NORMALIZED_METRICS.forEach(metric => {
        buckets[metric] = [];
      });
      return buckets;
    };

    const buildHeaderMap = (headers) => {
      const headerMap = {};
      headers.forEach((header, idx) => {
        if (header) headerMap[header.toString().trim()] = idx;
      });
      return headerMap;
    };

    const resolveMetricColumn = (metricName, headerMap) => {
      if (headerMap[metricName] !== undefined) {
        return headerMap[metricName];
      }
      const alias = METRIC_ALIASES[metricName];
      if (alias && headerMap[alias] !== undefined) {
        return headerMap[alias];
      }
      return undefined;
    };

    const initCourseTypeBucket = () => ({
      tournaments: [],
      metrics: createMetricBuckets()
    });

    // --- NEW LOGIC: Aggregate from all 02_ sheets by template type ---
    console.log("=== PHASE 1: WEIGHT TEMPLATE GENERATION (from 02_ sheets) ===\n");
    const templateAnalysis = {
      POWER: { tournaments: [], metrics: {} },
      TECHNICAL: { tournaments: [], metrics: {} },
      BALANCED: { tournaments: [], metrics: {} }
    };
    NORMALIZED_METRICS.forEach(metric => {
      templateAnalysis.POWER.metrics[metric] = [];
      templateAnalysis.TECHNICAL.metrics[metric] = [];
      templateAnalysis.BALANCED.metrics[metric] = [];
    });

    // Find all 02_ sheets in the master spreadsheet
    const allSheets = masterSs.getSheets();
    allSheets.forEach(sheet => {
      const name = sheet.getName();
      if (!name.startsWith('02_')) return;
      // Read header for course type (row 1) and config type (in parenthesis)
      const header = sheet.getRange(1, 1).getValue();
      // Example: "American Express (2026) - Metric Analysis (TECHNICAL Course) (Config: TECHNICAL)"
      let courseType = 'BALANCED';
      const match = header.match(/\((POWER|TECHNICAL|BALANCED) Course\)/i);
      if (match) courseType = match[1].toUpperCase();
      // Only use sheets with a valid course type
      if (!["POWER","TECHNICAL","BALANCED"].includes(courseType)) return;

      // Find the metrics table header row (look for "Metric" in col 1)
      let metricsHeaderRow = 0;
      for (let r = 1; r <= 10; r++) {
        if (sheet.getRange(r, 1).getValue() === "Metric") {
          metricsHeaderRow = r;
          break;
        }
      }
      if (!metricsHeaderRow) return;

      // Read all metric rows until blank
      let row = metricsHeaderRow + 1;
      while (true) {
        const metricName = sheet.getRange(row, 1).getValue();
        if (!metricName) break;
        if (!NORMALIZED_METRICS.includes(metricName)) {
          row++;
          continue;
        }
        const avgValue = parseFloat(sheet.getRange(row, 2).getValue()) || 0;
        templateAnalysis[courseType].metrics[metricName].push(avgValue);
        row++;
      }
      templateAnalysis[courseType].tournaments.push(name);
    });

    // Calculate averages for each metric by type
    let templates = {};
    Object.keys(templateAnalysis).forEach(courseType => {
      const data = templateAnalysis[courseType];
      if (data.tournaments.length === 0) {
        console.log(`⚠️ ${courseType}: No tournaments classified - skipping`);
        return;
      }
      const calcAvg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
      const metricAverages = {};
      NORMALIZED_METRICS.forEach(metricName => {
        metricAverages[metricName] = calcAvg(data.metrics[metricName]);
      });
      templates[courseType] = {
        metrics: metricAverages,
        tournamentCount: data.tournaments.length
      };
      [
        "Driving Distance",
        "Driving Accuracy",
        "SG OTT",
        "SG T2G",
        "Birdie Chances Created"
      ].forEach(metricName => {
        const value = templates[courseType].metrics[metricName] || 0;
        console.log(`  ${metricName}: ${value.toFixed(3)}`);
      });
      console.log("");
    });

    // Store templates as before
    storeWeightTemplates(masterSs, templates);
    console.log("✅ Templates generated from 02_ sheets");
    SpreadsheetApp.getUi().alert("Weight templates generated from 02_ sheets!\n\nCheck 'Weight Templates' sheet for detailed results.");
  } catch (e) {
    console.error("Error in generateWeightTemplates: " + e.message);
    SpreadsheetApp.getUi().alert("Error: " + e.message);
  }
}

/**
 * Attempts to read course type from tournament workbook
 * Looks for course type indicator in:
 * 1. Tournament workbook's Configuration Sheet (if exists)
 * 2. Fallback: Analyzes course characteristics from data
 */
function getCourseTypeFromTournament(ss, fileName) {
  try {
    const configSheet = ss.getSheetByName("Configuration Sheet");
    if (configSheet) {
      const courseType = configSheet.getRange("G10").getValue();
      if (courseType && (courseType === "POWER" || courseType === "TECHNICAL" || courseType === "BALANCED")) {
        return courseType;
      }
    }
  } catch (e) {
    // Ignore if not found
  }

  // Fallback: Try to infer from tournament name
  const name = fileName.toLowerCase();
  if (name.includes("players") || name.includes("valspar") || name.includes("texas") || name.includes("valero")) {
    return "POWER";
  }
  if (name.includes("masters") || name.includes("palmer") || name.includes("heritage")) {
    return "TECHNICAL";
  }
  
  return null;
}

/**
 * Stores generated weight templates in a new sheet called "Weight Templates"
 * Creates a summary table showing recommended weights for each course type
 */
function storeWeightTemplates(masterSs, templates) {
  try {
    // Create or get the Weight Templates sheet
    let templateSheet = masterSs.getSheetByName("Weight Templates");
    if (templateSheet) {
      masterSs.deleteSheet(templateSheet);
    }
    templateSheet = masterSs.insertSheet("Weight Templates");
    
    // Write headers
    templateSheet.getRange("A1").setValue("WEIGHT TEMPLATES BY COURSE TYPE");
    templateSheet.getRange("A1").setFontWeight("bold").setFontSize(12);

    // Write each template
    let currentRow = 3;
    Object.keys(templates).forEach(courseType => {
      const template = templates[courseType];
      // Course type header
      templateSheet.getRange(`A${currentRow}`).setValue(courseType);
      templateSheet.getRange(`A${currentRow}`).setFontWeight("bold").setBackground("#E3F2FD");
      currentRow++;

      // Metrics table
      templateSheet.getRange(`A${currentRow}`).setValue("Metric");
      templateSheet.getRange(`B${currentRow}`).setValue("Average Value");
      templateSheet.getRange(`C${currentRow}`).setValue("Source Tournaments");
      currentRow++;

      // Output only metrics with nonzero average value
      Object.keys(template.metrics).forEach(metricName => {
        const avgValue = template.metrics[metricName];
        if (avgValue && Math.abs(avgValue) > 0.0001) { // filter out zero/near-zero
          templateSheet.getRange(`A${currentRow}`).setValue(metricName);
          templateSheet.getRange(`B${currentRow}`).setValue(avgValue.toFixed(3));
          templateSheet.getRange(`C${currentRow}`).setValue(template.tournamentCount);
          currentRow++;
        }
      });

      currentRow += 2; // Space between course types
    });

    templateSheet.setColumnWidth(1, 200);
    templateSheet.setColumnWidth(2, 150);
    templateSheet.setColumnWidth(3, 180);

  } catch (e) {
    console.error("Error storing templates: " + e.message);
  }
}
