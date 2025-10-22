// Function to create a custom menu in Google Sheets
function myOnOpen() {
  // Sort the "Project/ Details" sheet by Column D (Proposal #) in descending order
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var projectSheet = spreadsheet.getSheetByName("Project/Proposal Details");
  spreadsheet.setActiveSheet(projectSheet);
  projectSheet.sort(4, false);
  console.log('ADS Sales Operations opened to: ', projectSheet, 'and sorted by column 4 (Proposal)');
 
  var ui = SpreadsheetApp.getUi();

   // Check if the script has the necessary authorizations
  if (!hasRequiredAuthorizations()) {
    console.log('User does not have authorization, running authorizeScript().')
    // Trigger the authorization flow
    authorizeScript();

    // Wait the authorization to complete before showing the custom menu
    ui.createMenu('‼️ Project Management ‼️')
      .addItem('New Project Entry', 'showProjectEntryForm')
      .addToUi();
    checkDropdown();
  } else {
    console.log('User has authorization, displaying custom menu')
    // Display the custom menu
    ui.createMenu('‼️ Project Management ‼️')
      .addItem('New Project Entry', 'showProjectEntryForm')
      .addToUi();
    checkDropdown();
  }
}

 /**
 * Checks if the script has the necessary authorizations to access the required resources.
 * @returns {boolean} True if the script has all the required authorizations, false otherwise.
 */
function hasRequiredAuthorizations() {
  try {// Check if the script has authorization to access the spreadsheet
    var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    // Check if the script has authorization to access the Sheets API
    var sheet = spreadsheet.getSheetByName("Project/Proposal Details");
    // Check if the script has authorization to access the UI
    var ui = SpreadsheetApp.getUi();

    // If all the above checks pass, the script has the required authorizations
    return true;
  } catch (error) {
    // any of the checks fail, the script is missing the required authorizations
    console.log('Error checking authorizations:', error);
    return;
  }
}

/**
 * Triggers the authorization flow to grant the script the necessary permissions.
 */
function authorizeScript() {
  try {
    // Get the current user's email
    var userEmail = Session.getActiveUser().getEmail();

    // Create a new OAuth2 service
    var service = OAuth2.createService('Project Management Tool')
      .setAuthorizationBaseUrl('https://accounts.google.com/o/oauth2/auth')
      .setTokenUrl('https://oauth2.googleapis.com/token')
      .setClientId('42389180192-jg37g9ikpbhfi6s16bf159fmmilc76jh.apps.googleusercontent.com')
      .setClientSecret ('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')      
      .setPropertyStore(PropertiesService.getUserProperties())
      .setScope('https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/userinfo.email');

    // Authorize the service
    var authorizationUrl = service.getAuthorizationUrl();
    var template = HtmlService.createTemplate(
      '<a href="<?= authorizationUrl ?>" targetblank">Authorize access</a>. ' +'Close this dialog after you have authorized access.'
    );
    template.authorizationUrl = authorizationUrl;
    var authorizationDialog = template.evaluate().setWidth(600).setHeight(200);
    SpreadsheetApp.getUi().showModalDialog(authorizationDialog, 'Authorize Access');

    // Check if the authorization was granted
    if (service.hasAccess()) {
      console.log('Authorization successful for user:', userEmail);
      return true;
    } else {
      console.error('Authorization failed for user:', userEmail);
      return false;
    }
  } catch (error) {
    console.error('Error authorizing script:', error);
    return false;
  }
}

