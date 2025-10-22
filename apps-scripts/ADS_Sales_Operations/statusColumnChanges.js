function onEditStatus(e) {
  // Get the edited cell
  var editedCell = e.range;
  var editedRow = editedCell.getRow();
  var editedColumn = editedCell.getColumn();
  var editedSheet = editedCell.getSheet();
  console.log("Edited cell:", editedCell.getA1Notation());

  // Ensure changes are made in the "Pending/Active Projects" sheet
  if (editedSheet.getName() !== "Project/Proposal Details") {
    console.log("Edited cell is not in the target sheet, exiting function.");
    return; 
  }

  // Check if the edited cell is in column L or M
  if (editedColumn !== 12 && editedColumn !== 13) {
    console.log('editedColumn:', editedColumn),
    console.log("Edited cell is not in column L or M, exiting function.");
    return; 
  }

  // Get the spreadsheet
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  //console.log("Spreadsheet:", spreadsheet.getName());

  // Get the destination tab
  var completedProjectsSheet = spreadsheet.getSheetByName("Completed Projects");
  var lostProjectsSheet = spreadsheet.getSheetByName("Lost Projects");
  var qualSheet = spreadsheet.getSheetByName('LPA Prequalifications');
 
  //console.log("Destination sheet:", destinationSheet.getName());

  // Get the value of the edited cell
  var value = editedCell.getValue();
  //console.log("Edited cell value:", value);

  // Identify the proposal number from column D (index 4)
  var proposalNumber = editedSheet.getRange(editedRow, 4).getValue(); 
  var now = new Date().toISOString();
  
  // Store the date/time string in script properties keyed by proposal number
  PropertiesService.getScriptProperties().setProperty("lastUpdated_" + proposalNumber, now);

  if (editedCell.getColumn() === 12) {
    // Set the cell background color based on the selected value
    switch (value) {
      case "":
        editedSheet.getRange(editedRow, 12).setBackground('#FFFFFF'); // White
        break;
      case "Solicitation":
        editedSheet.getRange(editedRow, 12).setBackground('#FF00FF'); // Magenta
        break;
      case "Qualification":
        editedSheet.getRange(editedRow, 12).setBackground('#FFE699'); // Light yellow

        // Additional actions for "Qualification"
        // Get the relevant row data from columns A, B, C, D, E, F, G, H and L
        var qual_rowData = [
          [
          editedSheet.getRange(editedRow, 1).getValue(), // Column A (Account Owner)
          editedSheet.getRange(editedRow, 2).getValue(), // Column B (Client)
          editedSheet.getRange(editedRow, 3).getValue(), // Column C (Industry)
          editedSheet.getRange(editedRow, 4).getValue(), // Column D (Proposal #)
          editedSheet.getRange(editedRow, 6).getValue(), // Column F (Project Name)
          editedSheet.getRange(editedRow, 12).getValue(), // Column L (Status)
          editedSheet.getRange(editedRow, 14).getValue() // Column N (Notes)
          ]
        ];

        // Find the next available row in the destination sheet
        var qual_destinationRow = qualSheet.getLastRow() + 1;
        var qual_destinationRange = qualSheet.getRange(qual_destinationRow, 1, 1, 8);
        
        // Write the row data to the destination sheet
        qual_destinationRange
          .setValues(qual_rowData)
          .setWrap(true);
        qualSheet
          .autoResizeColumns(1, qual_rowData.length)
          .autoResizeRows(2, qualSheet.getLastRow());
        

        // Delete the row from the source sheet to avoid row shifting issues
        editedSheet.deleteRow(editedRow);

        break;
      case "Proposal":
        editedSheet.getRange(editedRow, 12).setBackground('#FFE699'); // Light yellow
        break;
      case "Hold":
        editedSheet.getRange(editedRow, 12).setBackground('#FFB366'); //  Light orange
        break;
      case "Short List" :
        editedSheet.getRange(editedRow, 12).setBackground('#FFB6C1'); // Light pink
        break;
      case "Pending NTP":
        editedSheet.getRange(editedRow, 12).setBackground('#C2DFFF'); // Light blue
        break;
      case "InWork":
        editedSheet.getRange(editedRow, 12).setBackground('#C9E6C9'); // Light green

        // Triggering the additional actions for "InWork"
        // Add "Completion Percentage" dropdown
        var percentageRange = editedSheet.getRange(editedRow, 14);  // Column M
        var percentages = ["0%", "10%", "20%", "30%", "40%", "50%", "60%", "70%", "80%", "90%", "100%"];
        var percentageRule = SpreadsheetApp.newDataValidation()
          .requireValueInList(percentages)
          .setAllowInvalid(false)
          .build();
        percentageRange.setDataValidation(percentageRule);
        percentageRange.setValue("0%");
        console.log("Percentage dropdown added to column M for row", editedRow);

        //Add Production Status dropdown
        var prodStageRange = editedSheet.getRange(editedRow, 13);
        var prodStage = ["\u200B", "Data Acquisition", "Processing Images/LiDAR", "Aero Triangulation", "Compilation/Topo", "Editing/CAD", "Orthos", "GIS", "Delivered to Client"];
        var prodStageJim = ["\u200B", "GIS", "Delivered To Client"];
        var accountOwner = editedSheet.getRange(editedRow, 1).getValue();
        var prodStageRule = SpreadsheetApp.newDataValidation()
          .requireValueInList(prodStage)
          .setAllowInvalid(false)
          .build();

        var prodStageRuleJim = SpreadsheetApp.newDataValidation()
          .requireValueInList(prodStageJim)
          .setAllowInvalid(false)
          .build();
        
        if (accountOwner !== "Jim") {
          prodStageRange.setDataValidation(prodStageRule);
          prodStageRange.setValue("");
        } else {
          prodStageRange.setDataValidation(prodStageRuleJim);
          prodStageRange.setValue("");
        }
          console.log('Production Stage dropdown added to column N for', accountOwner, 'in row', editedRow);
        break;
      case "Completed":
        editedSheet.getRange(editedRow, 12).setBackground("#FFB2B2"); // Light red
        sendCompletionEmail(editedRow, editedSheet);
        break;
      case "Final Invoice Sent":
        // Additional actions for "Final Invoice Sent"
        // Get the relevant row data from columns B, C, D, E, F, G, H and L

        var currentYear = new Date().getFullYear();
        var cp_rowData = [
          [
          editedSheet.getRange(editedRow, 1).getValue(), // Column A (Account Owner)
          editedSheet.getRange(editedRow, 2).getValue(), // Column B (Client)
          editedSheet.getRange(editedRow, 3).getValue(), // Column C (Industry)
          editedSheet.getRange(editedRow, 4).getValue(), // Column D (Proposal #)
          editedSheet.getRange(editedRow, 5).getValue(), // Column E (WO #)
          editedSheet.getRange(editedRow, 6).getValue(), // Column F (Project Name)
          editedSheet.getRange(editedRow, 7).getValue(), // Column G (Proposed Total)
          editedSheet.getRange(editedRow, 8).getValue(), // Column H (Invoiced Total)
          editedSheet.getRange(editedRow, 12).getValue(), // Column L (Status)
          currentYear
          ]
        ];

        // Find the next available row in the destination sheet
        var cp_destinationRow = completedProjectsSheet.getLastRow() + 1;
        var cp_destinationRange = completedProjectsSheet.getRange(cp_destinationRow, 1, 1, 10);
        
        // Write the row data to the destination sheet
        cp_destinationRange
          .setValues(cp_rowData)
          .setWrap(true);
        completedProjectsSheet
          .autoResizeColumns(1, cp_rowData.length)
          .autoResizeRows(2, completedProjectsSheet.getLastRow());
        

        // Delete the row from the source sheet to avoid row shifting issues
        editedSheet.deleteRow(editedRow);

        break;
      case "Closed-Lost":

        // Additional actions for "Closed-Lost"
        // Get the relevant row data from columns A, B, C, D, E, F, G, H and L
        var lp_rowData = [
          [
          editedSheet.getRange(editedRow, 1).getValue(), // Column A (Account Owner)
          editedSheet.getRange(editedRow, 2).getValue(), // Column B (Client)
          editedSheet.getRange(editedRow, 3).getValue(), // Column C (Industry)
          editedSheet.getRange(editedRow, 4).getValue(), // Column D (Proposal #)
          editedSheet.getRange(editedRow, 6).getValue(), // Column F (Project Name)
          editedSheet.getRange(editedRow, 7).getValue(), // Column G (Proposed Total)
          editedSheet.getRange(editedRow, 12).getValue(), // Column L (Status)
          editedSheet.getRange(editedRow, 14).getValue() // Column N (Notes)
          ]
        ];

        // Find the next available row in the destination sheet
        var lp_destinationRow = lostProjectsSheet.getLastRow() + 1;
        var lp_destinationRange = lostProjectsSheet.getRange(lp_destinationRow, 1, 1, 8);
        
        // Write the row data to the destination sheet
        lp_destinationRange
          .setValues(lp_rowData)
          .setWrap(true);
        lostProjectsSheet
          .autoResizeColumns(1, lp_rowData.length)
          .autoResizeRows(2, lostProjectsSheet.getLastRow());
        

        // Delete the row from the source sheet to avoid row shifting issues
        editedSheet.deleteRow(editedRow);

        break;
      default:
        editedSheet.getRange(editedRow, 12).setBackground("#FFFFFF"); // White
        break;
    } 
    
    if (value !== "InWork" && value !== "Completed") {
      // Clear the Production Status & Completion Percentage dropdowns if the row is no longer 'InWork'
        var percentageRange = editedSheet.getRange(editedRow, 14);  // Column N
        percentageRange.clearDataValidations();
        percentageRange.clearContent().setBackground("#FFFFFF");
        //console.log("Cleared percentage dropdown from column M for row", editedRow);

        var prodStatusRange = editedSheet.getRange(editedRow, 13); // Column M
        prodStatusRange.clearDataValidations();
        prodStatusRange.clearContent().setBackground("#FFFFFF");
    }
  } else if (editedCell.getColumn() === 13) {
      switch (value) {
        case "":
          editedSheet.getRange(editedRow, 13).setBackground("#FFFFFF"); // White
          break;
        case "Data Acquisition":
          editedSheet.getRange(editedRow, 13).setBackground("#C9E6C9"); // Light green
          break;
        case "Processing Images/LiDAR":
          editedSheet.getRange(editedRow, 13).setBackground("#C9E6C9"); // Light green
          break;
        case "Aero Triangulation":
          editedSheet.getRange(editedRow, 13).setBackground("#C9E6C9"); // Light green
          break;
        case "Compilation/Topo":
          editedSheet.getRange(editedRow, 13).setBackground("#C9E6C9"); // Light green
          break;
        case "Editing/CAD":
          editedSheet.getRange(editedRow, 13).setBackground("#C9E6C9"); // Light green
          break;
        case "Orthos":
          editedSheet.getRange(editedRow, 13).setBackground("#C9E6C9"); // Light green
          break;
        case "GIS":
          editedSheet.getRange(editedRow, 13).setBackground("#C9E6C9"); // Light green
          break;
        case "Delivered to Client":
         editedSheet.getRange(editedRow, 13).setBackground("#C9E6C9"); // Light green

         var statusRange = editedSheet.getRange(editedRow, 12);
         statusRange.setValue("Completed");
         statusRange.setBackground("#FFB2B2"); // Light red
         sendCompletionEmail(editedRow, editedSheet);
         console.log("Prouduction Status set to 'Delivered to Client', overall status set to 'Completed'.");
         break;
      
      default:
        editedSheet.getRange(editedRow, 13).setBackground("#FFFFFF"); // White
        break;
    }
  }
}

