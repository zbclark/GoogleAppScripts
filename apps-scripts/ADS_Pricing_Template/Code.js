// Create Triggers
function createHourlyTrigger() {
  // First, delete any existing triggers for updateFolderCache  
  const existingTriggers = ScriptApp.getProjectTriggers()  
    .filter(trigger => trigger.getHandlerFunction() === 'updateFolderCache');  
  
  existingTriggers.forEach(trigger => ScriptApp.deleteTrigger(trigger));  
  
  // Then create ONE new trigger  
  ScriptApp.newTrigger('updateFolderCache')  
    .timeBased()  
    .everyHours(1)  
    .create();  
  
  console.log('Hourly trigger created for updateFolderCache');  
}  

function sendErrorEmail(errorMessage) {
    const user = Session.getActiveUser().getEmail();
    const adminEmail = 'zclark@aerialdata.com';
    const subject = 'Script Execution Error';
    const body = `An error occurred while executing the Cost Proposal Tools script.
    User: ${user}
    Error: ${errorMessage}
    
    Please check the script and update if necessary.`;

    MailApp.sendEmail(adminEmail, subject, body);
}

function onEdit(e) {
    const range = e.range;
    const sheet = range.getSheet();
    if (sheet.getName() === 'Project Estimator' && range.getA1Notation() === 'J1') {
        sheet.getRange('N2').setFormula('=INDEX(\'Labor Classification Rates\'!D3:Z3, MATCH($J$1, \'Labor Classification Rates\'!$D$2:$Z$2, 0))');
        sheet.getRange('N3').setFormula('=INDEX(\'Labor Classification Rates\'!D4:Z4, MATCH($J$1, \'Labor Classification Rates\'!$D$2:$Z$2, 0))');
        sheet.getRange('N4').setFormula('=INDEX(\'Labor Classification Rates\'!D5:Z5, MATCH($J$1, \'Labor Classification Rates\'!$D$2:$Z$2, 0))');
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let isTemplate;

    try {
        // Look for TemplateMarker named range to set isTemplate property
        const documentProperties = PropertiesService.getDocumentProperties();
        const namedRanges = ss.getNamedRanges();
        isTemplate = namedRanges.some(range => range.getName() === 'TemplateMarker');
        documentProperties.setProperty('isTemplate', isTemplate.toString());
        Logger.log('TemplateMarker found: ' + isTemplate);
    } catch (error) {
        isTemplate = false;
        Logger.log('Error checking for TemplateMarker: ' + error);
    }

    // Update UI based on the isTemplate property
    const ui = SpreadsheetApp.getUi();
    createCustomMenu(ui, isTemplate);
}

function openFileAt90Percent(fileId) {  
    console.log("Opening file with ID:", fileId);  
      
    // Construct URL with zoom parameter  
    const fileUrl = `https://docs.google.com/document/d/${fileId}/edit#zoom=90`;  
      
    console.log("Opening URL:", fileUrl);  
      
    // Open the file at 90% zoom  
    const htmlOutput = HtmlService.createHtmlOutput(`  
        <script>  
            console.log("Redirecting to file with 90% zoom");  
            window.open('${fileUrl}', '_blank');  
            google.script.host.close();  
        </script>  
    `);  
      
    SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Opening File...');  
    console.log("File opened successfully");  
}

function onOpen() {  
    const ui = SpreadsheetApp.getUi();  
    const ss = SpreadsheetApp.getActiveSpreadsheet();  
    const documentProperties = PropertiesService.getDocumentProperties();  
  
    let isTemplate = documentProperties.getProperty('isTemplate');  
    Logger.log('Initial isTemplate value from document properties: ' + isTemplate);  
  
    if (isTemplate === null || isTemplate === undefined || isTemplate === 'false') {  
        const namedRanges = ss.getNamedRanges();  
        isTemplate = namedRanges.some(range => range.getName() === 'TemplateMarker');  
        documentProperties.setProperty('isTemplate', isTemplate.toString());  
        Logger.log('Setting isTemplate based on TemplateMarker: ' + isTemplate);  
    } else {  
        isTemplate = (isTemplate === 'true');  
        Logger.log('isTemplate value from document properties: ' + isTemplate);  
    }  
  
    if (isTemplate) {  
        const sheet = ss.getSheetByName('Project Estimator');  
        const range = sheet.getRange('D8:P19');  
        const values = range.getValues();  
        const hasValues = values.some(row => row.some(cell => cell !== ''));  
        if (hasValues) {  
            resetToTemplate();  
        }  
    }  
  
    createCustomMenu(ui, isTemplate);  
    Logger.log('onOpen: Final isTemplate value = ' + isTemplate);  
}  
  
function createCustomMenu(ui, isTemplate) {  
    const menu = ui.createMenu('‼️ Cost Proposal Tools ‼️');  
    if (isTemplate) {  
        menu.addItem('Create a Working Copy', 'showPicker');  
        Logger.log('Added "Create a Working Copy" to menu.');  
    } else {  
        menu.addItem('Reset Now', 'resetToTemplate')  
            .addItem('Download as XLSX', 'showXLSXDownloadDialog');  
        Logger.log('Added "Reset Now" and "Download as XLSX" to menu.');  
    }  
    menu.addToUi();  
}  
  
// Show Download Confirmation
function showXLSXDownloadDialog() {
    const htmlOutput = HtmlService.createHtmlOutputFromFile('DownloadConfirmation')
        .setWidth(300)
        .setHeight(200);
    SpreadsheetApp.getUi().showModalDialog(htmlOutput, 'Confirm Download');
}

// Function to initiate XLSX download
function downloadAsXLSX() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Project Estimator");

    if (!sheet) {
        console.error("Sheet 'Project Estimator' not found");
        return { error: "Sheet not found" };
    }

    try {
        const tempSs = SpreadsheetApp.create("Temp_" + ss.getName());
        const tempSheet = tempSs.getSheets()[0];
        tempSheet.setName(sheet.getName());

        const sourceColumnCount = 50;
        const sourceRowCount = 100;
        if (tempSheet.getMaxColumns() < sourceColumnCount) {
            tempSheet.insertColumnsAfter(tempSheet.getMaxColumns(), sourceColumnCount - tempSheet.getMaxColumns());
        }

        const tempSheetId = tempSheet.getSheetId();
        const fullSpreadsheet = Sheets.Spreadsheets.get(ss.getId(), {
            ranges: [`${sheet.getName()}!1:1048576`],
            includeGridData: true,
        });

        const sourceSheet = fullSpreadsheet.sheets[0];
        const sourceData = sourceSheet.data[0];
        const requests = [];

        if (sourceData && sourceData.rowData) {
            sourceData.rowData.forEach((row, rowIndex) => {
                if (!row.values) return;

                const rowRequest = {
                    values: row.values.map((cell, colIndex) => {
                        const userEnteredValue = cell.effectiveValue || null;
                        if (userEnteredValue && userEnteredValue.errorValue) {
                            console.warn(`Found error value at row ${rowIndex}, column ${colIndex}`);
                            return {
                                userEnteredValue: { stringValue: '' },
                                userEnteredFormat: cell.userEnteredFormat,
                            };
                        }
                        return {
                            userEnteredValue,
                            userEnteredFormat: cell.userEnteredFormat,
                        };
                    }),
                };

                requests.push({
                    updateCells: {
                        range: {
                            sheetId: tempSheetId,
                            startRowIndex: rowIndex,
                            endRowIndex: rowIndex + 1,
                            startColumnIndex: 0,
                            endColumnIndex: row.values.length,
                        },
                        rows: [rowRequest],
                        fields: 'userEnteredValue,userEnteredFormat',
                    },
                });
            });
        }

        if (sourceSheet.merges) {
            sourceSheet.merges.forEach(merge => {
                requests.push({
                    mergeCells: {
                        range: {
                            sheetId: tempSheetId,
                            startRowIndex: merge.startRowIndex,
                            endRowIndex: merge.endRowIndex,
                            startColumnIndex: merge.startColumnIndex,
                            endColumnIndex: merge.endColumnIndex,
                        },
                        mergeType: 'MERGE_ALL',
                    },
                });
            });
        }

        // Set column widths
        console.log("Setting column widths");
        for (let i = 0; i < sourceColumnCount; i++) {
            const width = sheet.getColumnWidth(i + 1);
            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId: tempSheetId,
                        dimension: 'COLUMNS',
                        startIndex: i,
                        endIndex: i + 1
                    },
                    properties: {
                        pixelSize: width
                    },
                    fields: 'pixelSize'
                }
            });
            console.log(`Set column width for column ${i + 1} to ${width}px`);
        }

        // Set row heights
        console.log("Setting row heights");
        const firstRowHeight = sheet.getRowHeight(1);
        requests.push({
            updateDimensionProperties: {
                range: {
                    sheetId: tempSheetId,
                    dimension: 'ROWS',
                    startIndex: 0,
                    endIndex: 1
                },
                properties: {
                    pixelSize: firstRowHeight
                },
                fields: 'pixelSize'
            }
        });
        console.log(`Set row height for row 1 (header) to ${firstRowHeight}px`);

        for (let i = 1; i < sourceRowCount; i++) {
            const height = sheet.getRowHeight(i + 1);
            requests.push({
                updateDimensionProperties: {
                    range: {
                        sheetId: tempSheetId,
                        dimension: 'ROWS',
                        startIndex: i,
                        endIndex: i + 1
                    },
                    properties: {
                        pixelSize: height
                    },
                    fields: 'pixelSize'
                }
            });
            console.log(`Set row height for row ${i + 1} to ${height}px`);
        }

        Sheets.Spreadsheets.batchUpdate({ requests }, tempSs.getId());

        const tempSsId = tempSs.getId();
        const url = `https://docs.google.com/spreadsheets/d/${tempSsId}/export?format=xlsx&id=${tempSsId}&gid=0`;
        const token = ScriptApp.getOAuthToken();
        const fetchResponse = UrlFetchApp.fetch(url, {
            headers: {
                'Authorization': 'Bearer ' + token
            }
        });

        if (fetchResponse.getResponseCode() !== 200) {
            throw new Error(`Failed to fetch export URL. HTTP Response Code: ${fetchResponse.getResponseCode()}`);
        }

        const xlsxBlob = fetchResponse.getBlob().setName(ss.getName() + " (Values Only).xlsx");
        const parentFolder = DriveApp.getFileById(ss.getId()).getParents().next();
        const savedFile = parentFolder.createFile(xlsxBlob);
        DriveApp.getFileById(tempSsId).setTrashed(true);

        const base64Data = Utilities.base64Encode(xlsxBlob.getBytes());
        return {
            fileName: xlsxBlob.getName(),
            mimeType: xlsxBlob.getContentType(),
            base64Data: base64Data,
            driveFileId: savedFile.getId(),
            driveFileUrl: savedFile.getUrl(),
            parentFolderUrl: `https://drive.google.com/drive/folders/${parentFolder.getId()}`
        };
    } catch (error) {
        console.error("Error exporting to XLSX:", error);
        return { error: "Failed to export as XLSX: " + error.toString() };
    }
}



