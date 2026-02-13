function tabulateInvoicesOnEdit(e) {  
  var sheet = e.range.getSheet();  
  if (sheet.getName() === "Invoices") {  
      console.log('Editing detected in the Invoices sheet');  
      fillWorkWeekMatrix(sheet);  
  } else {  
      console.log('Edited sheet is NOT "Invoices", exiting function.');  
    return;  
  }  
}  
  
function fillWorkWeekMatrixAllMonths() {  
  console.log('=== PROCESSING ALL MONTHS - FULL RETABULATION ===');  
    
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();  
  var sheet = spreadsheet.getSheetByName("Invoices");  
    
  if (!sheet) {  
    console.error("ERROR: Could not find 'Invoices' sheet!");  
    return;  
  }  
    
  console.log('Successfully found Invoices sheet');  
    
  var matrixSheet = spreadsheet.getSheetByName("Financial Summary");   
    
  if (!matrixSheet) {  
    console.error("ERROR: Could not find 'Financial Summary' sheet!");  
    return;  
  }  
    
  var dateRange = matrixSheet.getRange("B7:AE7");  
  var dateValues = dateRange.getValues();  
  
  console.log("Fetched date values (2D array):", dateValues);  
  
  if (!dateValues || dateValues.length === 0) {  
    console.error("WARNING: No data found in range 'B7:AE7'.");  
    return;  
  }  
  
  if (dateValues[0] === undefined) {  
    console.error("WARNING: No data found in the first row of 'dateValues'.");  
    return;  
  }  
  
  var dates = dateValues[0];  
  console.log('Successfully extracted dates:', dates);  
  console.log('Number of dates:', dates.length);  
  
  // Process ALL months found in the date headers  
  for (var dateIndex = 0; dateIndex < dates.length; dateIndex++) {  
    var currentDate = new Date(dates[dateIndex]);  
      
    // Skip if invalid date  
    if (isNaN(currentDate.getTime())) {  
      console.log(`Skipping invalid date at index ${dateIndex}: ${dates[dateIndex]}`);  
      continue;  
    }  
      
    var month = currentDate.getMonth();  
    var year = currentDate.getFullYear();  
      
    console.log(`\n--- Processing date ${dateIndex + 1}/${dates.length}: ${currentDate.toDateString()} (Month: ${month + 1}, Year: ${year}) ---`);  
      
    var workWeekRanges = getWorkWeekRanges(year, month);  
    var invoicesByWeek = sumInvoicesByWorkWeek(workWeekRanges, month, sheet);  
  
    console.log(`Found ${invoicesByWeek.length} weeks for ${currentDate.toDateString()}`);  
  
    // Clear existing data for this month first (optional but recommended)  
    for (var weekIndex = 0; weekIndex < 6; weekIndex++) { // Assuming max 6 weeks per month  
      var row = 13 + weekIndex;  
      var column = 2 + dateIndex;  
      matrixSheet.getRange(row, column).setValue(''); // Clear the cell  
    }  
  
    // Set new data  
    for (var weekIndex = 0; weekIndex < workWeekRanges.length; weekIndex++) {  
      var row = 13 + weekIndex;  
      var column = 2 + dateIndex;  // Calculates column based on date index  
      var weekSum = invoicesByWeek[weekIndex] ? invoicesByWeek[weekIndex][1] : 0;  
        
      console.log(`Setting invoices sum for ${currentDate.toDateString()} Week ${weekIndex+1}, Cell [${row},${column}]: ${weekSum}`);  
      matrixSheet.getRange(row, column).setValue(weekSum);  
    }  
      
    console.log(`Completed processing for ${currentDate.toDateString()}`);  
  }  
    
  console.log('\n=== FULL RETABULATION COMPLETE ===');  
}  
     
function fillWorkWeekMatrix(sheet) {  
  var currentDate = new Date(); // Get current date  
  var currentMonth = currentDate.getMonth(); // Current month (0 = January, 11 = December)  
  var currentYear = currentDate.getFullYear(); // Current year  
  
  console.log('Processing for current month and year:', currentMonth + 1, currentYear);  
  
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();  
  var matrixSheet = spreadsheet.getSheetByName("Financial Summary");   
  var dateRange = matrixSheet.getRange("B7:AE7");  
  var dateValues = dateRange.getValues();  
  
  console.log("Fetched date values (2D array):", dateValues);  
  
  if (!dateValues || dateValues.length === 0) {  
    console.error("WARNING: No data found in range 'B7:AE7'.");  
    return;  
  }  
  
  if (dateValues[0] === undefined) {  
    console.error("WARNING: No data found in the first row of 'dateValues'.");  
    return;  
  }  
  
  var dates = dateValues[0];  
  console.log('Successfully extracted dates:', dates);  
  console.log('Number of dates:', dates.length);  
  
  // Determine previous month and year  
  var previousMonth = currentMonth - 1;  
  var previousYear = currentYear;  
  if (previousMonth < 0) {  
    previousMonth = 11;  
    previousYear -= 1;  
  }  
  console.log('Current month is:', currentMonth + 1, '; Previous month is:', previousMonth + 1, '; Previous year is:', previousYear);  
  
  // Process current and previous months  
  var monthsToProcess = [  
    {month: previousMonth, year: previousYear},  
    {month: currentMonth, year: currentYear}  
  ];  
  
  monthsToProcess.forEach(function(monthData) {  
    console.log(`Looking for date matching month ${monthData.month + 1} and year ${monthData.year}`);  
      
    var relevantIndex = -1;  
    for (var i = 0; i < dates.length; i++) {  
      var dateObj = new Date(dates[i]);  
      if (dateObj.getMonth() === monthData.month && dateObj.getFullYear() === monthData.year) {  
        relevantIndex = i;  
        break;  
      }  
    }  
      
    if (relevantIndex >= 0) {  
      console.log(`Found matching date at index ${relevantIndex}: ${dates[relevantIndex]}`);  
        
      var workWeekRanges = getWorkWeekRanges(monthData.year, monthData.month);  
      var invoicesByWeek = sumInvoicesByWorkWeek(workWeekRanges, monthData.month, sheet);  
  
      console.log(`Processing ${invoicesByWeek.length} weeks for ${dates[relevantIndex]}`);  
  
      for (var weekIndex = 0; weekIndex < workWeekRanges.length; weekIndex++) {  
        var row = 13 + weekIndex;  
        var column = 2 + relevantIndex;  // Calculates column based on date index  
        var weekSum = invoicesByWeek[weekIndex] ? invoicesByWeek[weekIndex][1] : 0;  
          
        console.log(`Setting invoices sum for ${dates[relevantIndex]} Week ${weekIndex+1}, Cell [${row},${column}]: ${weekSum}`);  
        matrixSheet.getRange(row, column).setValue(weekSum);  
      }  
    } else {  
      console.log(`No matching date found for month ${monthData.month + 1} and year ${monthData.year}`);  
    }  
  });  
}  
  
