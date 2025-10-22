function moveQualifiedProjects() {
  // DISABLED: This function previously moved Qualification projects to LPA Prequalifications
  // Modified to keep all Qualification projects on Project/Proposal Details tab
  
  Logger.log("moveQualifiedProjects function disabled - Qualification projects now remain on Project Details tab");
  
  /* ORIGINAL FUNCTIONALITY COMMENTED OUT:
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getSheetByName("Project/Proposal Details");
  var targetSheet = ss.getSheetByName("LPA Prequalifications");

  var sourceData = sourceSheet.getDataRange().getValues();
  var statusColumnIndex = 12; // Column L
  var startingRowIndex = 3; // Start from row 3 to skip headers

  for (var i = sourceData.length -1; i >= startingRowIndex; i--) {
    var row = sourceData[i];
    if (row[statusColumnIndex - 1] === "Qualification") {
      var selectedData = [
        row[0],  // Column A (owner)
        row[1],  // Column B (client)
        row[2],  // Column C (industry)
        row[3],  // Column D (proposal #)
        row[5],  // Column F (projectName)
        row[statusColumnIndex -1], //Column L (status)
        row[13],  // Column N (notes)
      ];

      targetSheet.appendRow(selectedData);
      sourceSheet.deleteRow(i + 1);
    }
  }
  */
}

