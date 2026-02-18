async function getCourseNameAndNum() {
  const sheetName = "PGA Tournaments";
  const scriptProperties = PropertiesService.getScriptProperties();
  const sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  const apiKey = getApiKey();
  const currentYear = new Date().getFullYear();
  const START_ROW = 6;
  // Time limit to ensure we don't hit timeout (5 minutes in ms)
  const TIME_LIMIT = 5 * 60 * 1000;
  const startTime = Date.now();

  // Better last row detection - only looks at column B (tournament names)
  const dataRange = sheet.getRange("B6:B1000").getValues();
  const lastRow = START_ROW + dataRange.filter(row => row[0] !== "").length - 1;

  // Validate API key before processing
  if (!apiKey || apiKey.length !== 28) {
    throw new Error("Invalid API key format");
  }

  // Progress tracking setup
  const totalRows = lastRow - START_ROW + 1;
  updateCentralStatus(sheetName, `Initializing (${totalRows} rows)`);
  SpreadsheetApp.flush();

  try {
    // Get last processed state
    let lastState = scriptProperties.getProperty('COURSE_DATA_STATE');
    let currentRow, lastYear;
    
    if (lastState) {
      const state = JSON.parse(lastState);
      currentRow = state.row;
      lastYear = state.year;
    } else {
      currentRow = START_ROW;
      lastYear = null;
    }

    // Process until we hit the time limit
    while (currentRow <= lastRow) {
      // Check if we're running out of time
      if (Date.now() - startTime > TIME_LIMIT) {
        // Save our progress and exit
        updateCentralStatus(sheetName, `Paused at row ${currentRow} - will resume on next run`);
        return "Time limit reached, execution paused";
      }
      
      try {
        const rowStartTime = Date.now();
        const processedRows = currentRow - START_ROW + 1;
        const overallProgress = Math.round((processedRows / totalRows) * 100);
        updateCentralStatus(sheetName, `Row ${processedRows} of ${totalRows}: (${overallProgress}%)`);
        SpreadsheetApp.flush();

        const eventId = sheet.getRange(`C${currentRow}`).getValue();
        const eventName = sheet.getRange(`B${currentRow}`).getValue();
        logDebug(`Processing Row ${currentRow}: Event ID - ${eventId} (${eventName})`);

        if (!eventId) {
          logDebug(`Skipping empty event ID at row ${currentRow}`);
          currentRow++;
          scriptProperties.setProperty('COURSE_DATA_STATE', JSON.stringify({row: currentRow, year: null}));
          continue;
        }

        // Process this event's data
        const courseMap = {};
        
        // Determine year range to process
        let startYear = lastYear ? lastYear - 1 : currentYear;
        let endYear = Math.max(2004, startYear - 6); // Process max 7 years at a time
        
        // Year processing
        for (let year = startYear; year >= endYear; year--) {
          // Check time limit within year loop
          if (Date.now() - startTime > TIME_LIMIT) {
            // Save state with current row and year
            scriptProperties.setProperty('COURSE_DATA_STATE', JSON.stringify({row: currentRow, year: year}));
            updateCentralStatus(sheetName, `Paused at row ${currentRow}, year ${year} - will resume on next run`);
            return "Time limit reached during year processing";
          }
          
          try {
            const endpoint = `https://feeds.datagolf.com/historical-raw-data/rounds?tour=pga&event_id=${eventId}&year=${year}&key=${apiKey}`;
            const response = UrlFetchApp.fetch(endpoint, { muteHttpExceptions: true });

            if (response.getResponseCode() === 200) {
              const responseData = JSON.parse(response.getContentText());
              
              // Process primary course
              if (responseData.course_name && responseData.course_num) {
                const cleanNum = responseData.course_num.toString().trim();
                const cleanName = responseData.course_name.toString().trim();
                
                if (!courseMap[cleanNum]) {
                  courseMap[cleanNum] = { name: cleanName, years: [year] };
                } else if (!courseMap[cleanNum].years.includes(year)) {
                  courseMap[cleanNum].years.push(year);
                }
              }

              // Process round-specific courses (simplified)
              if (responseData.scores && responseData.scores.length > 0) {
                // Just look at first player's rounds for efficiency
                const player = responseData.scores[0];
                Object.keys(player).forEach(key => {
                  if (key.startsWith('round_')) {
                    const round = player[key];
                    if (round && round.course_name && round.course_num) {
                      const cleanNum = round.course_num.toString().trim();
                      const cleanName = round.course_name.toString().trim();
                      
                      if (!courseMap[cleanNum]) {
                        courseMap[cleanNum] = { name: cleanName, years: [year] };
                      } else if (!courseMap[cleanNum].years.includes(year)) {
                        courseMap[cleanNum].years.push(year);
                      }
                    }
                  }
                });
              }
            } else {
              logDebug(`Non-200 response for ${eventId}, year ${year}: ${response.getResponseCode()}`);
            }

            // Shorter rate limit protection - 200ms between calls
            Utilities.sleep(200);

          } catch (error) {
            console.error(`Row ${currentRow} (${year}): ${error}`);
            if (error.message.includes("API key")) {
              scriptProperties.deleteProperty('COURSE_DATA_STATE');
              throw error;
            }
          }
        }

        // Format courses for writing to sheet (simplified)
        const courses = Object.entries(courseMap).map(([num, {name, years}]) => {
          return {
            num: num,
            name: name,
            years: years.sort((a, b) => b - a),
            mostRecentYear: Math.max(...years)
          };
        })
        .sort((a, b) => {
          if (b.mostRecentYear !== a.mostRecentYear) {
            return b.mostRecentYear - a.mostRecentYear;
          }
          return parseInt(a.num) - parseInt(b.num);
        });

        // Format for sheet
        const formattedCourses = [];
        courses.forEach(course => {
          formattedCourses.push(course.name);
          formattedCourses.push(`${course.num} (${course.years.join(', ')})`);
        });

        // Write to sheet if we have data
        if (formattedCourses.length > 0) {
          const numColumns = Math.min(formattedCourses.length, sheet.getLastColumn() - 3);
          sheet.getRange(currentRow, 4, 1, sheet.getLastColumn() - 3).clearContent();
          sheet.getRange(currentRow, 4, 1, numColumns).setValues([formattedCourses.slice(0, numColumns)]);
        }

        // Move to next row and reset year tracking
        currentRow++;
        scriptProperties.setProperty('COURSE_DATA_STATE', JSON.stringify({row: currentRow, year: null}));
        
      } catch (error) {
        console.error(`Failed processing row ${currentRow}: ${error}`);
        updateCentralStatus(sheetName, `Row ${currentRow} failed: ${error.message}`);
        SpreadsheetApp.flush();
        throw error;
      }
    }

    // Completed all rows
    scriptProperties.deleteProperty('COURSE_DATA_STATE');
    updateCentralStatus(sheetName, true);
    return "Course data update complete";

  } catch (error) {
    const errorMessage = error.message.includes("quota") 
      ? "API Limit Exceeded - Try again later" 
      : error.message.slice(0, 50);
    
    updateCentralStatus(sheetName, false);
    SpreadsheetApp.flush();
    throw error;
  }
}