// Function to display the HTML form
function showProjectEntryForm() {
  Logger.log("showProjectEntryForm function has been triggered.");

  var nextProjectNumber = generateNextProjectNumber();
  Logger.log("Next project number generated: " + nextProjectNumber);

  var userEmail = Session.getActiveUser().getEmail();
  Logger.log("User's email retrieved: " + userEmail);

  var userName = getUserName(userEmail);
  Logger.log("User's name derived from email: " + userName);

  var industryOptions = getIndustryOptions();
  Logger.log("Industry options fetched: " + JSON.stringify(industryOptions));

  var statusOptions = getStatusOptions();
  Logger.log("Status options fetched: " + JSON.stringify(statusOptions));

  var createdDate = new Date().toLocaleDateString(); // Get the current date

  var clientList = getClientList(); // Get the client list
  Logger.log("Client list fetched: " + JSON.stringify(clientList));

  var template = HtmlService.createTemplateFromFile('ProjectEntryForm');
  template.projectNumber = nextProjectNumber;
  template.userName = userName;
  template.industryOptions = industryOptions;
  template.statusOptions = statusOptions;
  template.createdDate = createdDate; // Pass the created date to the template
  template.clientList = clientList;

  var htmlOutput = template.evaluate();
  Logger.log("HTML template evaluated.");

  htmlOutput.setWidth(900).setHeight(800);
  Logger.log("HTML output dimensions set to 900x800.");

  SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Enter New Project Information');
  Logger.log("Modal dialog displayed.");
}


// Function to map email identifiers to user names
function getUserName(userEmail) {
  var emailIdentifier = userEmail.split('@')[0];
  var userNames = {
    'zclark': 'Zac',
    'lholtgreive': 'Larry',
    'pkokes': 'Paul',
    'jwright': 'Jim',
    'amaestas': 'Al',
    'ashepherd': 'Ashley'
  };
  
  return userNames[emailIdentifier] || emailIdentifier.charAt(0).toUpperCase() + emailIdentifier.slice(1).toLowerCase();
}

function getServiceAccountAuth() {
  var serviceAccountEmail = 'salesops@ads-sales-tool-v2.iam.gserviceaccount.com';
  var privateKey = '-----BEGIN PRIVATE KEY-----\988729f5eeb25e22600cd8d4a386baf9907db22a\n-----END PRIVATE KEY-----\n';
  
  var service = OAuth2.createService('Sheets')
      .setTokenUrl('https://oauth2.googleapis.com/token')
      .setPrivateKey(privateKey)
      .setIssuer(serviceAccountEmail)
      .setPropertyStore(PropertiesService.getScriptProperties())
      .setScope('https://www.googleapis.com/auth/spreadsheets');
  
  if (service.hasAccess()) {
    return service.getAccessToken();
  } else {
    Logger.log('Service account authorization failed: ' + service.getLastError());
    return null;
  }
}

// Function to process the submitted form data
function processProjectData(data) {
  Logger.log('Form data received:', JSON.stringify(data));

  try {
    // Always use Project/Proposal Details sheet (including Qualification projects)
    var sheetName = "Project/Proposal Details";
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);

    // Insert a new row at the top (row 3, assuming row 1-2 is headers)
    sheet.insertRowBefore(3);
    sheet.getRange(3, sheet.getLastColumn(), 1, 1)
      .setHorizontalAlignment("center")
      .setWrap(true);

    // Write full set of data for all statuses (including Qualification)
    // Qualification projects now stay on Project Details with complete information
      sheet.getRange(3, 1).setValue(data.accountOwner); // Account Owner
      sheet.getRange(3, 2).setValue(data.client);
      sheet.getRange(3, 3).setValue(data.industry);
      sheet.getRange(3, 4).setValue(data.bidNumber); // Proposal #
      sheet.getRange(3, 5).setValue(data.woNumber);
      sheet.getRange(3, 6).setValue(data.projName);
      sheet.getRange(3, 7).setValue(data.proposalAmount); // Proposal Amount
      sheet.getRange(3, 8).setFormula('=if($E3="","",sumif(Invoices!$D:$D,$E3,Invoices!$G:$G))'); //Formula for Column H
      sheet.getRange(3, 9).setFormula('=IF(OR($L5="Hold",$L5="Proposal",$L5="Qualification",$L5="Solicitation",$L5="Short List",$L5="Final Invoice Sent",$L5="Closed-Lost"), 0, IF(OR($L5="InWork",$L5="Pending NTP",$L5="Completed"), $G5-$H5, $H5))'); //Formula for Column I
      sheet.getRange(3, 10).setValue(data.estAwardDate ? new Date(data.estAwardDate) : ''); // Est. Award Date; blank if null
      sheet.getRange(3, 12).setValue(data.status); // Status
      sheet.getRange(3, 15).setValue(data.notes); // Notes

    if (data.accountOwner === "Ashley" && 
        (data.status === "In Work" || data.status === "Pending NTP" || data.status === "Proposal")) {
          copyToCommissionSchedule(data);
        }

    // Store the created date metadata
    PropertiesService.getDocumentProperties().setProperty('lastUpdated' + data.bidNumber, data.createdDate);

    Logger.log(`New project information added to row 3 in ${sheetName}.`);
    
  } catch (error) {
    Logger.log('Error processing form data:', error.message);
  }
}

