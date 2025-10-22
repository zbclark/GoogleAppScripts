function checkDropdown() {
  // Get the spreadsheet
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var sourceSheet = spreadsheet.getSheetByName("Project/Proposal Details");

  // Get pertinent rows in the sheet
  var lastExcludedRow = 2;
  var lastRow = sourceSheet.getLastRow();

  // Loop through the rows in the sheet
  for (var rowNumber = lastExcludedRow + 1; rowNumber <= lastRow; rowNumber++) {
    // Get the value in column A - F, L (1-6, 12)
    var rowData = [
      sourceSheet.getRange(rowNumber, 1).getValue(), // Column A (Account Owner)
      sourceSheet.getRange(rowNumber, 2).getValue(), // Column B (Client)
      sourceSheet.getRange(rowNumber, 3).getValue(), // Column C (Industry)
      sourceSheet.getRange(rowNumber, 4).getValue(), // Column D (Proposal #)
      sourceSheet.getRange(rowNumber, 5).getValue(), // Column E (WO #)
      sourceSheet.getRange(rowNumber, 6).getValue(), // Column F (Project Name)
      sourceSheet.getRange(rowNumber, 12).getDataValidation(), // Column L (Status - validation)
      sourceSheet.getRange(rowNumber, 3).getDataValidation(), // Column C (Industry)
      sourceSheet.getRange(rowNumber, 12).getValue(), // Column L (Status - value)
      sourceSheet.getRange(rowNumber, 13).getDataValidation(), // Column M (Production Status)
      sourceSheet.getRange(rowNumber, 14).getDataValidation() // Column N (Completion Percentage)
      ];
    //console.log('rowNumber:', rowNumber, rowData)    

    // Check if any of the cells in columns A, B, D - F HAVE data AND column L does NOT have a dropdown
     if (rowData[6] !== null && rowData[7] !== null && rowData[9] !== null && rowData[10] !== null) {
        console.log("Columns C, L, M and N in row: " +  rowNumber + " already has data validation, skipping.");
        continue;
    } 
 
    if ((rowData[0] !== "" || rowData[1] !== "" || rowData[3] !== "" || rowData[4] !== "" || rowData[5] !== "") && rowData[6] === null) {
      // Create the dropdown options
      var statusDropdownOptions = ["\u200B", "Solicitation", "Qualification", "Proposal", "Hold", "Pending NTP", "InWork", "Completed", "Final Invoice Sent", "Closed-Lost"];
      
      // Create the data validation rule for the Statusdropdown
      var statusRule = SpreadsheetApp.newDataValidation()
                    .requireValueInList(statusDropdownOptions)
                    .setAllowInvalid(false)
                    .build();

      // Apply the data validation rule to column L in the current row
      sourceSheet.getRange(rowNumber, 12).setDataValidation(statusRule);

      // Set value to [blank] only if the current value is not valid
      var statusRange = sourceSheet.getRange(rowNumber, 12);
      var currentStatusValue = statusRange.getValue();
      var validStatus = statusDropdownOptions.includes(currentStatusValue) ? currentStatusValue : "\u200B";
      statusRange.setValue(validStatus);
      console.log("Status Dropdown added to column L in row", rowNumber);


    // Check if any of the cells in columns A - F HAVE data AND column C does NOT have a dropdown
    } else if ((rowData[0] !== "" || rowData[1] !== "" || rowData[3] !== "" || rowData[4] !== "" || rowData[5] !== "") && rowData[7] === null) {
      // Create the dropdown options
      var industryDropdownOptions = ["\u200B", "DOT", "Energy", "Engineering", "Federal", "Municipal", "Survey", "Other"];

      // Create the data validation rule for the Industry dropdown
      var industryRule = SpreadsheetApp.newDataValidation()
                    .requireValueInList(industryDropdownOptions)
                    .setAllowInvalid(false)
                    .build();

      // Apply the data validation rule to column C in the current row              
      sourceSheet.getRange(rowNumber, 3).setDataValidation(industryRule);

      // Set value to [blank] only if the current value is not valid
      var industryRange = sourceSheet.getRange(rowNumber, 3);
      var currentIndustryValue = industryRange.getValue();
      var validStatus = industryDropdownOptions.includes(currentIndustryValue) ? currentIndustryValue : "\u200B";
      industryRange.setValue(validStatus);
      console.log("Industry Dropdown added to column C in row", rowNumber);

    // Clear the dropdowns and cell background if nothing exists in columns A-F
    } else if (rowData[0] === "" && rowData[1] === "" && rowData[2] === "" && rowData[3] === "" && rowData[4] === "" && rowData[5] === "") {
        // Clear the dropdown and the cell background color in column L
        sourceSheet.getRange(rowNumber, 12, 1, 1).clearDataValidations().setBackground("#FFFFFF");;
        sourceSheet.getRange(rowNumber, 3, 1, 1).clearDataValidations().setBackground("#FFFFFF");;
        sourceSheet.getRange(rowNumber, 13).clearDataValidations().setBackground("#FFFFFF");;
        sourceSheet.getRange(rowNumber, 14).clearDataValidations().setBackground("#FFFFFF");;
        
        console.log("Columns A - F are empty, clearing data validation in columns C, L, M, & N for row", rowNumber);
    
    //Check if Column L has data validation, column M  has NO vdata validation AND Column M has InWork or Completed status and if so, add Production Status dropdown
    } else if (rowData[6] !== null && rowData[9] === null && (rowData[8] === "InWork" || rowData[8] === "Completed")) {
        var prodStage = ["\u200B", "Data Acquisition", "Processing Images/LiDAR", "Aero Triangulation", "Compilation/Topo", "Editing/CAD", "Orthos", "GIS", "Delivered to Client"];
        
        var prodStageRule = SpreadsheetApp.newDataValidation()
          .requireValueInList(prodStage)
          .setAllowInvalid(false)
          .build();

        sourceSheet.getRange(rowNumber, 13).setDataValidation(prodStageRule);

        // Set value to [blank] only if the current value is not valid
        var prodStatusRange = sourceSheet.getRange(rowNumber, 13);
        var currentProdStatusValue = prodStatusRange.getValue();
        var validStatus = prodStage.includes(currentProdStatusValue) ? currentProdStatusValue : "\u200B";
        prodStatusRange.setValue(validStatus);
        console.log("Production Stage dropdown added to column M for row", rowNumber);

    //Check if Column L has data validation, column N  has NO vdata validation AND Column L has InWork nd if so, add Completion Percentage dropdown
    } else if (rowData[10] === null && (rowData[8] === "InWork")) {
        var percentages = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "100%"];

        var percentageRule = SpreadsheetApp.newDataValidation()
          .requireValueInList(percentages)
          .setAllowInvalid(false)
          .build();
        sourceSheet.getRange(rowNumber, 14).setDataValidation(percentageRule);
        
        // Set value to "0%" only if the current value is not valid
         var percentageRange = sourceSheet.getRange(rowNumber, 14);  // Column N
        var currentPercentageValue = percentageRange.getValue();
        var validPercentage = percentages.includes(currentPercentageValue) ? currentPercentageValue : "0%";
        percentageRange.setValue(validPercentage);
        console.log("Completion Percentage dropdown added to column N for row", rowNumber);

    // Check if the columns already have data validation    
    }
  }
}



