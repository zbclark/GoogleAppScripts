/**
 * Analyzes model prediction accuracy by tournament
 * Creates individual sheets for each tournament + season summary
 * Shows stat deltas and patterns to guide weight optimization
 */
function analyzeModelAccuracy() {
  try {
    const folders = DriveApp.getFoldersByName("Golf 2025");
    if (!folders.hasNext()) {
      SpreadsheetApp.getUi().alert("Golf 2025 folder not found");
      return;
    }
    
    const golfFolder = folders.next();
    const workbookFiles = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    const masterSs = SpreadsheetApp.getActiveSpreadsheet();
    
    // Clear old analysis sheets
    const sheets = masterSs.getSheets();
    for (const sheet of sheets) {
      if (sheet.getName().includes("Accuracy") || sheet.getName().includes("Summary")) {
        masterSs.deleteSheet(sheet);
      }
    }
    
    let seasonStats = {
      totalPlayers: 0,
      tournaments: [],
      allMisses: [],
      allStatDeltas: {}
    };
    
    while (workbookFiles.hasNext()) {
      const file = workbookFiles.next();
      const fileName = file.getName();
      const ss = SpreadsheetApp.open(file);
      
      let resultsSheet = ss.getSheetByName("Tournament Results");
      if (!resultsSheet) {
        console.log(`⚠️ ${fileName}: No Tournament Results sheet found`);
        continue;
      }
      
      console.log(`📋 Processing: ${fileName}`);
      
      // Read all data starting from row 5 (headers)
      const fullRange = resultsSheet.getRange("A5:AB500");
      const fullData = fullRange.getValues();
      
      if (fullData.length === 0) {
        console.log(`⚠️ ${fileName}: No data found in A5:AB500`);
        continue;
      }
      
      console.log(`✓ ${fileName}: Found ${fullData.length} rows of data`);
      
      // Row 0 is headers (row 5 in sheet)
      const headers = fullData[0];
      let colMap = {};
      
      for (let i = 0; i < headers.length; i++) {
        const h = String(headers[i] || "").toLowerCase().trim();
        if (h === "dg id") colMap.dgId = i;
        if (h === "player name") colMap.name = i;
        if (h === "model rank") colMap.modelRank = i;
        if (h === "finish position") colMap.finishPos = i;
        // Actual columns (post-tournament)
        if (h === "sg total") colMap.sgTotal = i;
        if (h === "driving distance") colMap.drivDist = i;
        if (h === "driving accuracy") colMap.drivAcc = i;
        if (h === "sg approach") colMap.sgApproach = i;
        if (h === "sg around green") colMap.sgAroundGreen = i;
        if (h === "sg putting") colMap.sgPutting = i;
        // Model columns (pre-tournament predictions)
        if (h === "sg total - model") colMap.sgTotalModel = i;
        if (h === "driving distance - model") colMap.drivDistModel = i;
        if (h === "driving accuracy - model") colMap.drivAccModel = i;
        if (h === "sg approach - model") colMap.sgApproachModel = i;
        if (h === "sg around green - model") colMap.sgAroundGreenModel = i;
        if (h === "sg putting - model") colMap.sgPuttingModel = i;
      }
      
      console.log(`✓ ${fileName}: Column map ready (${Object.keys(colMap).length} columns found)`);
      
      // Find model columns (they're marked "- Model")
      let modelMap = {};
      for (let i = 0; i < headers.length; i++) {
        const h = String(headers[i] || "").toLowerCase().trim();
        if (h.includes("model")) {
          const stat = h.replace(" - model", "").trim();
          modelMap[stat] = i;
        }
      }
      
      // Parse players - starting from row 1 (row 6 in sheet)
      let tournamentPlayers = [];
      for (let i = 1; i < fullData.length; i++) {
        const row = fullData[i];
        const dgId = String(row[colMap.dgId] || "").trim();
        if (!dgId || dgId.length === 0) break;
        
        const name = String(row[colMap.name] || "").trim();
        if (!name || name.length === 0) continue;
        
        const modelRank = parseInt(row[colMap.modelRank]) || 999;
        const finishStr = String(row[colMap.finishPos] || "").trim();
        
        // Parse finish position properly
        let finishPos = 999;
        if (!isNaN(parseInt(finishStr))) {
          finishPos = parseInt(finishStr);
        } else if (finishStr.includes("T")) {
          const pos = parseInt(finishStr.replace("T", ""));
          if (!isNaN(pos)) finishPos = pos;
        }
        
        // Validate ranks are reasonable (1-200)
        if (modelRank < 1 || modelRank > 500 || finishPos < 1 || finishPos > 500) {
          console.warn(`  ⚠️ Skipping ${name}: Invalid ranks (model: ${modelRank}, finish: ${finishPos})`);
          continue;
        }
        
        console.log(`  ${name}: Rank ${modelRank} → Finish ${finishPos}`);
        
        const player = {
          dgId: dgId,
          name: name,
          modelRank: modelRank,
          finishPos: finishPos,
          finishText: finishStr,
          statDeltas: {}
        };
        
        // Collect stat deltas: Delta = Model - Actual
        const statList = [
          { key: "SG Total", actual: colMap.sgTotal, model: colMap.sgTotalModel },
          { key: "Driving Distance", actual: colMap.drivDist, model: colMap.drivDistModel },
          { key: "Driving Accuracy", actual: colMap.drivAcc, model: colMap.drivAccModel },
          { key: "SG Approach", actual: colMap.sgApproach, model: colMap.sgApproachModel },
          { key: "SG Around Green", actual: colMap.sgAroundGreen, model: colMap.sgAroundGreenModel },
          { key: "SG Putting", actual: colMap.sgPutting, model: colMap.sgPuttingModel }
        ];
        
        for (const stat of statList) {
          if (stat.actual !== undefined && stat.model !== undefined) {
            const actual = parseFloat(row[stat.actual]) || 0;
            const model = parseFloat(row[stat.model]) || 0;
            const delta = model - actual; // Model prediction - actual result
            
            player.statDeltas[stat.key] = delta;
            
            if (!seasonStats.allStatDeltas[stat.key]) {
              seasonStats.allStatDeltas[stat.key] = { deltas: [], count: 0, sumAbs: 0 };
            }
            seasonStats.allStatDeltas[stat.key].deltas.push(delta);
            seasonStats.allStatDeltas[stat.key].sumAbs += Math.abs(delta);
            seasonStats.allStatDeltas[stat.key].count++;
          }
        }
        
        tournamentPlayers.push(player);
        seasonStats.totalPlayers++;
        
        if (Math.abs(modelRank - finishPos) >= 15) {
          seasonStats.allMisses.push({ tournament: fileName, ...player });
        }
      }
      
      console.log(`✓ ${fileName}: Parsed ${tournamentPlayers.length} players`);
      
      // Calculate average miss only for players who finished (exclude CUT/WD with finishPos=999)
      const finishers = tournamentPlayers.filter(p => p.finishPos !== 999);
      const avgMiss = finishers.length > 0 
        ? finishers.reduce((s, p) => s + Math.abs(p.modelRank - p.finishPos), 0) / finishers.length
        : 0;
      
      console.log(`✓ ${fileName}: ${finishers.length} finishers, avg miss: ${avgMiss.toFixed(1)}`);
      
      // Create per-tournament analysis sheet
      createTournamentAnalysis(masterSs, fileName, tournamentPlayers);
      
      seasonStats.tournaments.push({
        name: fileName,
        playerCount: finishers.length, // Only count actual finishers
        avgMiss: avgMiss
      });
    }
    
    // Create season summary
    createSeasonSummary(masterSs, seasonStats);
    
    let msg = `📊 ACCURACY ANALYSIS COMPLETE\n\n`;
    msg += `Tournaments: ${seasonStats.tournaments.length}\n`;
    msg += `Total Players: ${seasonStats.totalPlayers}\n`;
    msg += `Avg Miss Score: ${(seasonStats.allMisses.reduce((s, p) => s + Math.abs(p.modelRank - p.finishPos), 0) / seasonStats.allMisses.length).toFixed(1)}\n\n`;
    msg += `✅ Created per-tournament sheets + season summary\n`;
    msg += `🔍 Look at big misses to find stat patterns`;
    
    SpreadsheetApp.getUi().alert(msg);
    
  } catch (e) {
    SpreadsheetApp.getUi().alert(`ERROR: ${e.message}\n\n${e.stack}`);
  }
}