function showPicker() {
    var html = HtmlService.createHtmlOutputFromFile('picker')
        .setWidth(1050)
        .setHeight(600)
        .setTitle('Create a Copy and Save');
    SpreadsheetApp.getUi().showModalDialog(html, 'Create a Copy and Save');
}

function resetToTemplate() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const templateSheet = ss.getSheetByName('Template - DO NOT EDIT');
    const sheetToReset = ss.getSheetByName('Project Estimator');

    const rangeList = ['C2:E4', 'P2:P3', 'D8:P19', 'C35:C38', 'C40', 'C42:C45', 'C47:C52', 'C54:C61', 'C63:C64', 'C66:C70', 'D41','H35:H40', 'H43:I49', 'H52:I53', 'H56:I57', 'H59:I60', 'G61', 'I61', 'H65', 'M35:M39', 'K41:P52', 'L55:L67', 'P54:P55', 'D27:P31', 'B27:B31'];
    sheetToReset.getRangeList(rangeList).clearContent();

    const formulaRanges = ['N2:N4', 'C8:C19', 'B20:P24', 'F10:F11', 'G13', 'H14', 'J17', 'K18', 'N10:N11', 'Q8:Q19', 'F27', 'Q27:Q31', 'D35:E45', 'D47:E52', 'D54:E61', 'D63:E64', 'D66:E70', 'I35:J40', 'N35:O39', 'H65:H69', 'P56:P69', 'B27'];
    formulaRanges.forEach(function(cellRange) {
        let sourceRange = templateSheet.getRange(cellRange);
        let targetRange = sheetToReset.getRange(cellRange);
        targetRange.setFormulas(sourceRange.getFormulas());
    });

    const validationRanges = ['C41','B42:B45', 'B50:B52', 'B58:B61', 'B63:B64', 'B66:B70', 'F37:G40', 'K37:L39', 'H42:I42', 'H50:I50', 'H54:I55', 'H58:I58',  'J1:K1', 'M70'];
    validationRanges.forEach(function(cellRange) {
        let sourceRange = templateSheet.getRange(cellRange);
        let targetRange = sheetToReset.getRange(cellRange);
        targetRange.setDataValidations(sourceRange.getDataValidations());
    });

    const otherDirectExpensesRanges = ['B42:B45', 'B50:B52', 'B58:B61', 'B63:B64', 'B66:B70', 'F37:G40', 'K37:L39'];
    otherDirectExpensesRanges.forEach(function(cellRange) {
        let ode_Range = sheetToReset.getRange(cellRange);
        ode_Range.setValue("Other Direct Expenses");
    });

    const projSetupData = ['H50:I50', 'H54:I55', 'H58:I58']
    projSetupData.forEach(function(cellRange) {
        let projSetupRange = sheetToReset.getRange(cellRange);
        projSetupRange.setValue("None");
    });

    const rateSelector = 'J1:K1';
    var rateValue = "2025 Commercial Rates"
    sheetToReset.getRange(rateSelector).setValue(rateValue);

    const localeSelector = 'H42:I42';
    var localeValue = "Rural"
    sheetToReset.getRange(localeSelector).setValue(localeValue);

    const commishSelector = 'M70'
    var commishValue = "YES"
    sheetToReset.getRange(commishSelector).setValue(commishValue);

    const turnMilesRange = 'C39';
    var turnMilesValue = templateSheet.getRange(turnMilesRange).getValue();
    sheetToReset.getRange(turnMilesRange).setValue(turnMilesValue);
   
    const flight_RestrictedArea = 'C41';
    var restrictedAreaValue = "NO";
    sheetToReset.getRange(flight_RestrictedArea).setValue(restrictedAreaValue);

    let isTemplate;

    try {
        // Look for TemplateMarker named range to set isTemplate property
        const namedRanges = ss.getNamedRanges();
        isTemplate = namedRanges.some(range => range.getName() === 'TemplateMarker');
        documentProperties.setProperty('isTemplate', isTemplate.toString());
        Logger.log('TemplateMarker found: ' + isTemplate);
    } catch (error) {
        isTemplate = false;
        Logger.log('Error checking for TemplateMarker: ' + error);
    }

    // Update UI based on the isTemplate property
    const ui = SpreadsheetApp.getUi();
    createCustomMenu(ui, isTemplate);
}

