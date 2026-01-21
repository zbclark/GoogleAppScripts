const CONFIG_SHEET = "Configuration Sheet";
const START_YEAR = 2004; // Moved to top-level constant

function getUniqueCourses(eventId) {
  const apiKey = getApiKey();
  const currentYear = new Date().getFullYear();
  const DEBUG_VERBOSE = false;
  let yearCount = 0;

  if (!apiKey || apiKey.length !== 28) {
    throw new Error("Invalid API key format");
  }

  const courseMap = new Map();

  for (let year = currentYear; year >= START_YEAR; year--) {
     
    try { 
      const endpoint = `https://feeds.datagolf.com/historical-raw-data/rounds?tour=pga&event_id=${eventId}&year=${year}&key=${apiKey}`;
      const response = UrlFetchApp.fetch(endpoint, { muteHttpExceptions: true });

      if (response.getResponseCode() === 200) {
        const data = JSON.parse(response.getContentText());

        const processCourse = (name, num, processingYear) => { // Removed unused year parameter
          const cleanNum = num.toString().trim();
          const cleanName = name.toString().trim();
          
          if (!courseMap.has(cleanNum)) {
            courseMap.set(cleanNum, {
              name: cleanName,
              years: new Set([processingYear])
            });
          } else {
            courseMap.get(cleanNum).years.add(processingYear);
          }
        };

        // Fixed: Use current loop year instead of data.year
        if (data.course_name && data.course_num) {
          processCourse(data.course_name, data.course_num, year);
        }

        if (data.scores) {
          data.scores.forEach(player => {
            Object.keys(player).forEach(key => {
              if (key.startsWith('round_')) {
                const round = player[key];
                if (round.course_name && round.course_num) {
                  processCourse(round.course_name, round.course_num, year);
                }
              }
            });
          });
        }
      }
      Utilities.sleep(500); // Moved inside try block
    } catch (e) {
      console.error(`Error processing ${year}: ${e.toString()}`);
      if (e.message.includes("API key")) throw e;
    }
  }

  return Array.from(courseMap, ([num, { name, years }]) => {
    const sortedYears = Array.from(years).sort((a, b) => b - a);
    return {
      display: `${name} (Course ID: ${num}) · ${sortedYears.join(', ')}`,
      value: `${num}|${name}`,
      meta: {
        num: num,
        name: name,
        years: sortedYears,
        mostRecentYear: sortedYears[0]
      }
    };
  }).sort((a, b) => {
    if (b.meta.mostRecentYear !== a.meta.mostRecentYear) {
      return b.meta.mostRecentYear - a.meta.mostRecentYear;
    }
    return parseInt(a.meta.num) - parseInt(b.meta.num);
  });
}

