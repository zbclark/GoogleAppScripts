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