function getCompletionEmailRecipients() {
 
  return [
    'zclark@aerialdata.com',
    'amaestas@aerialdata.com',
  ];
}

function getAccountOwnerEmail(accountOwner) {
  var userName = {
    'Zac' : 'zclark@aerialdata.com',
    'Larry' : 'lholtgreive@aerialdata.com',
    'Paul': 'pkokes@aerialdata.com',
    'Jim' : 'jwright@aerialdata.com',
    'Ashley': 'ashepherd@aerialdata.com'
  };
  return userName[accountOwner];
}

function formatCurrency(value) {
    return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
    });
}

function sendCompletionEmail(editedRow, editedSheet) {
  var projectData = {
    accountOwner: editedSheet.getRange(editedRow, 1).getValue(), // Account Onwer
    client: editedSheet.getRange(editedRow, 2).getValue(),  // Client
    proposalNumber: editedSheet.getRange(editedRow, 4).getValue(), //Proposal Number
    woNumber: editedSheet.getRange(editedRow, 5).getValue(), // Work Order
    projectName: editedSheet.getRange(editedRow, 6).getValue(),  // Project Name
    proposalAmt: parseFloat(editedSheet.getRange(editedRow, 7).getValue()), // Proposal Amount
    amtRemainingToInvoice: parseFloat(editedSheet.getRange(editedRow, 9).getValue()), // Amt. Remaining To Be Invoiced
    prodStatus: editedSheet.getRange(editedRow, 13).getValue() // Production Status
  };

  var emailSubject = "Project Completed: " + projectData.projectName + " (" + projectData.woNumber + ")";
  var emailBody = "The following project has been marked as Completed:\n\n" +
                  "Project Name: " + projectData.projectName + "\n" +
                  "Production Status: " + projectData.prodStatus + "\n" +
                  "WO Number: " + projectData.woNumber + "\n" +
                  "Client: " + projectData.client + "\n" +
                  "Proposal Amount: " + formatCurrency(projectData.proposalAmt) + "\n" +
                  "Amount Remaining To Be Invoiced: " + formatCurrency(projectData.amtRemainingToInvoice) + "\n" +
                  "Proposal Number: " + projectData.proposalNumber + "\n" +
                  "Account Owner: " + projectData.accountOwner;

  // You can customize the recipient email address as needed
  var recipients = getCompletionEmailRecipients().join(',');
  var ccEmail = getAccountOwnerEmail(projectData.accountOwner)

  MailApp.sendEmail({
    to: recipients,
    cc: ccEmail,
    subject: emailSubject,
    body: emailBody,
  });

  console.log("Completion Email for project: " + projectData.projectName + " sent to: " + recipients + ",cc: " + ccEmail);
}