function createFolder(parentFolderId, folderName) {
    if (!folderName || folderName.trim() === '') {
        return {
            error: "INVALID_NAME",
            message: "Folder name cannot be empty."
        };
    }
    
    try {
        const parentFolder = DriveApp.getFolderById(parentFolderId);
        const existingFolders = parentFolder.getFoldersByName(folderName);
        if (existingFolders.hasNext()) {
            return {
                error: "FOLDER_EXISTS",
                message: "A folder with the name '" + folderName + "' already exists in this location."
            };
        }
        
        const newFolder = parentFolder.createFolder(folderName);
        if (parentFolderId !== getRootFolderId()) {
            let archiveFolders = newFolder.getFoldersByName("Archive");
            if (!archiveFolders.hasNext()) {
                try {
                    let archiveFolder = newFolder.createFolder("Archive");
                } catch (archiveError) {
                    console.error("Error creating Archive folder:", archiveError);
                }
            }
        }

        // Update cache
        const cache = CacheService.getUserCache();
        let cachedFolders;
        try {
            cachedFolders = JSON.parse(cache.get('allFolders') || '[]');
            if (!Array.isArray(cachedFolders)) {
                throw new Error('Cached folders is not an array');
            }
        } catch (parseError) {
            console.error("Error parsing cached folders:", parseError);
            cachedFolders = [];
        }

        cachedFolders.push({
            id: newFolder.getId(),
            name: newFolder.getName(),
            parent: parentFolderId
        });
        cache.put('allFolders', JSON.stringify(cachedFolders), 21600); 
        
        return {
            id: newFolder.getId(),
            name: newFolder.getName()
        };
    } catch (e) {
        console.error("Error in createFolder:", e);
        if (e.message.includes("Access denied")) {
            return {
                error: "ACCESS_DENIED",
                message: "You don't have permission to create a folder in this location."
            };
        } else if (e.message.includes("File not found")) {
            return {
                error: "PARENT_NOT_FOUND",
                message: "The specified parent folder could not be found."
            };
        }
        return {
            error: "UNKNOWN_ERROR",
            message: e.toString()
        };
    }
}

