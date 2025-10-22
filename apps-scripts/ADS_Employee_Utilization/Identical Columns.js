// function onEdit(e) {
//   var sheet = e.source.getActiveSheet();
//   if (sheet.getName() === 'Tracker Invoices - Input Sheet') {
//     updateAllCells();
//   }
// }

// function updateAllDetailSheets() {
//   var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
//   var sheets = spreadsheet.getSheets();
//   var errorLogs = [];
//   var processedSheets = 0;
  
//   console.log("Starting to process sheets...");
  
//   for (var i = 0; i < sheets.length; i++) {
//     var sheet = sheets[i];
//     if (sheet.getName().includes("Detail")) {
//       console.log("Processing sheet: " + sheet.getName());
//       try {
//         updateSheetCells(sheet);
//         processedSheets++;
//         console.log("Finished processing sheet: " + sheet.getName());
//       } catch (error) {
//         errorLogs.push("Error processing sheet '" + sheet.getName() + "': " + error.message);
//         console.log("Error in sheet '" + sheet.getName() + "': " + error.message);
//       }
//     } else {
//       console.log("Skipping sheet: " + sheet.getName() + " (does not include 'Detail')");
//     }
//   }
  
//   console.log("Processed " + processedSheets + " sheets.");
  
//   if (errorLogs.length > 0) {
//     console.log("Errors encountered during execution:");
//     errorLogs.forEach(function(log) {
//       console.log(log);
//     });
//   } else {
//     console.log("All sheets processed successfully.");
//   }
// }

// function updateSheetCells(sheet) {
//   var range = sheet.getRange("C2:BJ16");
//   var processedCells = 0;
  
//   console.log("Starting to process cells in sheet: " + sheet.getName());
  
//   for (var row = range.getRow(); row <= range.getLastRow(); row++) {
//     for (var col = range.getColumn(); col <= range.getLastColumn(); col++) {
//       updateCellNote(sheet, sheet.getRange(row, col));
//       processedCells++;
      
//       if (processedCells % 100 === 0) {
//         console.log("Processed " + processedCells + " cells in " + sheet.getName());
//       }
//     }
//   }
  
//   console.log("Finished processing " + processedCells + " cells in " + sheet.getName());
// }

// function updateCellNote(sheet, cell) {
//   console.log("Processing cell " + cell.getA1Notation() + " in sheet " + sheet.getName());
//   if (cell.getValue() !== '') {
//     try {
//       var controlValue = getControlValue(sheet.getName());
//       var columnLetter = cell.getA1Notation().replace(/[0-9]/g, '');
//       var headerValue = sheet.getRange(columnLetter + "1").getValue();
      
//       console.log("Control Value: " + controlValue);
//       console.log("Header Value: " + headerValue);
      
//       var result = findMatchingDate(headerValue, controlValue);
      
//       console.log("Result for cell " + cell.getA1Notation() + ": " + result);
      
//       if (result && result !== "No match") {
//         var date = parseDate(result);
//         if (isValidDate(date)) {
//           cell.setNote("Date: " + formatDate(date));
//           console.log("Set note for cell " + cell.getA1Notation() + ": Date: " + formatDate(date));
//         } else {
//           cell.clearNote();
//           console.log("Cleared note for cell " + cell.getA1Notation() + " (invalid date)");
//         }
//       } else {
//         cell.clearNote();
//         console.log("Cleared note for cell " + cell.getA1Notation() + " (no match or empty result)");
//       }
//     } catch (error) {
//       console.log("Error in sheet '" + sheet.getName() + "', cell " + cell.getA1Notation() + ": " + error.toString());
//       cell.clearNote();
//     }
//   } else {
//     console.log("Skipping empty cell " + cell.getA1Notation());
//   }
// }

// function findMatchingDate(headerValue, controlValue) {
//   var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Tracker Invoices - Input Sheet');
//   var data = sheet.getDataRange().getValues();
  
//   for (var i = 1; i < data.length; i++) {  // Start from 1 to skip header row
//     if (data[i][0].toString() === headerValue.toString() && data[i][1] === controlValue) {
//       return data[i][2];  // Return the date from column C
//     }
//   }
  
//   return "No match";
// }

// function parseDate(dateString) {
//   if (typeof dateString === 'string' && dateString.includes('T')) {
//     // Parse ISO 8601 date string
//     return new Date(dateString);
//   }
//   var date = new Date(dateString);
//   if (isValidDate(date)) {
//     return date;
//   }
//   return null;
// }

// function isValidDate(d) {
//   return d instanceof Date && !isNaN(d);
// }

// function formatDate(date) {
//   return Utilities.formatDate(date, Session.getScriptTimeZone(), "M/d/yyyy");
// }

// function getControlValue(sheetName) {
//   console.log("Getting control value for sheet: " + sheetName);
//   if (!sheetName.includes(" - Detail")) {
//     throw new Error("Sheet name does not follow the '[variable] - Detail' pattern");
//   }
//   var controlValue = sheetName.split(" - Detail")[0];
//   console.log("Control value for " + sheetName + ": " + controlValue);
//   return controlValue;
// }

