async function setSimilarCourseDropdowns() {
  const ss = SpreadsheetApp.getActive();
  const sheetName = "Similar Courses";
  const startTime = new Date();

  // Enhanced sheet verification
  const configSheet = ss.getSheetByName("Configuration Sheet");
  if (!configSheet) {
    console.error("❌ Configuration Sheet not found! Check exact name match.");
    updateCentralStatus(sheetName, "error");
    throw new Error("Configuration Sheet not found - check name spelling");
  }

  const pgaSheet = ss.getSheetByName("PGA Tournaments");
  if (!pgaSheet) {
    console.error("❌ PGA Tournaments sheet not found! Check exact name and pluralization.");
    updateCentralStatus(sheetName, "error");
    throw new Error("PGA Tournaments sheet not found - check name spelling");
  }

  try {
    // Better row detection - only look at rows with data in column C (Event ID)
    const START_ROW = 6;
    const eventIdRange = pgaSheet.getRange(`C${START_ROW}:C1000`).getValues();
    const lastRow = eventIdRange.findIndex(row => !row[0]) + START_ROW;
    const lastDataRow = lastRow === (START_ROW - 1) ? pgaSheet.getLastRow() : lastRow;
    
    console.log(`📊 Found ${lastDataRow - START_ROW + 1} rows with potential data (up to row ${lastDataRow})`);

    // Get only the data range we need
    const data = pgaSheet.getRange(START_ROW, 3, lastDataRow - START_ROW + 1, pgaSheet.getLastColumn() - 2).getValues();
    const courseMap = new Map();
    let processedCount = 0;
    let emptyRowCount = 0;
    const MAX_EMPTY_ROWS = 3;

    for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
      const row = data[rowIndex];
      const progress = Math.round(((rowIndex + 1) / data.length) * 100);
      updateCentralStatus(sheetName, `Processing ${rowIndex + 1} of ${data.length}: (${progress}%)`);
      
      if (rowIndex % 10 === 0) {
        SpreadsheetApp.flush(); // Reduce flush frequency for better performance
      }
      
      // Skip empty event IDs
      const rawValue = row[0]?.toString().trim() || '0'; // Handle null/undefined
      const numericValue = parseFloat(rawValue);
      const eventId = Number.isNaN(numericValue) ? 0 : Math.round(numericValue);
      
      if (!eventId) {
        emptyRowCount++;
        console.warn(`⚠️ Skipping row ${rowIndex + START_ROW} - empty event ID (${emptyRowCount} consecutive empty rows)`);
        
        // Early termination after several empty rows
        if (emptyRowCount >= MAX_EMPTY_ROWS) {
          console.log(`🛑 Detected ${MAX_EMPTY_ROWS} consecutive empty rows. Finishing processing.`);
          break;
        }
        continue;
      }
      
      // Reset empty row counter when we find data
      emptyRowCount = 0;

      // Process course pairs with validation
      const courseEntries = row.slice(1);
      for (let i = 0; i < courseEntries.length; i += 2) {
        const namePart = (courseEntries[i] || "").toString().trim();
        const idYearsPart = (courseEntries[i+1] || "").toString().trim();
        
        if (!namePart && !idYearsPart) continue;
        
        // Enhanced regex with debug logging
        const match = `${namePart} ${idYearsPart}`.trim().match(/^\s*([^\d]+?)\s+(\d+)\s*(.*?)\s*$/i);
        if (match) {
          const [_, name, num, years] = match;
          const courseKey = `${name}|${num}`;
          const cleanYears = years.replace(/[()]/g, '').trim();
          const displayText = `${name} (ID: ${num}) [${cleanYears || 'no years'}]`;

          if (!courseMap.has(courseKey)) {
            courseMap.set(courseKey, {
              display: displayText,
              eventIds: new Set()
            });
          }
          courseMap.get(courseKey).eventIds.add(eventId);
          processedCount++;
        } else if (namePart || idYearsPart) {
          console.warn(`⚠️ Failed to parse course entry at row ${rowIndex + START_ROW}, columns ${i}-${i+1}: "${namePart}" / "${idYearsPart}"`);
        }
      }
    }

    console.log(`🔍 Processed ${processedCount} valid course entries from ${data.length} rows`);

    // Convert map to sorted array with validation
    const courses = Array.from(courseMap.values())
      .sort((a, b) => a.display.localeCompare(b.display))
      .map(c => ({
        display: c.display,
        eventIds: Array.from(c.eventIds)
      }));

    // Debug course count
    console.log(`📋 Found ${courses.length} unique courses`);

    if (courses.length === 0) {
      console.error("⚠️ No valid courses found! Check PGA sheet data format.");
      updateCentralStatus(sheetName, "No courses found");
      return;
    }

    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(courses.map(c => c.display), true)
      .setAllowInvalid(false)
      .build();

    // Validation range handling
    try {
      const validationRange = configSheet.getRange("F33:F37"); // More stable reference
      validationRange.clearContent().clearDataValidations();

      // Validation range handling for putting-specific courses
      const puttingValidationRange = configSheet.getRange("F40:F44"); // New range for putting surfaces
      puttingValidationRange.clearContent().clearDataValidations();
       
      if (rule) {
        validationRange.setDataValidation(rule);
        puttingValidationRange.setDataValidation(rule);
        console.log(`✅ Set ${courses.length} courses in dropdown`);

        updateCentralStatus(sheetName, true);
        SpreadsheetApp.flush();
        
        PropertiesService.getScriptProperties()
          .setProperty('COURSE_EVENTS', JSON.stringify(courses));
      } else {
        console.error("⚠️ No valid courses found! Check PGA sheet data format.");
        validationRange.setValue("NO COURSES FOUND - CHECK DATA");
        puttingValidationRange.setValue("NO COURSES FOUND - CHECK DATA");
        updateCentralStatus(sheetName, false);
        SpreadsheetApp.flush();
      }

    } catch (rangeError) {
      console.error("🚨 Range operation failed:", rangeError);
      updateCentralStatus(sheetName, "error");
    }

  } catch (processingError) {
    console.error("🚨 Critical failure:", processingError);
    updateCentralStatus(sheetName, "error");
    throw processingError;
  }
}


