/**
 * Create a visible debug sheet showing calculation breakdown for each player
 */
function createDebugCalculationSheet(ss, processedData, metricGroups, groupStats) {
  try {
    // Get or create debug sheet
    let debugSheet = null;
    const sheetName = "🔧 Debug - Calculations";
    
    // Try to get existing sheet
    try {
      debugSheet = ss.getSheetByName(sheetName);
      if (debugSheet) {
        debugSheet.clear();
      }
    } catch(e) {
      console.log("Sheet not found, will create: " + e.toString());
    }
    
    // If sheet doesn't exist, create it
    if (!debugSheet) {
      try {
        debugSheet = ss.insertSheet(sheetName);
      } catch(e) {
        console.log("Error inserting sheet: " + e.toString());
        // If we still can't get/create the sheet, log and return
        Logger.log("WARNING: Could not create debug sheet");
        return;
      }
    }
    
    // Make the sheet visible (not hidden)
    try {
      debugSheet.showSheet();
    } catch(e) {
      console.log("Sheet already visible or error showing sheet: " + e.toString());
    }
    
    // Add headers
    const headers = [
      "Rank",
      "Player Name",
      "DG ID",
      "Data Coverage %",
      "Dampening Applied?",
      "Group Scores (Before Dampening)",
      "Group Scores (After Dampening if applicable)",
      "Weighted Score",
      "Confidence Factor",
      "Past Perf Multiplier",
      "Refined Weighted Score",
      "Final WAR",
      "Notes"
    ];
    
    debugSheet.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight("bold")
      .setBackground("#4285F4")
      .setFontColor("white");
    
    // Add data for each player - SORT BY RANK
    let row = 2;
    const sortedPlayers = processedData
      .filter(p => p.rank !== undefined) // Only include players with rank
      .sort((a, b) => a.rank - b.rank); // Sort by rank ascending
    
    for (const player of sortedPlayers) {
      const dataCoveragePercent = (player.dataCoverage * 100).toFixed(1);
      const needsDampening = player.dataCoverage < 0.70;
      
      // Format group scores
      let groupScoresText = "";
      if (player.groupScoresBeforeDampening) {
        groupScoresText = Object.entries(player.groupScoresBeforeDampening)
          .map(([name, score]) => `${name}: ${score.toFixed(3)}`)
          .join("; ");
      }
      
      let groupScoresAfter = "";
      if (needsDampening && player.groupScoresAfterDampening) {
        groupScoresAfter = Object.entries(player.groupScoresAfterDampening)
          .map(([name, score]) => `${name}: ${score.toFixed(3)}`)
          .join("; ");
      }
      
      const notes = [];
      if (needsDampening) {
        notes.push(`Dampened by √${player.dataCoverage.toFixed(2)} = ${Math.sqrt(player.dataCoverage).toFixed(3)}`);
      }
      if (player.isLowConfidencePlayer) {
        notes.push(`Low confidence baseline: ${player.baselineScore.toFixed(2)}`);
      }
      if (player.hasRecentTop10) {
        notes.push("Has recent top 10");
      }
      
      const rowData = [
        player.rank,
        player.name,
        player.dgId,
        dataCoveragePercent,
        needsDampening ? "YES" : "NO",
        groupScoresText,
        groupScoresAfter,
        player.weightedScore.toFixed(3),
        player.confidenceFactor.toFixed(3),
        player.pastPerformanceMultiplier.toFixed(3),
        player.refinedWeightedScore.toFixed(3),
        player.war.toFixed(2),
        notes.join(" | ")
      ];
      
      debugSheet.getRange(row, 1, 1, headers.length).setValues([rowData]);
      
      // Color code based on performance
      if (player.refinedWeightedScore > 2) {
        debugSheet.getRange(row, 1, 1, headers.length).setBackground("#C6EFCE");
      } else if (player.refinedWeightedScore < 0.5) {
        debugSheet.getRange(row, 1, 1, headers.length).setBackground("#FFC7CE");
      }
      
      row++;
    }
    
    // Format columns
    debugSheet.autoResizeColumns(1, headers.length);
    debugSheet.setColumnWidth(5, 300); // Wide column for group scores
    debugSheet.setColumnWidth(6, 300); // Wide column for group scores after
    debugSheet.setColumnWidth(12, 400); // Wide column for notes
    
    console.log(`Debug sheet created with ${sortedPlayers.length} players`);
  } catch(e) {
    Logger.log("Error creating debug sheet: " + e.toString());
    console.log("Error stack: " + e.stack);
  }
}