function createTournamentAnalysis(masterSs, tournamentName, players) {
  const sheetName = tournamentName.substring(0, 30) + " Accuracy";
  let sheet = masterSs.getSheetByName(sheetName);
  if (sheet) masterSs.deleteSheet(sheet);
  sheet = masterSs.insertSheet(sheetName);
  
  // Header
  sheet.appendRow(["Player", "Model Rank", "Finish Pos", "Miss Score", "SG Total Δ", "Driving Dist Δ", "Driving Acc Δ", "SG Approach Δ", "SG Around Green Δ", "SG Putting Δ"]);
  sheet.getRange(1, 1, 1, 10).setFontWeight("bold").setBackground("#1f2937").setFontColor("white");
  
  // Sort by miss score descending
  const sorted = players.sort((a, b) => Math.abs(b.modelRank - b.finishPos) - Math.abs(a.modelRank - a.finishPos));
  
  // Add players
  for (const player of sorted) {
    if (player.finishPos === 999) continue; // Skip non-finishers
    
    sheet.appendRow([
      player.name,
      player.modelRank,
      player.finishText,
      Math.abs(player.modelRank - player.finishPos),
      (player.statDeltas["SG Total"] || 0).toFixed(2),
      (player.statDeltas["Driving Distance"] || 0).toFixed(0),
      (player.statDeltas["Driving Accuracy"] || 0).toFixed(1),
      (player.statDeltas["SG Approach"] || 0).toFixed(2),
      (player.statDeltas["SG Around Green"] || 0).toFixed(2),
      (player.statDeltas["SG Putting"] || 0).toFixed(2)
    ]);
  }
  
  // Format
  sheet.autoResizeColumns(1, 10);
  
  // Summary
  const avgMiss = sorted.filter(p => p.finishPos !== 999).reduce((s, p) => s + Math.abs(p.modelRank - p.finishPos), 0) / sorted.filter(p => p.finishPos !== 999).length;
  sheet.appendRow([" "]); // Spacer row (can't append truly empty rows)
  sheet.appendRow([`Average Miss Score: ${avgMiss.toFixed(1)}`]);
}