function copySpreadsheet(folderId, name) {
    try {
        console.log(`Starting to copy spreadsheet to folder ${folderId} with name ${name}`);
        const templateFile = DriveApp.getFileById(SpreadsheetApp.getActiveSpreadsheet().getId());
        const folder = DriveApp.getFolderById(folderId);

        // Check if a file with the same name already exists in the folder
        const existingFiles = folder.getFilesByName(name);
        if (existingFiles.hasNext()) {
            console.log(`A file named ${name} already exists in the destination folder`);
            return {
                error: "FILE_EXISTS",
                message: `A file with the name '${name}' already exists in this folder.`
            };
        }

        // Create a copy of the spreadsheet
        console.log("Creating copy of the spreadsheet");
        const newFile = templateFile.makeCopy(name, folder);
        const newSpreadsheet = SpreadsheetApp.open(newFile);

        // Remove TemplateMarker named range if it exists
        try {
            console.log("Removing TemplateMarker if it exists");
            const namedRanges = newSpreadsheet.getNamedRanges();
            const templateMarker = namedRanges.find(range => range.getName() === 'TemplateMarker');
            if (templateMarker) {
                templateMarker.remove();
                console.log('Removed TemplateMarker from new file.');
            }
        } catch (error) {
            console.error('Error removing TemplateMarker:', error);
        }

        // Set the isTemplate property for the new file
        console.log("Setting isTemplate property to false");
        PropertiesService.getDocumentProperties().setProperty('isTemplate', 'false');

        // Set protections for sheets in the new spreadsheet
        console.log("Setting sheet protections");
        setSheetProtections(newSpreadsheet);

        // Set the active sheet to "Project Estimator" or the first sheet if it doesn't exist
        console.log("Setting active sheet");
        newSpreadsheet.setActiveSheet(newSpreadsheet.getSheetByName('Project Estimator') || newSpreadsheet.getSheets()[0]);

        // Create an onOpen trigger for the new spreadsheet
        // Clean up stale triggers and guard against trigger quota exhaustion
        (function createOnOpenTriggerForSpreadsheet(spreadsheet) {
            try {
                var triggers = ScriptApp.getProjectTriggers();

                // Delete triggers that reference missing files (stale triggers)
                var removed = 0;
                triggers.forEach(function(t) {
                    try {
                        var srcId = t.getTriggerSourceId ? t.getTriggerSourceId() : null;
                        if (srcId) {
                            // This will throw if the file doesn't exist or access is denied
                            DriveApp.getFileById(srcId);
                        }
                    } catch (err) {
                        // If the trigger references a non-existent file, delete it
                        try { ScriptApp.deleteTrigger(t); removed++; } catch (e) { /* ignore */ }
                    }
                });
                if (removed) console.log('Removed', removed, 'stale triggers before creating new onOpen trigger');

                // Re-evaluate triggers after cleanup
                triggers = ScriptApp.getProjectTriggers();
                var TRIGGER_LIMIT = 20; // safe threshold (Apps Script has limits on project triggers)
                if (triggers.length >= TRIGGER_LIMIT) {
                    console.warn('Skipping creation of onOpen trigger: project already has', triggers.length, 'triggers (limit', TRIGGER_LIMIT, ').');
                } else {
                    ScriptApp.newTrigger('onOpen')
                        .forSpreadsheet(spreadsheet)
                        .onOpen()
                        .create();
                    console.log('onOpen trigger created for new spreadsheet');
                }
            } catch (err) {
                console.error('Error while creating onOpen trigger:', err);
            }
        })(newSpreadsheet);

        /** Set WebAppUrl for the new spreadsheet
        console.log("Setting WebAppUrl for the new spreadsheet");
        const webAppUrl = getWebAppUrl();
        if (webAppUrl) {
            PropertiesService.getDocumentProperties().setProperty('webAppUrl', webAppUrl);
            console.log(`WebAppUrl set to: ${webAppUrl}`);
        } else {
            console.log("WebAppUrl not available. It will be set on next open.");
        }
        */

        console.log("Spreadsheet copy process completed successfully");
        return {
            url: newFile.getUrl(),
            name: newFile.getName(),
            id: newFile.getId(),
            //webAppUrl: webAppUrl
        };
    } catch (error) {
        console.error('Error during spreadsheet copy process:', error);
        return {
            error: "COPY_FAILED",
            message: error.toString()
        };
    }
}

