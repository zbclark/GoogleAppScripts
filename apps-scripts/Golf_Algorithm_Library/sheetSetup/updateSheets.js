async function updateDataSheets() {
  // Initialize all statuses
  const sheets = [
    "Tournament Field", 
    "Historical Data",
    "Approach Skill",
    "ALL Tournaments",
    "PGA Tournaments",
  ];

  const courseData = PropertiesService.getScriptProperties().getProperty('COURSE_EVENTS');
  if (!courseData) {
    try {
      sheets.forEach(sheet => updateCentralStatus(sheet, "Pending start..."));

      // Sequential execution for first three
      await updateTournamentsDataFromButton();
      await getCourseNameAndNum();
      await setSimilarCourseDropdowns();

      // Parallel execution for remaining functions
      await Promise.all([
        updateTournamentFieldDataFromButton(),
        updateApproachSkillDataFromButton()
      ]);

    } catch (error) {
      console.error("Update failed:", error);
      updateCentralStatus("SYSTEM", `Error: ${error.message}`);
      throw error; // Preserve error stack
    }

  } else {
    try {
      // Parallel execution for remaining functions
      await Promise.all([
        updateTournamentFieldDataFromButton(),
        updateApproachSkillDataFromButton()
      ]);

    } catch (error) {
      console.error("Update failed:", error);
      updateCentralStatus("SYSTEM", `Error: ${error.message}`);
      throw error; // Preserve error stack
    }
  }
}


/**
 * Retrieves cached group statistics if available and not expired
 * @param {number} maxAgeInDays - Maximum age of cached data in days
 * @return {Object|null} The cached group stats or null if unavailable/expired
 */
function getCachedCourseData(maxAgeInDays = 7) {
  const cachedCourses = PropertiesService.getScriptProperties().getProperty("COURSE_EVENTS");
  
  if (!cachedCourses) {
    console.log("No cached course found");
    return null;
  }
  
  try {
    const cached = JSON.parse(cachedCourses);
    
    // Check if cache is expired
    const maxAgeMs = maxAgeInDays * 24 * 60 * 60 * 1000;
    const currentTime = new Date().getTime();
    const cacheAge = currentTime - cached.timestamp;
    
    if (cacheAge > maxAgeMs) {
      console.log(`Cached courses are too old (${(cacheAge/(24*60*60*1000)).toFixed(1)} days)`);
      return null;
    }
    
    console.log(`Using cached course statistics (${(cacheAge/(24*60*60*1000)).toFixed(1)} days old)`);
    return cached.COURSE_EVENTS;
  } catch (e) {
    console.error("Error retrieving cached course statistics:", e);
    return null;
  }
}