function createSeasonSummary(masterSs, seasonStats) {
  let sheet = masterSs.getSheetByName("Season Accuracy Summary");
  if (sheet) masterSs.deleteSheet(sheet);
  sheet = masterSs.insertSheet("Season Accuracy Summary");
  
  // Tournament summary
  sheet.appendRow(["TOURNAMENT PERFORMANCE"]);
  sheet.getRange(1, 1).setFontWeight("bold").setFontSize(12);
  
  sheet.appendRow(["Tournament", "Players", "Avg Miss Score"]);
  sheet.getRange(2, 1, 1, 3).setFontWeight("bold").setBackground("#e5e7eb");
  
  for (const t of seasonStats.tournaments.sort((a, b) => a.avgMiss - b.avgMiss)) {
    sheet.appendRow([t.name, t.playerCount, t.avgMiss.toFixed(1)]);
  }
  
  // Stat accuracy
  sheet.appendRow([" "]); // Spacer row
  sheet.appendRow(["STAT PREDICTION ACCURACY (Actual - Model)"]);
  sheet.getRange(seasonStats.tournaments.length + 4, 1).setFontWeight("bold").setFontSize(12);
  
  sheet.appendRow(["Stat", "Avg Delta", "Instances", "Assessment"]);
  sheet.getRange(seasonStats.tournaments.length + 5, 1, 1, 4).setFontWeight("bold").setBackground("#e5e7eb");
  
  let rowNum = seasonStats.tournaments.length + 6;
  for (const [stat, data] of Object.entries(seasonStats.allStatDeltas)) {
    const avgDelta = data.deltas.reduce((a, b) => a + b, 0) / data.count;
    const assessment = Math.abs(avgDelta) < 0.2 ? "✓ Good" : Math.abs(avgDelta) < 0.5 ? "~ Fair" : "✗ Off";
    
    sheet.appendRow([stat, avgDelta.toFixed(3), data.count, assessment]);
    rowNum++;
  }
  
  sheet.autoResizeColumns(1, 4);
}