function setSheetProtections(ss) {
    ss.getSheets().forEach(sheet => {
        try {
            if (sheet.getName() === 'Project Estimator') {
                // Remove all protections from "Project Estimator" sheet
                const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
                protections.forEach(protection => protection.remove());
            } else {
                // Protect other sheets and allow only the owner to edit
                const protection = sheet.protect().setDescription('Protected Sheet');
                protection.removeEditors(protection.getEditors());
                protection.addEditor('zclark@aerialdata.com');
                protection.setWarningOnly(false);
            }
        } catch (error) {
            console.error(`Error setting protection for sheet ${sheet.getName()}:`, error);
        }
    });
}


// Caching and Folder Retreival
function getAllFoldersRecursively(folderId) {
    const folder = DriveApp.getFolderById(folderId);
    const allFolders = [{
        id: folder.getId(),
        name: folder.getName(),
        parent: folder.getParents().hasNext() ? folder.getParents().next().getId() : null
    }];
    
    const subfolders = folder.getFolders();
    while (subfolders.hasNext()) {
        const subfolder = subfolders.next();
        allFolders.push(...getAllFoldersRecursively(subfolder.getId()));
    }
    
    return allFolders;
}

function updateFolderCache(folderData) {
    console.log(`Updating folder cache with ${folderData.length} items`);
    let dataToCache = folderData || getAllFoldersRecursively(getRootFolderId());
    CacheService.getUserCache().put('allFolders', JSON.stringify(dataToCache), 7200); // Cache for 2 hours
    console.log('Folder cache updated successfully');
}

