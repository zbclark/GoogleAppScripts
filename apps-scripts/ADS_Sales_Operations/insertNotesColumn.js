function insertWeeklyColumn() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sheet1 = spreadsheet.getSheetByName("Project/Proposal Details");

  // Validate sheet exists before proceeding
  if (!sheet1) {
    throw new Error("Sheet 'Project/Proposal Details' not found. Please check the sheet name.");
  }

  // Function to insert a column and update headers
  function insertColumnAndUpdateHeader(sheet, columnToInsertBefore) {
    sheet.insertColumnBefore(columnToInsertBefore);

    // Calculate the date for the upcoming Wednesday
    var today = new Date();
    var daysUntilWednesday = (3 - today.getDay() + 7) % 7;
    var wednesdayDate = new Date(today.getTime() + daysUntilWednesday * 24 * 60 * 60 * 1000);
    var formattedDate = Utilities.formatDate(wednesdayDate, spreadsheet.getSpreadsheetTimeZone(), "MM/dd/yyyy");

    // Set the header in row 2 of the newly inserted column
    var headerCell = sheet.getRange(2, columnToInsertBefore);
    headerCell.setValue("Notes: " + formattedDate);
    headerCell.setFontWeight("bold");
    headerCell.setBorder(null, null, true, null, null, null, "black", SpreadsheetApp.BorderStyle.SOLID);
    headerCell.setHorizontalAlignment("center");
    headerCell.setVerticalAlignment("middle");

    var initialColumnWidth = sheet.getColumnWidth(1);
    sheet.setColumnWidth(columnToInsertBefore, 2 * initialColumnWidth);

    // Set the entire newly inserted column to wrap text
    var entireColumnRange = sheet.getRange(1, columnToInsertBefore, sheet.getMaxRows());
    entireColumnRange.setWrap(true);
  }

  // Insert column in specified location
  insertColumnAndUpdateHeader(sheet1, 15); // Before column N for "Project/Proposal Details"
}

