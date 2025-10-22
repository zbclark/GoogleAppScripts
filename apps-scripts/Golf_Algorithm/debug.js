function debugSpecificEventPlayer() {
  const apiKey = getApiKey();
  const tours = "pga"
  const playerName = "Fleetwood, Tommy";
  const eventId = 475;
  const year = 2023;
  
  for (const tour of tours) {
    const endpoint = `https://feeds.datagolf.com/historical-raw-data/rounds?tour=pga&event_id=475&year=2023&file_format=json&key=${apiKey}`;
    
    try {
      const response = UrlFetchApp.fetch(endpoint);
      const responseCode = response.getResponseCode();
      const responseText = response.getContentText();
      
      console.log(`API Response for ${playerName} at ${eventId} (${year}):`);
      console.log(`Status: ${responseCode}`);
      console.log(`Data: ${responseText}...`);
      
      // Check if player exists in response
      if (responseText.includes(playerName)) {
        console.log(`FOUND ${playerName} in response!`);
      } else {
        console.log(`${playerName} NOT FOUND in response data`);
      }
      
      return "Debug complete";
    } catch (error) {
      console.error(`Error: ${error.message}`);
      return `Error: ${error.message}`;
    }
  }
}

function debugFleetwoodValspar() {
  const apiKey = getApiKey();
  const eventId = "475"; // Use the actual event ID from your ALL Tournaments sheet
  const year = 2023;
  const tour = "pga"; // Assuming it's a PGA tour event
  
  const endpoint = `https://feeds.datagolf.com/historical-raw-data/rounds?tour=${tour}&event_id=${eventId}&year=${year}&file_format=json&key=${apiKey}`;
  
  try {
    const response = UrlFetchApp.fetch(endpoint);
    const data = JSON.parse(response.getContentText());
    
    // Find Tommy's data specifically
    const tommyData = data.scores?.find(player => player.player_name.includes("Fleetwood"));
    
    if (!tommyData) {
      console.log("Tommy Fleetwood not found in data");
      return "Not found";
    }
    
    console.log("TOMMY'S DATA:");
    console.log(JSON.stringify(tommyData));
    
    // Check each round
    Object.keys(tommyData).filter(k => k.startsWith("round_")).forEach(roundKey => {
      console.log(`${roundKey}: ${JSON.stringify(tommyData[roundKey])}`);
    });
    
    // Also check if we have event_date in the data
    console.log(`Event date: ${data.event_date}`);
    console.log(`Event completed: ${data.event_completed}`);
    
    // Now let's try to manually create rows
    const rows = [];
    Object.keys(tommyData).filter(k => k.startsWith("round_")).forEach(roundKey => {
      const num = parseInt(roundKey.split("_")[1]);
      const round = tommyData[roundKey] || {};
      
      const row = [
        tommyData.dg_id,
        tommyData.player_name,
        data.tour,
        data.season,
        data.year,
        data.event_id,
        data.event_name,
        data.event_date || "",
        data.course_name || "",
        data.course_num || "",
        tommyData.fin_text || "",
        // ... other fields ...
      ];
      
      console.log(`Created row for round ${num}: ${row.join(", ")}`);
      rows.push(row);
    });
    
    return "Debug complete. Check logs.";
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return `Error: ${error.message}`;
  }
}