function getCachedFoldersList(folderId) {
    const cache = CacheService.getUserCache();
    const cachedData = cache.get('allFolders');
    if (cachedData) {
        const allFolders = JSON.parse(cachedData);
        let rootFolder = null;
        const subfolders = [];
        
        for (let i = 0; i < allFolders.length; i++) {
            if (allFolders[i].id === folderId) {
                rootFolder = allFolders[i];
            } else if (allFolders[i].parent === folderId) {
                subfolders.push(allFolders[i]);
            }
        }
        
        if (rootFolder) {
            return {
                path: [{ id: rootFolder.id, name: rootFolder.name }],
                subfolders: subfolders
            };
        }
    }
    
    // If cache miss or root folder not found, fall back to direct fetching
    return getFoldersList(folderId);
}

function getFoldersList(folderId) {
    const folder = DriveApp.getFolderById(folderId);
    const subfolders = folder.getFolders();
    const subfoldersArray = [];
    
    while (subfolders.hasNext()) {
        const subfolder = subfolders.next();
        subfoldersArray.push({
            id: subfolder.getId(),
            name: subfolder.getName()
        });
    }

    return {
        path: [{ id: folder.getId(), name: folder.getName() }],
        subfolders: subfoldersArray
    };
}

function getRootFolderId() {
    return '1Gf8H1xuwiLXqvuEycC0qevRu9mrUzsFF';
}

/**
 * @NotOnlyCurrentDoc Allows the script to access other files in the user's Drive.
 */

/**
function manuallyUpdateWebAppUrl() {
    const scriptId = ScriptApp.getScriptId();
    const deployments = ScriptApp.getProjectTriggers(scriptId);
    if (deployments.length > 0) {
        const latestDeployment = deployments[deployments.length - 1];
        const newUrl = `https://script.google.com/macros/s/${latestDeployment.getDeploymentId()}/exec`;
        setWebAppUrl(newUrl);
        console.log('Web App URL manually updated to: ' + newUrl);
    } else {
        console.log("No deployments found. Please deploy the script first.");
    }
}
*/