// Function to generate the next available project number with additional logging and validation
function generateNextProjectNumber() {
  try {
    var proposalSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Project/Proposal Details");
    var qualificationsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("LPA Prequalifications");
    var currentYear = new Date().getFullYear().toString().substr(-2);
    
    var bidNumbers = [];

    // Get all bid numbers from the column D - Project/Proposal Details sheet
    var lastRow = proposalSheet.getLastRow();
    var proposalRange = proposalSheet.getRange(3, 4, lastRow - 1, 1); // Assuming Proposal # is in column D (index 4)
    var proposalNumbers = proposalRange.getValues();
    bidNumbers.push(proposalNumbers);

    // Get all bid numbers from the column D - LPA Qualifications sheet
    var lastRow2 = qualificationsSheet.getLastRow();
    var qualificationsRange = qualificationsSheet.getRange(3, 4, lastRow2 - 1, 1); // Assuming Proposal # is in column D (index 4)
    var qualificationsNumbers = qualificationsRange.getValues();
    bidNumbers.push(qualificationsNumbers);
    
    Logger.log("Raw proposal numbers in column D: " + JSON.stringify(bidNumbers));
  
    var highestNumber = 0;
    Logger.log("Starting to find the highest project number for the current year: " + currentYear);
  
    
    // Process each value in the proposalNumbers array to find the highest number
    for (var i = 0; i < bidNumbers.length; i++) {
      // Iterate through the inner array of proposal numbers
      for (var j = 0; j < bidNumbers[i].length; j++) {
        var bidNumber = bidNumbers[i][j][0]; // getValues returns a 2D array.  Access the element correctly

        if (bidNumber && typeof bidNumber === 'string' && bidNumber.startsWith(currentYear)) {
          var numberPart = parseInt(bidNumber.split('-')[1]);
          Logger.log("Found proposal number: " + bidNumber + ", extracted number: " + numberPart);
          if (!isNaN(numberPart)) { // This check ensures numberPart is a number
            if (numberPart > highestNumber) {
              highestNumber = numberPart;
              Logger.log("Updated highest number to: " + highestNumber);
            }
          } else {
            Logger.log("Extracted number is NaN for proposal number: " + bidNumber);
          }
        } else {
          Logger.log("Skipping proposal number: " + bidNumber);
        }
      }
    }

    var nextNumber = highestNumber + 1;
    Logger.log("Next available project number: " + nextNumber);

    if (!isNaN(nextNumber)) {
      var formattedProjectNumber = currentYear + '-' + ('000' + nextNumber).slice(-3);
      Logger.log("Formatted next project number: " + formattedProjectNumber);
      return formattedProjectNumber;
    } else {
      Logger.log("Invalid next number: " + nextNumber);
      throw new Error("Next number calculation resulted in NaN.");
    }
  } catch (error) {
    Logger.log("Error in generateNextProjectNumber: " + error.toString());
    throw error; // Re-throw the error after logging it
  }
}
  
