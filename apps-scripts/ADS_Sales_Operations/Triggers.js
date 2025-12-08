/**
 * Creates or recreates the trigger for insertWeeklyColumn to run on Thursday at 9:00 AM
 * This should be called manually once or can be set up in onOpen
 */
function setupInsertWeeklyColumnTrigger() {
  // Delete existing triggers for this function to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'insertWeeklyColumn') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }

  // Create a new trigger for Thursday at 9:00 AM CT
  ScriptApp.newTrigger('insertWeeklyColumn')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(9)
    .nearMinute(0)
    .inTimezone("America/Chicago")
    .create();

  Logger.log("Trigger created for insertWeeklyColumn - Thursday at 9:00 AM CT");
}

/**
 * Lists all project triggers for debugging purposes
 */
function listAllTriggers() {
  var triggers = ScriptApp.getProjectTriggers();
  Logger.log("Total triggers: " + triggers.length);
  for (var i = 0; i < triggers.length; i++) {
    Logger.log("Trigger " + i + ": " + triggers[i].getHandlerFunction() + 
               " - Type: " + triggers[i].getTriggerSource());
  }
}

/**
 * Deletes all triggers for insertWeeklyColumn
 */
function deleteInsertWeeklyColumnTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'insertWeeklyColumn') {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log("Deleted trigger for insertWeeklyColumn");
    }
  }
}
