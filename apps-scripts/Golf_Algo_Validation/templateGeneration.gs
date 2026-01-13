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

    const folders = DriveApp.getFoldersByName("Golf 2025");
    if (!folders.hasNext()) {
      SpreadsheetApp.getUi().alert("Golf 2025 folder not found");
      return;
    }

    const golfFolder = folders.next();
    const workbookFiles = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    
    // Initialize template analysis data structure
    let templateAnalysis = {
      POWER: {
        tournaments: [],
        drivingDistance: [],
        drivingAccuracy: [],
        sgOTT: [],
        approachGroups: {},
        sgTotal: [],
        bcc: [],
        // Other groups...
      },
      TECHNICAL: {
        tournaments: [],
        drivingDistance: [],
        drivingAccuracy: [],
        sgOTT: [],
        approachGroups: {},
        sgTotal: [],
        bcc: [],
      },
      BALANCED: {
        tournaments: [],
        drivingDistance: [],
        drivingAccuracy: [],
        sgOTT: [],
        approachGroups: {},
        sgTotal: [],
        bcc: [],
      }
    };

    // Initialize approach groups for each course type
    const approachGroups = ["Short (<100)", "Mid (100-150)", "Long (150-200)", "Very Long (>200)"];
    Object.keys(templateAnalysis).forEach(courseType => {
      approachGroups.forEach(group => {
        templateAnalysis[courseType].approachGroups[group] = [];
      });
    });

    console.log("=== PHASE 1: WEIGHT TEMPLATE GENERATION ===\n");
    console.log("Analyzing 9 tournaments to generate optimal weight profiles...\n");

    let tournamentCount = 0;
    let skippedTournaments = [];

    while (workbookFiles.hasNext()) {
      const file = workbookFiles.next();
      const fileName = file.getName();
      const ss = SpreadsheetApp.open(file);
      
      tournamentCount++;
      console.log(`\n📋 [${tournamentCount}/9] Processing: ${fileName}`);

      // STEP 1: Read course type from Configuration Sheet (user must enter manually)
      // For now, try to get it from a cell in the tournament workbook's config
      let courseType = getCourseTypeFromTournament(ss, fileName);
      
      if (!courseType) {
        console.log(`⚠️ ${fileName}: No course type found. Skipping.`);
        skippedTournaments.push(fileName);
        continue;
      }

      console.log(`   Course Type: ${courseType}`);

      // STEP 2: Get actual tournament results
      const resultsSheet = ss.getSheetByName("Tournament Results");
      if (!resultsSheet) {
        console.log(`⚠️ ${fileName}: No Tournament Results sheet`);
        skippedTournaments.push(fileName);
        continue;
      }

      // STEP 3: Get player metrics from Player Ranking Model
      const rankingSheet = ss.getSheetByName("Player Ranking Model");
      if (!rankingSheet) {
        console.log(`⚠️ ${fileName}: No Player Ranking Model sheet`);
        skippedTournaments.push(fileName);
        continue;
      }

      // Read actual results
      const resultsData = resultsSheet.getRange("A5:AB500").getValues();
      const resultsHeaders = resultsData[0];
      
      let resultsCols = {};
      for (let i = 0; i < resultsHeaders.length; i++) {
        const h = String(resultsHeaders[i] || "").toLowerCase().trim();
        if (h === "dg id") resultsCols.dgId = i;
        if (h === "player name") resultsCols.name = i;
        if (h === "finish position") resultsCols.finishPos = i;
      }

      // Get top 10 actual finishers
      let topFinishers = [];
      for (let i = 1; i < resultsData.length; i++) {
        const row = resultsData[i];
        const dgId = String(row[resultsCols.dgId] || "").trim();
        if (!dgId) break;

        const finishStr = String(row[resultsCols.finishPos] || "").trim();
        let finishPos = 999;
        if (!isNaN(parseInt(finishStr))) {
          finishPos = parseInt(finishStr);
        } else if (finishStr.includes("T")) {
          finishPos = parseInt(finishStr.replace("T", ""));
        }

        if (finishPos <= 10) {
          topFinishers.push({
            dgId: dgId,
            name: String(row[resultsCols.name] || "").trim(),
            finishPos: finishPos
          });
        }
      }

      console.log(`   Top 10 finishers: ${topFinishers.length}`);

      // Read player metrics from ranking model - expand range to capture all columns
      const rankingData = rankingSheet.getRange("A5:AK500").getValues();
      const rankingHeaders = rankingData[0];
      
      console.log(`   Ranking sheet headers: ${rankingHeaders.slice(0, 20).map(h => String(h).trim()).join(" | ")}`);
      
      let rankingCols = {};
      const metricNames = [
        "SG Total", "Driving Distance", "Driving Accuracy",
        "SG T2G", "SG Approach", "SG Around Green",
        "SG OTT", "SG Putting", "Greens in Regulation",
        "Scrambling", "Great Shots", "Poor Shots", 
        "Scoring Average", "Birdies or Better", "Birdie Chances Created",
        "Fairway Proximity", "Rough Proximity",
        "Approach <100 GIR", "Approach <100 SG", "Approach <100 Prox",
        "Approach <150 FW GIR", "Approach <150 FW SG", "Approach <150 FW Prox",
        "Approach <150 Rough GIR", "Approach <150 Rough SG", "Approach <150 Rough Prox",
        "Approach >150 Rough GIR", "Approach >150 Rough SG", "Approach >150 Rough Prox",
        "Approach <200 FW GIR", "Approach <200 FW SG", "Approach <200 FW Prox",
        "Approach >200 FW GIR", "Approach >200 FW SG", "Approach >200 FW Prox"
      ];

      for (let i = 0; i < rankingHeaders.length; i++) {
        const h = String(rankingHeaders[i] || "").toLowerCase().trim();
        if (h === "dg id") rankingCols.dgId = i;
        // Match metric names case-insensitively
        metricNames.forEach((metricName) => {
          if (h === metricName.toLowerCase()) {
            rankingCols[metricName] = i;
          }
        });
      }

      console.log(`   Found columns for: ${Object.keys(rankingCols).filter(k => k !== 'dgId').join(", ")}`);
      if (!rankingCols["Birdie Chances Created"]) {
        console.log(`   ⚠️ BCC not found at expected column`);
      }

      // STEP 4: Analyze which metrics were strongest for top finishers in this tournament
      let topFinisherMetrics = {
        "Driving Distance": [],
        "Driving Accuracy": [],
        "SG OTT": [],
        "SG Total": [],
        "Birdie Chances Created": []
      };

      for (let i = 1; i < rankingData.length; i++) {
        const row = rankingData[i];
        const dgId = String(row[rankingCols.dgId] || "").trim();
        if (!dgId) break;

        // Check if this player is a top finisher
        const finisher = topFinishers.find(f => f.dgId === dgId);
        if (finisher) {
          // Collect their metric values
          topFinisherMetrics["Driving Distance"].push({
            finishPos: finisher.finishPos,
            value: parseFloat(row[rankingCols["Driving Distance"]]) || 0
          });
          topFinisherMetrics["Driving Accuracy"].push({
            finishPos: finisher.finishPos,
            value: parseFloat(row[rankingCols["Driving Accuracy"]]) || 0
          });
          topFinisherMetrics["SG OTT"].push({
            finishPos: finisher.finishPos,
            value: parseFloat(row[rankingCols["SG OTT"]]) || 0
          });
          topFinisherMetrics["SG Total"].push({
            finishPos: finisher.finishPos,
            value: parseFloat(row[rankingCols["SG Total"]]) || 0
          });
          topFinisherMetrics["Birdie Chances Created"].push({
            finishPos: finisher.finishPos,
            value: parseFloat(row[rankingCols["Birdie Chances Created"]]) || 0
          });
        }
      }

      // STEP 5: Calculate average metric values for top finishers
      let avgMetrics = {};
      Object.keys(topFinisherMetrics).forEach(metric => {
        const values = topFinisherMetrics[metric];
        if (values.length > 0) {
          const avg = values.reduce((sum, v) => sum + v.value, 0) / values.length;
          avgMetrics[metric] = avg;
          console.log(`   ${metric}: Avg = ${avg.toFixed(3)}`);
        } else {
          avgMetrics[metric] = 0;
          console.log(`   ${metric}: No data collected`);
        }
      });

      // STEP 6: Store data for this tournament in the appropriate course type bucket
      templateAnalysis[courseType].tournaments.push({
        name: fileName,
        metrics: avgMetrics
      });

      // Aggregate metrics by course type
      templateAnalysis[courseType].drivingDistance.push(avgMetrics["Driving Distance"] || 0);
      templateAnalysis[courseType].drivingAccuracy.push(avgMetrics["Driving Accuracy"] || 0);
      templateAnalysis[courseType].sgOTT.push(avgMetrics["SG OTT"] || 0);
      templateAnalysis[courseType].sgTotal.push(avgMetrics["SG Total"] || 0);
      templateAnalysis[courseType].bcc.push(avgMetrics["Birdie Chances Created"] || 0);

      console.log(`   ✓ Data collected for ${courseType} template`);
    }

    console.log(`\n=== ANALYSIS COMPLETE ===`);
    console.log(`Processed: ${tournamentCount - skippedTournaments.length} / ${tournamentCount} tournaments`);
    if (skippedTournaments.length > 0) {
      console.log(`Skipped: ${skippedTournaments.join(", ")}`);
    }

    // STEP 7: Generate templates from aggregated data
    console.log("\n=== GENERATING TEMPLATES ===\n");
    
    let templates = {};
    Object.keys(templateAnalysis).forEach(courseType => {
      const data = templateAnalysis[courseType];
      
      if (data.tournaments.length === 0) {
        console.log(`⚠️ ${courseType}: No tournaments classified - skipping`);
        return;
      }

      console.log(`${courseType} (${data.tournaments.length} tournaments):`);
      console.log(`  Tournaments: ${data.tournaments.map(t => t.name).join(", ")}`);

      // Calculate averages
      const calcAvg = (arr) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

      templates[courseType] = {
        drivingDistance: calcAvg(data.drivingDistance),
        drivingAccuracy: calcAvg(data.drivingAccuracy),
        sgOTT: calcAvg(data.sgOTT),
        sgTotal: calcAvg(data.sgTotal),
        bcc: calcAvg(data.bcc),
        tournamentCount: data.tournaments.length
      };

      console.log(`  Driving Distance: ${templates[courseType].drivingDistance.toFixed(3)}`);
      console.log(`  Driving Accuracy: ${templates[courseType].drivingAccuracy.toFixed(3)}`);
      console.log(`  SG OTT: ${templates[courseType].sgOTT.toFixed(3)}`);
      console.log(`  SG Total: ${templates[courseType].sgTotal.toFixed(3)}`);
      console.log(`  Birdie Chances Created: ${templates[courseType].bcc.toFixed(3)}`);
      console.log("");
    });


    // STEP 8: Store templates in Configuration Sheet
    storeWeightTemplates(masterSs, templates);

    console.log("✅ Templates generated and stored in Weight Templates sheet");
    SpreadsheetApp.getUi().alert("Weight templates generated successfully!\n\nCheck 'Weight Templates' sheet for detailed results.");
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

      templateSheet.getRange(`A${currentRow}`).setValue("Driving Distance");
      templateSheet.getRange(`B${currentRow}`).setValue(template.drivingDistance.toFixed(3));
      templateSheet.getRange(`C${currentRow}`).setValue(template.tournamentCount);
      currentRow++;

      templateSheet.getRange(`A${currentRow}`).setValue("Driving Accuracy");
      templateSheet.getRange(`B${currentRow}`).setValue(template.drivingAccuracy.toFixed(3));
      templateSheet.getRange(`C${currentRow}`).setValue(template.tournamentCount);
      currentRow++;

      templateSheet.getRange(`A${currentRow}`).setValue("SG OTT");
      templateSheet.getRange(`B${currentRow}`).setValue(template.sgOTT.toFixed(3));
      templateSheet.getRange(`C${currentRow}`).setValue(template.tournamentCount);
      currentRow++;

      templateSheet.getRange(`A${currentRow}`).setValue("SG Total");
      templateSheet.getRange(`B${currentRow}`).setValue(template.sgTotal.toFixed(3));
      templateSheet.getRange(`C${currentRow}`).setValue(template.tournamentCount);
      currentRow++;

      templateSheet.getRange(`A${currentRow}`).setValue("Birdie Chances Created");
      templateSheet.getRange(`B${currentRow}`).setValue(template.bcc.toFixed(3));
      templateSheet.getRange(`C${currentRow}`).setValue(template.tournamentCount);
      currentRow += 3; // Space between course types
    });

    templateSheet.setColumnWidth(1, 200);
    templateSheet.setColumnWidth(2, 150);
    templateSheet.setColumnWidth(3, 180);

  } catch (e) {
    console.error("Error storing templates: " + e.message);
  }
}
