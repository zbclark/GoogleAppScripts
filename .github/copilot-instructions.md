# Copilot Instructions

Before making changes in this repository, read `MODEL_VALIDATION_STATUS.md` to understand the current validation goals, completed work, remaining tasks, and open questions.

The document provides a comprehensive overview of the model validation and optimization process, including the metrics in use, recent changes, and areas that still need to be resolved. It is intended for cross-device reference and continuity. 

This will help ensure that any contributions align with the current state of the project and address the most relevant issues.

The purpose of this the modelOptimizer and validation library is to optimize the model's performance in predicting tournament outcomes and to validate the accuracy of those predictions against actual results - as if I were betting on the outcomes

For now, we need to maintain parity between the modelCore file and results.js file, but we should eventually consolidate the logic into a single source of truth to avoid discrepancies and ensure consistency across the project.  for now the results.js file is the source of truth.  