function showValidationReport() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName("2025 Validation");
    
    if (!sheet) {
      SpreadsheetApp.getUi().alert("No validation report found. Run validation first.");
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      SpreadsheetApp.getUi().alert("No validation data available");
      return;
    }
    
    const headers = data[0];
    const tournamentIdx = headers.indexOf("Tournament");
    const correlationIdx = headers.indexOf("Correlation");
    const rmseIdx = headers.indexOf("RMSE");
    const topTenIdx = headers.indexOf("Top-10 %");
    const matchedIdx = headers.indexOf("Matched");
    
    // Find last run (rows group by date)
    let lastRunDate = null;
    let lastRunData = [];
    
    for (let i = data.length - 1; i > 0; i--) {
      const row = data[i];
      if (!row[0]) continue;
      
      const runDate = String(row[0]).trim();
      if (lastRunDate === null) {
        lastRunDate = runDate;
      }
      
      if (runDate === lastRunDate && row[tournamentIdx]) {
        lastRunData.unshift(row);
      } else if (runDate !== lastRunDate) {
        break;
      }
    }
    
    if (lastRunData.length === 0) {
      SpreadsheetApp.getUi().alert("No validation data found");
      return;
    }
    
    // Calculate summary statistics
    let totalTournaments = 0;
    let avgCorrelation = 0;
    let avgRMSE = 0;
    let avgTopTen = 0;
    let totalMatched = 0;
    
    for (const row of lastRunData) {
      if (row[tournamentIdx]) {
        totalTournaments++;
        avgCorrelation += Number(row[correlationIdx]) || 0;
        avgRMSE += Number(row[rmseIdx]) || 0;
        avgTopTen += Number(row[topTenIdx]) || 0;
        totalMatched += Number(row[matchedIdx]) || 0;
      }
    }
    
    avgCorrelation = Number((avgCorrelation / totalTournaments).toFixed(3));
    avgRMSE = Number((avgRMSE / totalTournaments).toFixed(2));
    avgTopTen = Number((avgTopTen / totalTournaments).toFixed(1));
    
    // Find best and worst tournaments
    let bestTourney = { name: "", corr: -2 };
    let worstTourney = { name: "", corr: 2 };
    
    for (const row of lastRunData) {
      const corr = Number(row[correlationIdx]) || 0;
      if (corr > bestTourney.corr) {
        bestTourney = { name: String(row[tournamentIdx]), corr: corr };
      }
      if (corr < worstTourney.corr) {
        worstTourney = { name: String(row[tournamentIdx]), corr: corr };
      }
    }
    
    // Build report
    let report = `📊 VALIDATION REPORT - ${lastRunDate}\n\n`;
    report += `SUMMARY\n`;
    report += `Tournaments Validated: ${totalTournaments}\n`;
    report += `Total Matched Players: ${totalMatched}\n`;
    report += `Avg Players/Tournament: ${Number((totalMatched / totalTournaments).toFixed(1))}\n\n`;
    
    report += `METRICS\n`;
    report += `Average Correlation: ${avgCorrelation}\n`;
    report += `Average RMSE: ${avgRMSE}\n`;
    report += `Average Top-10% Accuracy: ${avgTopTen}%\n\n`;
    
    report += `BEST TOURNAMENT\n`;
    report += `${bestTourney.name}\n`;
    report += `Correlation: ${bestTourney.corr}\n\n`;
    
    report += `WORST TOURNAMENT\n`;
    report += `${worstTourney.name}\n`;
    report += `Correlation: ${worstTourney.corr}\n\n`;
    
    report += `INTERPRETATION\n`;
    if (avgCorrelation > 0.7) {
      report += `✅ Excellent - Very strong predictive accuracy`;
    } else if (avgCorrelation > 0.5) {
      report += `🟢 Good - Strong predictive accuracy`;
    } else if (avgCorrelation > 0.3) {
      report += `🟡 Moderate - Fair predictive accuracy`;
    } else if (avgCorrelation > 0) {
      report += `🟠 Weak - Some predictive signal`;
    } else {
      report += `🔴 Negative - Weights need adjustment`;
    }
    
    SpreadsheetApp.getUi().alert(report);
  } catch (e) {
    SpreadsheetApp.getUi().alert(`ERROR: ${e.message}`);
  }
}

function runValidation2025() {
  writeValidationToSheet(2025);
}

function runValidation2026() {
  writeValidationToSheet(2026);
}

