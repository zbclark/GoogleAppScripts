function checkAuthorization() {
  const authInfo = ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL);
  const status = authInfo.getAuthorizationStatus();
  
  Logger.log("Authorization Status: " + status);
  
  if (status === ScriptApp.AuthorizationStatus.REQUIRED) {
    // Script needs authorization
    Logger.log("Authorization is required. URL: " + authInfo.getAuthorizationUrl());
    return "Script needs authorization. Please run the 'authorizeScript' function.";
  } else if (status === ScriptApp.AuthorizationStatus.NOT_REQUIRED) {
    // Authorization not required or already authorized
    Logger.log("Authorization not required or already authorized.");
    return "Script is authorized!";
  }
}

function authorizeScript() {
  // This function doesn't do anything except trigger the authorization dialog
  return "Authorization requested. Please check the dialog that appeared and accept the permissions.";
}

/**
 * Apply formulas based on template
 */
function applyFormulas() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getActiveSheet();
    
    // Get template from A35
    const template = sheet.getRange("A35").getValue();
    
    // Define all the ranges to process
    const ranges = [
      // {startRow: 4, endRow: 31, columns: ["J","K","L","N","O"], header: "J"},
      // {startRow: 4, endRow: 31, columns: ["Q","R","S","U","V"], header: "Q"},
      // {startRow: 4, endRow: 31, columns: ["X","Y","Z","AB","AC"], header: "X"},
      // {startRow: 4, endRow: 31, columns: ["AE","AF","AG","AI","AJ"], header: "AE"},
      // {startRow: 4, endRow: 31, columns: ["AL","AM","AN","AP","AQ"], header: "AL"},
      // {startRow: 4, endRow: 31, columns: ["AS","AT","AU","AW","AX"], header: "AS"},
      // {startRow: 4, endRow: 31, columns: ["AZ","BA","BB","BD","BE"], header: "AZ"},
      // {startRow: 4, endRow: 31, columns: ["BG","BH","BI","BK","BL"], header: "BG"},
      // {startRow: 4, endRow: 31, columns: ["BN","BO","BP","BR","BS"], header: "BN"},
      {startRow: 4, endRow: 31, columns: ["BU","BV","BW","BY","BZ"], header: "BU"},
      {startRow: 4, endRow: 31, columns: ["CB","CC","CD","CF","CG"], header: "CB"},
      {startRow: 4, endRow: 31, columns: ["CI","CJ","CK","CM","CN"], header: "CI"},
      {startRow: 4, endRow: 31, columns: ["CP","CQ","CR","CT","CU"], header: "CP"},
      {startRow: 4, endRow: 31, columns: ["CW","CX","CY","DA","DB"], header: "CW"},
      {startRow: 4, endRow: 31, columns: ["DD","DE","DF","DH","DI"], header: "DD"},
      {startRow: 4, endRow: 31, columns: ["DK","DL","DM","DO","DP"], header: "DK"},
      {startRow: 4, endRow: 31, columns: ["DR","DS","DT","DV","DW"], header: "DR"},
      {startRow: 4, endRow: 31, columns: ["DY","DZ","EA","EC","ED"], header: "DY"},
      {startRow: 4, endRow: 31, columns: ["EF","EG","EH","EJ","EK"], header: "EF"},
      {startRow: 4, endRow: 31, columns: ["EM","EN","EO","EQ","ER"], header: "EM"},
      {startRow: 4, endRow: 31, columns: ["ET","EU","EV","EX","EY"], header: "ET"},
      {startRow: 4, endRow: 31, columns: ["FA","FB","FC","FE","FF"], header: "FA"},
      {startRow: 4, endRow: 31, columns: ["FH","FI","FJ","FL","FM"], header: "FH"},
      {startRow: 4, endRow: 31, columns: ["FO","FP","FQ","FS","FT"], header: "FO"},
      {startRow: 4, endRow: 31, columns: ["FV","FW","FX","FZ","GA"], header: "FV"},
      {startRow: 4, endRow: 31, columns: ["GC","GD","GE","GG","GH"], header: "GC"}
    ];
    
    let formulasApplied = 0;
    
    // Process each range
    ranges.forEach(range => {
      const headerCol = range.header;
      
      // Process each row in the range
      for (let row = range.startRow; row <= range.endRow; row++) {
        // Process each column in the row
        range.columns.forEach((col, index) => {
          // Generate formula
          let formula = template
            .replace(/\{\{HEADERCOL\}\}/g, headerCol)
            .replace(/\{\{HEADERROW\}\}/g, "2")
            .replace(/\{\{STATICCOL\}\}/g, "A")
            .replace(/\{\{ROW\}\}/g, row)
            .replace(/\{\{COL1\}\}/g, range.columns[0])
            .replace(/\{\{COL2\}\}/g, range.columns[1])
            .replace(/\{\{COL3\}\}/g, range.columns[2])
            .replace(/\{\{COL4\}\}/g, range.columns[3])
            .replace(/\{\{COL5\}\}/g, range.columns[4])
            .replace(/\{\{LASTREF\}\}/g, col + row);
          
          // If formula doesn't start with =, add it
          if (!formula.startsWith('=')) {
            formula = '=' + formula;
          }
          
          // Apply the formula
          const cellAddress = col + row;
          sheet.getRange(cellAddress).setFormula(formula);
          formulasApplied++;
        });
      }
    });
    
    return "Success! Applied " + formulasApplied + " formulas.";
  } catch (e) {
    return "Error: " + e.toString();
  }
}



