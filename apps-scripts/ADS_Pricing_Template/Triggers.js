// // First, let's check how many triggers we currently have
// function listAllTriggers() {
//   var allTriggers = ScriptApp.getProjectTriggers();
//   console.log("Number of triggers:", allTriggers.length);
  
//   allTriggers.forEach(function(trigger, index) {
//     console.log("Trigger", index + 1, ":", 
//                 "Handler:", trigger.getHandlerFunction(),
//                 "Event Type:", trigger.getEventType());
//   });
// }

// // Now, let's delete all triggers
// function deleteAllTriggers() {
//   var allTriggers = ScriptApp.getProjectTriggers();
//   allTriggers.forEach(function(trigger) {
//     ScriptApp.deleteTrigger(trigger);
//   });
//   console.log("All triggers deleted.");
// }

// // Run these functions to see and clean up triggers
// listAllTriggers();
// deleteAllTriggers();
// listAllTriggers(); // Run again to confirm deletion