function getWorkWeekRanges(yearOfDate, monthIndex) {  
  console.log(`Getting work week ranges for ${new Date(yearOfDate, monthIndex)} (Year: ${yearOfDate}, Month: ${monthIndex + 1})`);  
    
  var startDate = new Date(yearOfDate, monthIndex, 1);  
  var endDate = new Date(yearOfDate, monthIndex + 1, 0);  
  var ranges = [];  
  
  console.log(`Month starts on: ${startDate.toDateString()}, ends on: ${endDate.toDateString()}`);  
  
  // Adjust the start date to skip weekends  
  while (startDate.getDay() === 0 || startDate.getDay() === 6) {  
    startDate.setDate(startDate.getDate() + 1);  
  }  
  
  var currentDate = new Date(startDate);  
  
  while (currentDate <= endDate) {  
    var startOfWeek = new Date(currentDate);  
    var endOfWeek = new Date(currentDate);  
  
    // Set endOfWeek to Friday or the last day of the month, whichever comes first  
    endOfWeek.setDate(endOfWeek.getDate() + (5 - endOfWeek.getDay()));  
    if (endOfWeek > endDate) {  
      endOfWeek = new Date(endDate);  
    }  
  
    // Ensuring we adjust the times  
    startOfWeek.setHours(0, 0, 0, 0);  
    endOfWeek.setHours(23, 59, 59, 999);  
  
    ranges.push([startOfWeek, endOfWeek]);  
    console.log(`Week range from ${startOfWeek.toDateString()} to ${endOfWeek.toDateString()}`);  
  
    // Move to the next Monday  
    currentDate.setDate(endOfWeek.getDate() + 3);  
    currentDate.setHours(0, 0, 0, 0);  
  }  
  
  console.log(`Total work week ranges found: ${ranges.length}`);  
  return ranges;  
}  
  
function sumInvoicesByWorkWeek(workWeekRanges, monthIndex, sheet) {  
  var results = [];  
  
  if (!sheet) {  
    console.error("ERROR: Sheet parameter is undefined in sumInvoicesByWorkWeek");  
    return results;  
  }  
  
  var lastRow = sheet.getLastRow();  
  console.log(`Sheet has ${lastRow} rows`);  
    
  if (lastRow < 2) {  
    console.log("No invoice data found (sheet has less than 2 rows)");  
    return results;  
  }  
  
  var invoiceDataRange = "F2:G" + lastRow;  // Assuming invoices are from F2 to G:LastRow  
  var invoiceRange = sheet.getRange(invoiceDataRange);  
  var invoices = invoiceRange.getValues();  
  
  console.log(`Summing invoices for month ${monthIndex + 1}, found ${invoices.length} invoice rows`);  
  
  for (var i = 0; i < workWeekRanges.length; i++) {  
    var range = workWeekRanges[i];  
    var sum = 0;  
    var invoicesInWeek = 0;  
    console.log(`Processing invoices for week ${i+1} from ${range[0].toDateString()} to ${range[1].toDateString()}`);  
  
    for (var j = 0; j < invoices.length; j++) {  
      var invoiceDate = new Date(invoices[j][0]);  
      var invoiceAmount = parseFloat(invoices[j][1]);  
  
      // Skip if date is invalid or amount is not a number  
      if (isNaN(invoiceDate.getTime()) || isNaN(invoiceAmount)) {  
        continue;  
      }  
  
      if (invoiceDate >= range[0] && invoiceDate <= range[1]) {  
        sum += invoiceAmount;  
        invoicesInWeek++;  
        console.log(`  Found invoice: Date=${invoiceDate.toDateString()}, Amount=${invoiceAmount}`);  
      }  
    }  
    results.push([i+1, sum]);  
    console.log(`Week ${i+1} sum: ${sum} (from ${invoicesInWeek} invoices)`);  
  }  
  return results;  
}  