function writeValidationToSheet(year) {
  try {
    const summary = validateAllTournaments();
    if (summary.error) {
      SpreadsheetApp.getUi().alert(`Error: ${summary.error}`);
      return;
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheetName = `${year} Validation`;
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    const lastRow = sheet.getLastRow();
    const startRow = lastRow > 0 ? lastRow + 3 : 1;
    const headers = ["Date", "Tournament", "Correlation", "RMSE", "Top-10 %", "Matched"];
    sheet.getRange(startRow, 1, 1, headers.length).setValues([headers]).setFontWeight("bold");
    const dataStartRow = startRow + 1;
    const runDate = new Date().toLocaleDateString();
    const resultData = summary.individualResults.map(r => [runDate, r.tournament, r.correlation, r.rmse, r.topTenAccuracy, r.matchedPlayers]);
    if (resultData.length > 0) {
      sheet.getRange(dataStartRow, 1, resultData.length, headers.length).setValues(resultData);
    }
    sheet.autoResizeColumns(1, headers.length);
    let msg = `✅ Done!\n\nValidated: ${summary.tournamentsValidated}\nSkipped: ${summary.tournamentsSkipped}\nFailed: ${summary.failedValidations}\n\nCorr: ${summary.averageCorrelation}\nRMSE: ${summary.averageRMSE}`;
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    SpreadsheetApp.getUi().alert(`ERROR: ${e.message}`);
  }
}

function debugPredictionLoading() {
  try {
    // Open Valero workbook as test
    const folders = DriveApp.getFoldersByName("Golf 2025");
    if (!folders.hasNext()) {
      SpreadsheetApp.getUi().alert("Golf 2025 folder not found");
      return;
    }
    
    const golfFolder = folders.next();
    const files = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    let valeroFile = null;
    
    while (files.hasNext()) {
      const file = files.next();
      if (file.getName().includes("Valero")) {
        valeroFile = file;
        break;
      }
    }
    
    if (!valeroFile) {
      SpreadsheetApp.getUi().alert("Valero workbook not found");
      return;
    }
    
    const ss = SpreadsheetApp.open(valeroFile);
    const modelSheet = ss.getSheetByName("Player Ranking Model");
    
    if (!modelSheet) {
      SpreadsheetApp.getUi().alert("Player Ranking Model sheet not found");
      return;
    }
    
    // Show what columns exist
    const allData = modelSheet.getRange("A1:E20").getValues();
    
    let msg = "PLAYER RANKING MODEL (Rows 1-20, Cols A-E):\n\n";
    for (let i = 0; i < Math.min(10, allData.length); i++) {
      msg += `Row ${i+1}: ${allData[i].join(" | ")}\n`;
    }
    
    msg += "\n\nC6:D data (current load range):\n";
    const c6d = modelSheet.getRange("C6:D15").getValues();
    for (let i = 0; i < c6d.length; i++) {
      msg += `Row ${i+6}: DG ID="${c6d[i][0]}" | Name="${c6d[i][1]}"\n`;
    }
    
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    SpreadsheetApp.getUi().alert(`ERROR: ${e.message}`);
  }
}

/**
 * Analyzes winner prediction accuracy across all tournaments
 * Shows detailed breakdown of actual finishers vs predictions with miss scores
 */
function analyzeWinnerPredictions() {
  try {
    const folders = DriveApp.getFoldersByName("Golf 2025");
    if (!folders.hasNext()) {
      SpreadsheetApp.getUi().alert("Golf 2025 folder not found");
      return;
    }
    
    const golfFolder = folders.next();
    const workbookFiles = golfFolder.getFilesByType(MimeType.GOOGLE_SHEETS);
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let masterSheet = ss.getSheetByName("Winner Analysis");
    if (masterSheet) {
      ss.deleteSheet(masterSheet);
    }
    masterSheet = ss.insertSheet("Winner Analysis");
    
    // Master headers
    const masterHeaders = ["Tournament", "Actual Pos", "Player Name", "Model Rank", "Miss Score", "Gap Analysis"];
    masterSheet.appendRow(masterHeaders);
    masterSheet.getRange(1, 1, 1, masterHeaders.length).setFontWeight("bold").setBackground("#1f2937").setFontColor("white");
    
    let rowNum = 2;
    let totalAvgMiss = 0;
    let tournamentCount = 0;
    
    while (workbookFiles.hasNext()) {
      const file = workbookFiles.next();
      const fileName = file.getName();
      const ss = SpreadsheetApp.open(file);
      
      // Load actual results with Model Rank - from Tournament Results sheet
      let resultsSheet = ss.getSheetByName("Tournament Results");
      if (!resultsSheet) continue;
      
      // B=DG ID, C=Player Name, D=Model Rank, E=Finish Position
      const resultsRange = resultsSheet.getRange("B6:E");
      const resultsData = resultsRange.getValues();
      const results = [];
      
      for (let i = 0; i < resultsData.length; i++) {
        const row = resultsData[i];
        const dgId = String(row[0] || "").trim();
        const name = String(row[1] || "").trim();
        const modelRankStr = String(row[2] || "").trim();
        const finishStr = String(row[3] || "").trim();
        
        if (!dgId) break;
        
        const modelRank = isNaN(parseInt(modelRankStr)) ? 999 : parseInt(modelRankStr);
        
        // Parse finish position from E column - handle T3, T5, or plain numbers
        let finishPosition = 999;
        if (!isNaN(parseInt(finishStr))) {
          finishPosition = parseInt(finishStr);
        } else if (finishStr.includes("T")) {
          const cleanedPos = finishStr.replace("T", "");
          if (!isNaN(parseInt(cleanedPos))) {
            finishPosition = parseInt(cleanedPos);
          }
        }
        
        results.push({
          dgId: dgId,
          name: name,
          modelRank: modelRank,
          finishPosition: finishPosition,
          finishText: finishStr,
          isCut: finishPosition === 999
        });
      }
      
      if (results.length === 0) continue;
      
      // Get only top 20 finishers - filter by finish position <= 20
      const top20Finishers = results
        .filter(r => r.finishPosition <= 20)
        .sort((a, b) => a.finishPosition - b.finishPosition);
      
      if (top20Finishers.length === 0) continue;
      
      // Calculate stats for this tournament
      let tourneyMissTotal = 0;
      
      // Add tournament section header
      masterSheet.getRange(rowNum, 1, 1, masterHeaders.length)
        .setBackground("#6b7280")
        .setFontColor("white")
        .setFontWeight("bold");
      masterSheet.getRange(rowNum, 1).setValue(fileName);
      rowNum++;
      
      // Add each top finisher
      for (const finisher of top20Finishers) {
        const missScore = finisher.modelRank - finisher.finishPosition;
        tourneyMissTotal += Math.abs(missScore);
        
        const gapAnalysis = missScore > 0 
          ? `Predicted ${missScore} spots too low` 
          : `Predicted ${Math.abs(missScore)} spots too high`;
        
        masterSheet.appendRow([
          "",
          finisher.finishPosition + (finisher.finishText.startsWith("T") ? "T" : ""),
          finisher.name,
          finisher.modelRank,
          missScore,
          gapAnalysis
        ]);
        rowNum++;
      }
      
      // Summary row for tournament
      const avgMiss = top20Finishers.length > 0 ? (tourneyMissTotal / top20Finishers.length).toFixed(1) : 0;
      masterSheet.getRange(rowNum, 1).setValue(`${fileName} - Avg Miss Score: ${avgMiss}`).setFontStyle("italic");
      rowNum++;
      rowNum++; // spacing
      
      totalAvgMiss += parseFloat(avgMiss);
      tournamentCount++;
    }
    
    // Format columns
    masterSheet.autoResizeColumns(1, masterHeaders.length);
    
    // Summary
    const overallAvgMiss = tournamentCount > 0 ? (totalAvgMiss / tournamentCount).toFixed(1) : 0;
    let msg = `📊 TOP-20 FINISHER PREDICTION ANALYSIS\n\n`;
    msg += `Tournaments Analyzed: ${tournamentCount}\n`;
    msg += `Overall Avg Miss Score: ${overallAvgMiss}\n\n`;
    msg += `(Positive = Predicted too low | Negative = Predicted too high)\n\n`;
    msg += `✅ Detailed breakdown saved to "Winner Analysis" sheet`;
    
    SpreadsheetApp.getUi().alert(msg);
    
  } catch (e) {
    SpreadsheetApp.getUi().alert(`ERROR: ${e.message}\n\n${e.stack}`);
  }
}

/**
 * Analyzes validation results to identify which tournaments/weights work best
 */
function analyzeWeightEffectiveness() {
  try {
    const ss = SpreadsheetApp.getActive();
    let sheet = ss.getSheetByName("2025 Validation");
    if (!sheet) {
      SpreadsheetApp.getUi().alert("No 2025 Validation sheet found");
      return;
    }
    
    const data = sheet.getDataRange().getValues();
    if (data.length < 2) {
      SpreadsheetApp.getUi().alert("No validation data to analyze");
      return;
    }
    
    const headers = data[0];
    const tournamentIdx = headers.indexOf("Tournament");
    const correlationIdx = headers.indexOf("Correlation");
    const rmseIdx = headers.indexOf("RMSE");
    const topTenIdx = headers.indexOf("Top-10 %");
    
    if (correlationIdx === -1 || tournamentIdx === -1) {
      SpreadsheetApp.getUi().alert("Could not find required columns in validation data");
      return;
    }
    
    // Aggregate by tournament
    const tournaments = {};
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[tournamentIdx] || row[tournamentIdx] === "") continue;
      
      const tournament = String(row[tournamentIdx]).trim();
      const correlation = Number(row[correlationIdx]) || 0;
      const rmse = Number(row[rmseIdx]) || 0;
      const topTen = Number(row[topTenIdx]) || 0;
      
      if (!tournaments[tournament]) {
        tournaments[tournament] = { scores: [], rmses: [], topTens: [], count: 0 };
      }
      tournaments[tournament].scores.push(correlation);
      tournaments[tournament].rmses.push(rmse);
      tournaments[tournament].topTens.push(topTen);
      tournaments[tournament].count++;
    }
    
    // Calculate averages
    const results = [];
    for (const [tournament, data] of Object.entries(tournaments)) {
      const avgCorr = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
      const avgRmse = data.rmses.reduce((a, b) => a + b, 0) / data.rmses.length;
      const avgTopTen = data.topTens.reduce((a, b) => a + b, 0) / data.topTens.length;
      
      results.push({
        tournament: tournament,
        correlation: Number(avgCorr.toFixed(3)),
        rmse: Number(avgRmse.toFixed(2)),
        topTen: Number(avgTopTen.toFixed(1)),
        runs: data.count,
        status: avgCorr > 0.5 ? "🟢 Strong" : avgCorr > 0.3 ? "🟡 Moderate" : avgCorr > 0 ? "🟠 Weak" : "🔴 Negative"
      });
    }
    
    // Sort by correlation (best first)
    results.sort((a, b) => b.correlation - a.correlation);
    
    // Create/clear analysis sheet
    let analysisSheet = ss.getSheetByName("Weight Analysis");
    if (analysisSheet) {
      ss.deleteSheet(analysisSheet);
    }
    analysisSheet = ss.insertSheet("Weight Analysis");
    
    // Headers
    const outputHeaders = ["Tournament", "Correlation", "RMSE", "Top-10%", "Runs", "Status"];
    analysisSheet.appendRow(outputHeaders);
    analysisSheet.getRange(1, 1, 1, outputHeaders.length).setFontWeight("bold").setBackground("#1f2937").setFontColor("white");
    
    // Data rows
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      analysisSheet.appendRow([r.tournament, r.correlation, r.rmse, r.topTen, r.runs, r.status]);
    }
    
    // Format
    analysisSheet.getRange(2, 2, results.length, 1).setNumberFormat("0.000");
    analysisSheet.getRange(2, 3, results.length, 1).setNumberFormat("0.00");
    analysisSheet.getRange(2, 4, results.length, 1).setNumberFormat("0.0");
    analysisSheet.autoResizeColumns(1, 6);
    
    // Summary
    const avgCorr = results.reduce((s, r) => s + r.correlation, 0) / results.length;
    const best = results[0];
    const worst = results[results.length - 1];
    
    let msg = `📊 Weight Effectiveness Analysis\n\n`;
    msg += `Best Tournament: ${best.tournament}\nCorr: ${best.correlation}\n\n`;
    msg += `Worst Tournament: ${worst.tournament}\nCorr: ${worst.correlation}\n\n`;
    msg += `Overall Avg Correlation: ${Number(avgCorr.toFixed(3))}\n\n`;
    msg += `✅ Analysis saved to "Weight Analysis" sheet`;
    
    SpreadsheetApp.getUi().alert(msg);
  } catch (e) {
    SpreadsheetApp.getUi().alert(`ERROR: ${e.message}`);
  }
}