// Add new functionality to copy data to AShepherd Commission Schedule
function copyToCommissionSchedule (data) {
  var accessToken = getServiceAccountAuth();
  if (!accessToken) {
    throw new Error('Failed to authorize service account');
  }

  var targetSpreadsheetId = "1Bf6nuCHf1XTQwTVta7BEUwjZsuUY5-3_5rzFVBREkKc";
  var sheetName = "Commission Schedule";
  var range = "Commission_Schedule";

  // Get the current values of the Commission_Schedule table
  var url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${range}`;
  var response = UrlFetchApp.fetch(url, {
    headers: {
      'Authorization': 'Bearer ' + accessToken
    }
  });
  var values = JSON.parse(response.getContentText()).values;

  // Prepare the new row data
  var newRow = new Array(values[0].length).fill("");
  newRow[values[0].indexOf("Account Name")] = data.client;
  newRow[values[0].indexOf("Opportunity Name")] = data.projName;
  newRow[values[0].indexOf("Amount")] = data.proposalAmount;
  newRow[values[0].indexOf("Status")] = data.status;

  // Append the new row
  url = `https://sheets.googleapis.com/v4/spreadsheets/${targetSpreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED`;
  var payload = {
    values: [newRow]
  };
  UrlFetchApp.fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + accessToken,
      'Content-Type': 'application/json'
    },
    payload: JSON.stringify(payload)
  });

  Logger.log("Data copied to AShepherd Commission Schedule");
}

// Function to get industry options from validation rules in column C
function getIndustryOptions() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Project/Proposal Details");
  var validationRange = sheet.getRange('C3:C'); // Adjust this range if needed
  var validation = validationRange.getDataValidations()[1][1];

  if (validation) {
    var criteria = validation.getCriteriaType();
    if (criteria == SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
      return validation.getCriteriaValues()[1];
    }
  }
  // Return a default set of options if no validation is found
  return ["\u200B", "DOT", "Energy", "Engineering", "Federal", "Municipal", "Survey", "Other"];
}

// Function to get status options from validation rules in column L
function getStatusOptions() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Project/Proposal Details");
  var validationRange = sheet.getRange('L3:L'); // Adjust this range if needed
  var validation = validationRange.getDataValidations()[1][1];

  if (validation) {
    var criteria = validation.getCriteriaType();
    if (criteria == SpreadsheetApp.DataValidationCriteria.VALUE_IN_LIST) {
      return validation.getCriteriaValues()[1];
    }
  }
  // Return a default set of options if no validation is found
  return ["\u200B",  "Qualification", "Proposal", "Pending NTP", "InWork", "Completed", "Final Invoice Sent", "Closed-Lost"];
}

// New function to get the list of clients from the "Project/Proposal Details" tab
function getClientList() {
  try {
    Logger.log("GetClientList function triggered.");
    
    // Get the "Project/Proposal Details" sheet
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("Project/Proposal Details");
    var lastRow = sheet.getLastRow();
    
    // Get the unique values in the "Client" column
    var clientRange = sheet.getRange("B3:B" + lastRow);
    console.log('Range is B3 to B',lastRow);
   

    var clientValues = clientRange.getValues().map(function(row) {
      return row[0].toString().trim();
    });
    console.log('clientValues:', clientValues);

    // Filter out blanks
    var filteredClientValues = clientValues.filter(function(value) {
      return value !== "";
    });

    console.log('Filtered Values:', filteredClientValues);

   // Create a unique client list using a Map
    var clientList = [];
    var clientMap = new Map();
    for (var i = 0; i < filteredClientValues.length; i++) {
      var clientName = filteredClientValues[i];
      if (!clientMap.has(clientName)) {
        clientMap.set(clientName, true);
        clientList.push(clientName);
      }
    }

    console.log('clientList:', clientList);
    return clientList;
  } catch (error) {
    Logger.log("Error in testGetClientList:", error.message);
    throw error;
  }
}