async function onEditInstallableTrigger(e) {
  const range = e.range;
  const sheet = range.getSheet();

  if (sheet.getName() !== CONFIG_SHEET) return;

  const statusCell = sheet.getRange("E10");
  const dropdownCell = sheet.getRange("F10");
  const eventIdCell = sheet.getRange("G9");
  const courseIdCell = sheet.getRange("G10");
  const similarCourses = sheet.getRange("F33:F37");
  const similarCourseIds = sheet.getRange("G33:G37");
  const similarPutting = sheet.getRange("F40:F44");
  const similarPuttingIds = sheet.getRange("G40:G44");

  // Handle F9 edits (course dropdown cell)
  if (range.getA1Notation() === "F9") {
       
    try {
      dropdownCell.setValue("");
      courseIdCell.clearContent();

      statusCell.setValue("🔄 Fetching courses...").setBackground("#FFF2CC");
      SpreadsheetApp.flush();

      const eventId = sheet.getRange("G9").getValue().toString();
            
      // Pass status cell to course fetcher
      const courses = getUniqueCourses(eventId);

      // Dropdown setup
      statusCell.setValue("🔄 Building dropdown...");
      SpreadsheetApp.flush(); // Show intermediate state)
      
      // Final UI updates
      statusCell.setValue("🔄 Preparing dropdown...");
      SpreadsheetApp.flush();
      
      await setCourseDropdown(sheet, courses);
      SpreadsheetApp.flush();
      
      Utilities.sleep(1500);
      SpreadsheetApp.flush();
      
      statusCell.setValue("✅ Course").setBackground(null);
      SpreadsheetApp.flush();

    } catch (e) {
      statusCell.setValue("❌ Error: " + e.message).setBackground("#FFEBE6");
      dropdownCell.setDataValidation(null);
      throw e;
    }
  }

  // Handle Similar Course dropdown or Putting-Specific Course dropdown
  if ((range.getColumn() === 6 && range.getRow() >= 33 && range.getRow() <= 37) || 
      (range.getColumn() === 6 && range.getRow() >= 40 && range.getRow() <= 44)) {
    
    try {
      // Indicate we're processing
      const tempStatus = sheet.getRange("E" + range.getRow());
      tempStatus.setValue("🔄").setBackground("#FFF2CC");
      SpreadsheetApp.flush();
      
      // Get the selected course value
      const selectedValue = range.getValue();
      console.log(`Selected course: "${selectedValue}" in cell ${range.getA1Notation()}`);
      
      // Get course data from script properties
      let courses = [];
      try {
        const courseData = PropertiesService.getScriptProperties().getProperty('COURSE_EVENTS');
        console.log(`Raw COURSE_EVENTS data: ${courseData ? courseData.substring(0, 100) + "..." : "null or empty"}`);
        
        if (courseData) {
          courses = JSON.parse(courseData);
          console.log(`Parsed ${courses.length} courses from script properties`);
        } else {
          console.error("No course data found in script properties");
        }
      } catch (parseError) {
         console.log(`Error parsing: ${parseError}`);
      }
      
      // Find the matching course
      let found = false;
      if (selectedValue && courses.length > 0) {
        // Log a few courses to help debug
        console.log("First few courses in data:");
        courses.slice(0, 3).forEach((c, i) => {
          console.log(`Course ${i+1}: display="${c.display}", eventIds=${JSON.stringify(c.eventIds)}`);
        });
        
        // Try exact match first
        const course = courses.find(c => c.display === selectedValue);
        
        if (course) {
          console.log(`Found exact match for "${selectedValue}": ${JSON.stringify(course)}`);
          
          // Clear existing content in the adjacent cell
          const idCell = sheet.getRange(range.getRow(), range.getColumn() + 1);
          idCell.clearContent();
          
          // Set the event IDs (comma-separated if multiple)
          const eventIds = course.eventIds.join(", ");
          idCell.setValue(eventIds);
          console.log(`Updated cell ${idCell.getA1Notation()} with value: ${eventIds}`);
          
          found = true;
        } else {
          // If no exact match, try partial match (fuzzy matching)
          console.log(`No exact match found for "${selectedValue}", trying partial match...`);
          
          const partialMatch = courses.find(c => 
            selectedValue && c.display && 
            (c.display.includes(selectedValue) || selectedValue.includes(c.display))
          );
          
          if (partialMatch) {
            console.log(`Found partial match: "${partialMatch.display}"`);
            
            // Clear and update adjacent cell
            const idCell = sheet.getRange(range.getRow(), range.getColumn() + 1);
            idCell.clearContent();
            const eventIds = partialMatch.eventIds.join(", ");
            idCell.setValue(eventIds);
            console.log(`Updated cell ${idCell.getA1Notation()} with value: ${eventIds}`);
            
            found = true;
          }
        }
      }
      
      if (!found) {
        console.error(`No match found for "${selectedValue}" among ${courses.length} courses`);
        // Clear the adjacent cell as we couldn't find a match
        sheet.getRange(range.getRow(), range.getColumn() + 1).clearContent();
      }
      
      // Update status indicator
      tempStatus.setValue(found ? "✅" : "⚠️").setBackground(null);
      SpreadsheetApp.flush();
      
      // Clear status after a delay
      Utilities.sleep(1500);
      tempStatus.clearContent();
      SpreadsheetApp.flush();
      
    } catch (error) {
      console.error(`Error updating event ID: ${error.toString()}`);
      sheet.getRange("E" + range.getRow()).setValue("❌").setBackground("#FFEBE6");
      SpreadsheetApp.flush();
    }
  }

  // Handle F10 edits (course selection)
  if (range.getA1Notation() === "F10") {
    const statusCell = sheet.getRange("E10");
    const courseIdCell = sheet.getRange("G10");
    
    try {
      // Show processing status
      statusCell.setValue("🔄 Updating course ID...").setBackground("#FFF2CC");
      courseIdCell.setValue("");
      SpreadsheetApp.flush();

      // Update course ID
      await updateCourseNumber(sheet);
      statusCell.setValue("✅ Course").setBackground(null);
      SpreadsheetApp.flush();

    } catch (e) {
      statusCell.setValue("❌ Error: " + e.message).setBackground("#FFEBE6");
      courseIdCell.setValue("");
      throw e;
    }
  }
}


function setCourseDropdown(sheet, courses) {
  console.log("Setting dropdown with courses:", courses);
  const cell = sheet.getRange("F10");
     
  // Clear existing validation
  const currentValidation = cell.getDataValidation();
  if (currentValidation) {
    cell.setDataValidation(null);
  }
     
  if (courses?.length > 0) {
    const courseNames = courses.map(c => c.display);
    console.log("Course names for dropdown:", courseNames);
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(courseNames)
      .build();
       
    cell.setDataValidation(rule);
    SpreadsheetApp.flush();
    Utilities.sleep(500);
       
    // Store courses with numbers
    PropertiesService.getScriptProperties()
      .setProperty('COURSES', JSON.stringify(courses));
  } else {
    console.log("No courses to set in dropdown");
  }
}
   
function updateCourseNumber(sheet) {
  logDebug(`Updating course number...`)
  const selectedCourse = sheet.getRange("F10").getValue();
  const courses = JSON.parse(
    PropertiesService.getScriptProperties().getProperty('COURSES') || '[]'
  );

  const course = courses.find(c => c.display === selectedCourse);
  logDebug(`course.number: ${course.meta.num}`);
  sheet.getRange("G10").setValue(course?.meta.num || "");
}