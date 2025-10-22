function moveQualifiedProjects() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = ss.getSheetByName("Project/Proposal Details");
  var targetSheet = ss.getSheetByName("LPA Prequalifications");

  var sourceData = sourceSheet.getDataRange().getValues();  // Fetch all data from the source sheet
  var statusColumnIndex = 12; // Column L, assuming 1-based index; adjust if different
  var startingRowIndex = 3; // Start from row 3 to skip headers

  for (var i = sourceData.length -1; i >= startingRowIndex; i--) {
    var row = sourceData[i];
    if (row[statusColumnIndex - 1] === "Qualification") { // Check if status is "Qualification"
      // Extract and prepare specific columns (A, B, C, D, F, L, N) to move
      var selectedData = [
        row[0],  // Column A (owner)
        row[1],  // Column B (client)
        row[2],  // Column C (industry)
        row[3],  // Column D (proposal #)
        row[5],  // Column F (projectName)
        row[statusColumnIndex -1], //Column L (status)
        row[13],  // Column N (notes)
              ];

      // Append the selected columns to the target sheet
      targetSheet.appendRow(selectedData);

      // Clear the row from the source sheet to prevent re-checking
      sourceSheet.deleteRow(i + 1); // JavaScript arrays indexed from 0; Sheets from 1; increment since row is removed
    }
  }
  
  Logger.log("Qualified projects moved to LPA Prequalifications sheet.");
}