function debugHistoricalDataFlow() {
  try {
    console.log("Starting debug flow");
    
    // 1. Get configuration values
    const configSheet = SpreadsheetApp.getActive().getSheetByName("Configuration Sheet");
    const period = configSheet.getRange("F13").getValue();
    const dateRange = calculateDateRange(period);
    console.log(`Using period: ${period}, Date range: ${Utilities.formatDate(dateRange.startDate, Session.getScriptTimeZone(), "yyyy-MM-dd")} to ${Utilities.formatDate(dateRange.endDate, Session.getScriptTimeZone(), "yyyy-MM-dd")}`);
    
    // 2. Get special events
    const specialEventRanges = [
      configSheet.getRange("G29"),
      configSheet.getRange("G33:G37"),
      configSheet.getRange("G40:G44")
    ];
    
    const specialEventCells = specialEventRanges
      .flatMap(range => range.getValues())
      .flat()
      .filter(String);
      
    const specialEventIds = specialEventCells
      .flatMap(cell => cell.toString().split(','))
      .map(id => id.trim())
      .filter(id => id);
      
    const uniqueSpecialEventIds = [...new Set(specialEventIds)];
    console.log(`Special event IDs (${uniqueSpecialEventIds.length}): ${uniqueSpecialEventIds.join(', ')}`);
    
    // 3. Load tournament data and find Valspar specifically
    const tournamentSheet = SpreadsheetApp.getActive().getSheetByName("ALL Tournaments");
    const tournamentData = tournamentSheet.getRange("B6:H" + tournamentSheet.getLastRow()).getValues();
    console.log(`Loaded ${tournamentData.length} tournament records`);
    
    // Look specifically for Valspar Championship 2023
    const valsparRows = tournamentData.filter(row => 
      row[4]?.toString().toLowerCase().includes("valspar") && 
      row[2]?.toString().includes("2023")
    );
    
    console.log(`Found ${valsparRows.length} Valspar 2023 entries:`);
    valsparRows.forEach(row => {
      console.log(`Tour: ${row[0]}, Date: ${row[1]}, Year: ${row[2]}, ID: ${row[3]}, Name: ${row[4]}`);
    });
    
    // 4. Check if Valspar is in special events
    const valsparIds = valsparRows.map(row => row[3]?.toString().trim()).filter(id => id);
    const valsparInSpecial = valsparIds.some(id => uniqueSpecialEventIds.includes(id));
    console.log(`Is Valspar in special events? ${valsparInSpecial}`);
    
    // 5. Check filtered events
    const tours = getTourSelection();
    console.log(`Selected tours: ${tours.join(", ")}`);
    
    // Reproduce the filtering logic
    const filteredEvents = [];
    tournamentData.forEach(row => {
      const tour = row[0]?.toString().trim();
      const eventId = row[3]?.toString().trim();
      
      // Skip empty records
      if (!tour || !eventId) return;
      
      const isValspar = row[4]?.toString().toLowerCase().includes("valspar") && 
                        row[2]?.toString().includes("2023");
      
      if (isValspar) {
        const isSpecialEvent = uniqueSpecialEventIds.includes(eventId) && tours.includes(tour);
        console.log(`Valspar 2023 (ID: ${eventId}) - In special events? ${isSpecialEvent}, Tour match? ${tours.includes(tour)}`);
        
        if (isSpecialEvent) {
          console.log(`✅ Valspar 2023 WILL be included as special event`);
          filteredEvents.push({ tour, eventId, year: 2023 });
        } else {
          const eventDate = new Date(row[1]);
          const eventTime = eventDate.getTime();
          const isInDateRange = eventTime >= dateRange.startDate.getTime() && 
                                eventTime <= dateRange.endDate.getTime();
                                
          console.log(`Valspar 2023 date check: ${Utilities.formatDate(eventDate, Session.getScriptTimeZone(), "yyyy-MM-dd")} in range? ${isInDateRange}`);
          
          if (isInDateRange && tours.includes(tour)) {
            console.log(`✅ Valspar 2023 WILL be included due to date range`);
            filteredEvents.push({ tour, eventId, year: 2023 });
          } else {
            console.log(`❌ Valspar 2023 will NOT be included`);
          }
        }
      }
    });
    
    console.log(`Final filtered events count: ${filteredEvents.length}`);
    return "Debug complete - check logs";
    
  } catch (error) {
    console.error(`Error: ${error.message}`);
    return `Error: ${error.message}`;
  }
}

function removeProtections() {
  var sheet = SpreadsheetApp.getActiveSheet();
  
   // Remove any existing protections on the sheet
  var protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
  for (var i = 0; i < protections.length; i++) {
    protections[i].remove();
  }
  
  var rangeProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  for (var i = 0; i < rangeProtections.length; i++) {
    rangeProtections[i].remove();
  }
  
  console.log("All protections removed");
}