/**
function checkForUpdates() {
    console.log("Starting update check process");

    const scriptProperties = PropertiesService.getScriptProperties();
    const currentVersion = scriptProperties.getProperty('scriptVersion') || '1.0';
    console.log(`Current script version: ${currentVersion}`);

    const templateSpreadsheetId = '1ETaeiIpDy8UsmZF3EwQgVHnm9WNGM28UQMFwaQ6xtm8';
    
    try {
        const latestVersion = getLatestVersionFromTemplate(templateSpreadsheetId);
        console.log(`Latest template version: ${latestVersion}`);

        if (currentVersion !== latestVersion) {
            console.log(`Update available. Current: ${currentVersion}, Latest: ${latestVersion}`);
            
            // Update script content
            const templateScriptId = templateFile.getScriptId();
            const updateSuccess = updateScriptContent(templateScriptId);
            
            if (updateSuccess) {
                // Create new deployment
                const newDeploymentId = createNewDeployment(latestVersion);
                
                if (newDeploymentId) {
                    // Update WebApp URL
                    const newWebAppUrl = `https://script.google.com/macros/s/${newDeploymentId}/exec`;
                    setWebAppUrl(newWebAppUrl);
                    
                    // Update version
                    scriptProperties.setProperty('scriptVersion', latestVersion);
                    
                    console.log(`Script updated and new deployment created. New WebApp URL: ${newWebAppUrl}`);
                } else {
                    console.error("Failed to create new deployment");
                    notifyUpdateError("Failed to create new deployment");
                }
            } else {
                console.error("Failed to update script content");
                notifyUpdateError("Failed to update script content");
            }
        } else {
            console.log(`Script is up to date. Current version: ${currentVersion}`);
        }
    } catch (error) {
        console.error("Error in checkForUpdates:", error);
        notifyUpdateCheckError(error);
    }
}

function getLatestVersionFromTemplate(templateSpreadsheetId) {
    const templateSpreadsheet = SpreadsheetApp.openById(templateSpreadsheetId);
    const versionHistory = templateSpreadsheet.getRevisions();
    const latestRevision = versionHistory[0]; // Most recent revision
    return latestRevision.getDescription() || latestRevision.getId().toString();
}


function sendErrorEmail(currentVersion, latestVersion) {
    const user = Session.getActiveUser().getEmail();
    const adminEmail = 'zclark@aerialdata.com'; // Replace with your email
    const subject = 'Script Update Available';
    const body = `An update is available for the Cost Proposal Tools script.
    Current Version: ${currentVersion}
    Latest Version: ${latestVersion}
    User: ${user}
    
    Please update the script to the latest version.`;

    MailApp.sendEmail(adminEmail, subject, body);
}


function notifyUpdateCheckError(error) {
    const user = Session.getActiveUser().getEmail();
    const adminEmail = 'zclark@aerialdata.com'; // Replace with your email
    const subject = 'Error Checking for Script Updates';
    const body = `An error occurred while checking for updates to the Cost Proposal Tools script.
    User: ${user}
    Error: ${error.toString()}
    
    Please check the template spreadsheet permissions and script configuration.`;

    MailApp.sendEmail(adminEmail, subject, body);
}
*/

/**
function updateScriptContent(templateScriptId) {
    try {
        const templateScript = DriveApp.getFileById(templateScriptId);
        const currentScript = DriveApp.getFileById(ScriptApp.getScriptId());
        
        const templateContent = templateScript.getBlob().getDataAsString();
        currentScript.setContent(templateContent);
        
        return true;
    } catch (error) {
        console.error("Error updating script content:", error);
        return false;
    }
}

function createNewDeployment(versionDescription) {
    try {
        const deployment = ScriptApp.newDeployment()
        .setDescription(versionDescription)
        .setExecutionApiConfig({access: "ANYONE"})
        .deploy();
        return deployment.getDeploymentId();
    } catch (error) {
        console.error("Error creating new deployment:", error);
        return null;
    }
}

function setWebAppUrl(url) {
    PropertiesService.getScriptProperties().setProperty('webAppUrl', url);
}

function getWebAppUrl() {
    return PropertiesService.getScriptProperties().getProperty('webAppUrl');
}
*/

