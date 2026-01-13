/**
 * Template Loader Module
 * Loads POWER, TECHNICAL, or BALANCED weight templates based on checkbox selection
 * Configuration Sheet: B33 (POWER), B34 (TECHNICAL), B35 (BALANCED)
 */

/**
 * Weight templates by course type
 * BASED ON ACTUAL CORRELATION DATA FROM 9 TOURNAMENTS
 * 
 * Structure:
 * - groupWeights: Weight for each of 9 groups (Columns Q16-Q24)
 * - metricWeights: Distribution of each group weight across its sub-metrics
 *   Metric counts per group:
 *   - Driving Performance: 3 metrics (Driving Distance, Driving Accuracy, SG OTT)
 *   - Approach groups: 3 metrics each
 *   - Putting: 1 metric
 *   - Around the Green: 1 metric
 *   - Scoring: 9 metrics
 *   - Course Management: 9 metrics
 */
const WEIGHT_TEMPLATES = {
  POWER: {
    name: "POWER",
    description: "Data-driven weights for distance-heavy courses (HIGH Distance correlation: 0.37)",
    groupWeights: {
      "Driving Performance": 0.130,      // Distance 0.37 dominates
      "Approach - Short (<100)": 0.145,  // SG T2G 0.76
      "Approach - Mid (100-150)": 0.180, // SG Approach 0.51
      "Approach - Long (150-200)": 0.150,
      "Approach - Very Long (>200)": 0.030,
      "Putting": 0.120,                  // SG Putting 0.46
      "Around the Green": 0.080,         // SG Around Green 0.14 (low)
      "Scoring": 0.110,                  // Score 0.97
      "Course Management": 0.055         // Model Rank 0.33
    },
    metricWeights: {
      "Driving Performance": [0.404, 0.123, 0.472],     // Normalized: Distance 0.370/0.915, Accuracy 0.113/0.915, OTT 0.432/0.915
      "Approach - Short (<100)": [0.14, 0.33, 0.53],    // Fairway 0.35, SG Approach 0.51, SG OTT 0.43
      "Approach - Mid (100-150)": [0.12, 0.32, 0.56],
      "Approach - Long (150-200)": [0.11, 0.30, 0.59],
      "Approach - Very Long (>200)": [0.10, 0.25, 0.65],
      "Putting": [1.0],
      "Around the Green": [1.0],
      "Scoring": [0.20, 0.10, 0.10, 0.15, 0.15, 0.15, 0.10, 0.05, 0.00],
      "Course Management": [0.12, 0.08, 0.08, 0.10, 0.10, 0.15, 0.20, 0.12, 0.05]
    }
  },
  TECHNICAL: {
    name: "TECHNICAL",
    description: "Data-driven weights for precision courses (LOW Distance: 0.06, HIGH Accuracy: 0.25, Around Green: 0.33)",
    groupWeights: {
      "Driving Performance": 0.065,      // Distance 0.06 is negligible
      "Approach - Short (<100)": 0.148,  // SG T2G 0.70
      "Approach - Mid (100-150)": 0.185, // SG Approach 0.42
      "Approach - Long (150-200)": 0.167,
      "Approach - Very Long (>200)": 0.037,
      "Putting": 0.107,                  // SG Putting 0.39
      "Around the Green": 0.125,         // SG Around Green 0.33 (HIGH!)
      "Scoring": 0.097,                  // Score 0.97
      "Course Management": 0.069         // Model Rank 0.17
    },
    metricWeights: {
      "Driving Performance": [0.086, 0.354, 0.560],     // Normalized: Distance 0.060/0.701, Accuracy 0.248/0.701, OTT 0.393/0.701
      "Approach - Short (<100)": [0.09, 0.32, 0.59],
      "Approach - Mid (100-150)": [0.09, 0.29, 0.62],
      "Approach - Long (150-200)": [0.08, 0.27, 0.65],
      "Approach - Very Long (>200)": [0.08, 0.22, 0.70],
      "Putting": [1.0],
      "Around the Green": [1.0],
      "Scoring": [0.18, 0.12, 0.10, 0.15, 0.15, 0.15, 0.10, 0.05, 0.00],
      "Course Management": [0.12, 0.08, 0.08, 0.10, 0.10, 0.15, 0.20, 0.12, 0.05]
    }
  },
  BALANCED: {
    name: "BALANCED",
    description: "Data-driven weights for balanced courses (Accuracy: 0.35, SG Approach: 0.56)",
    groupWeights: {
      "Driving Performance": 0.090,      // Distance 0.05 (very low), Accuracy 0.35 (high)
      "Approach - Short (<100)": 0.148,  // SG T2G 0.75
      "Approach - Mid (100-150)": 0.186, // SG Approach 0.56 (HIGHEST)
      "Approach - Long (150-200)": 0.167,
      "Approach - Very Long (>200)": 0.033,
      "Putting": 0.119,                  // SG Putting 0.51
      "Around the Green": 0.100,         // SG Around Green 0.20
      "Scoring": 0.105,                  // Score 0.98
      "Course Management": 0.052         // Model Rank 0.39
    },
    metricWeights: {
      "Driving Performance": [0.061, 0.410, 0.529],     // Normalized: Distance 0.052/0.856, Accuracy 0.351/0.856, OTT 0.453/0.856
      "Approach - Short (<100)": [0.12, 0.34, 0.54],    // Fairway 0.29, SG Approach 0.56, SG OTT 0.45
      "Approach - Mid (100-150)": [0.11, 0.35, 0.54],
      "Approach - Long (150-200)": [0.10, 0.32, 0.58],
      "Approach - Very Long (>200)": [0.09, 0.27, 0.64],
      "Putting": [1.0],
      "Around the Green": [1.0],
      "Scoring": [0.19, 0.11, 0.10, 0.15, 0.15, 0.15, 0.10, 0.05, 0.00],
      "Course Management": [0.12, 0.08, 0.08, 0.10, 0.10, 0.15, 0.20, 0.12, 0.05]
    }
  }
};

/**
 * Loads the selected weight template into the Configuration Sheet
 * Reads checkboxes from B33 (POWER), B34 (TECHNICAL), B35 (BALANCED)
 * Writes:
 * - Group weights to column Q (rows 16-24)
 * - Metric weights to columns G onwards (variable length per group)
 *   G, H, I: Driving (3), Approach (3), etc.
 *   Scoring and Course Management get up to 9 metric columns
 */
function loadWeightTemplate() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName("Configuration Sheet");
    
    if (!configSheet) {
      SpreadsheetApp.getUi().alert("Configuration Sheet not found");
      return;
    }

    // Read checkbox selections
    const powerChecked = configSheet.getRange("B33").getValue();
    const technicalChecked = configSheet.getRange("B34").getValue();
    const balancedChecked = configSheet.getRange("B35").getValue();

    let selectedTemplate = null;

    if (powerChecked === true) {
      selectedTemplate = "POWER";
    } else if (technicalChecked === true) {
      selectedTemplate = "TECHNICAL";
    } else if (balancedChecked === true) {
      selectedTemplate = "BALANCED";
    } else {
      SpreadsheetApp.getUi().alert("Please select a template: POWER, TECHNICAL, or BALANCED");
      return;
    }

    console.log(`Loading template: ${selectedTemplate}`);

    const template = WEIGHT_TEMPLATES[selectedTemplate];
    if (!template) {
      SpreadsheetApp.getUi().alert("Template not found: " + selectedTemplate);
      return;
    }

    // Group order in Configuration Sheet (rows 16-24)
    const groupOrder = [
      "Driving Performance",
      "Approach - Short (<100)",
      "Approach - Mid (100-150)",
      "Approach - Long (150-200)",
      "Approach - Very Long (>200)",
      "Putting",
      "Around the Green",
      "Scoring",
      "Course Management"
    ];

    // Columns G-O for metric weights (starting at column G = 7)
    const metricColumns = ["G", "H", "I", "J", "K", "L", "M", "N", "O"];

    // Read shot distribution for dynamic approach SG weighting
    const shotDistribution = [
      configSheet.getRange("P17").getValue(),  // <100
      configSheet.getRange("P18").getValue(),  // 100-150
      configSheet.getRange("P19").getValue(),  // 150-200
      configSheet.getRange("P20").getValue()   // >200
    ];
    const totalShots = shotDistribution.reduce((sum, val) => sum + val, 0);
    const normalizedDistribution = shotDistribution.map(val => val / totalShots);
    
    console.log("Shot distribution (normalized):", normalizedDistribution);

    // Write group weights to column Q (rows 16-24) AND metric weights starting at column G
    let startRow = 16;
    groupOrder.forEach((groupName, index) => {
      const groupWeight = template.groupWeights[groupName];
      let metricWeights = template.metricWeights[groupName];
      
      if (groupWeight !== undefined) {
        // Write group weight to column Q
        const groupCell = configSheet.getRange(`Q${startRow + index}`);
        groupCell.setValue(groupWeight);
        console.log(`  ${groupName}: ${groupWeight}`);
        
        // For Scoring and Course Management: apply dynamic shot distribution to approach metrics
        if ((groupName === "Scoring" || groupName === "Course Management") && metricWeights && Array.isArray(metricWeights)) {
          const adjustedWeights = [...metricWeights];
          
          // Both groups have same structure: [non-approach metrics (0-2)], [approach metrics (3-8)]
          // Scoring: [SG T2G, Scoring Avg, BCC, <100 SG, 100-150 FW, 100-150 Rough, 150-200 FW, >200 FW, >150 Rough]
          // Course Mgmt: [Scrambling, Great Shots, Poor Shots, <100 Prox, 100-150 FW Prox, 100-150 Rough Prox, 150-200 FW Prox, >200 FW Prox, >150 Rough Prox]
          
          // Current template weights for approach metrics (indices 3-8)
          const templateApproachWeights = metricWeights.slice(3, 9);
          const sumTemplateWeights = templateApproachWeights.reduce((sum, val) => sum + val, 0);
          
          // Scale each by corresponding shot distribution
          // Index 3: <100 → P17
          // Index 4: 100-150 FW → P18
          // Index 5: 100-150 Rough → P18 (same bucket)
          // Index 6: 150-200 FW → P19
          // Index 7: >200 FW → P20
          // Index 8: >150 Rough → P20 (same bucket)
          
          adjustedWeights[3] = normalizedDistribution[0] * sumTemplateWeights;  // <100
          adjustedWeights[4] = normalizedDistribution[1] * sumTemplateWeights / 2;  // 100-150 FW (split with Rough)
          adjustedWeights[5] = normalizedDistribution[1] * sumTemplateWeights / 2;  // 100-150 Rough
          adjustedWeights[6] = normalizedDistribution[2] * sumTemplateWeights;  // 150-200 FW
          adjustedWeights[7] = normalizedDistribution[3] * sumTemplateWeights / 2;  // >200 FW (split with Rough)
          adjustedWeights[8] = normalizedDistribution[3] * sumTemplateWeights / 2;  // >150 Rough
          
          metricWeights = adjustedWeights;
          console.log(`  ${groupName} (adjusted for shot distribution):`, metricWeights);
        }
        
        // Write metric weights starting at column G
        if (metricWeights && Array.isArray(metricWeights)) {
          metricWeights.forEach((metricWeight, metricIndex) => {
            if (metricIndex < metricColumns.length) {
              const metricCell = configSheet.getRange(`${metricColumns[metricIndex]}${startRow + index}`);
              metricCell.setValue(metricWeight);
            }
          });
          // Clear remaining columns for this row (in case they had old data)
          for (let i = metricWeights.length; i < metricColumns.length; i++) {
            const clearCell = configSheet.getRange(`${metricColumns[i]}${startRow + index}`);
            clearCell.clearContent();
          }
        }
      }
    });

    // Write confirmation
    configSheet.getRange("Q27").setValue(`Template: ${selectedTemplate}`);
    configSheet.getRange("Q27").setBackground("#C6EFCE");

    SpreadsheetApp.getUi().alert(`✓ Template loaded: ${selectedTemplate}\n\nGroup weights → Column Q (rows 16-24)\nMetric weights → Columns G-O (variable per group)\n\nEdit any weights as needed, then Run Model.`);

  } catch (e) {
    console.error("Error loading template: " + e.message);
    SpreadsheetApp.getUi().alert("Error: " + e.message);
  }
}

/**
 * Shows current template weights for reference
 */
function showTemplateInfo() {
  let info = "WEIGHT TEMPLATES AVAILABLE:\n\n";
  
  Object.keys(WEIGHT_TEMPLATES).forEach(key => {
    const template = WEIGHT_TEMPLATES[key];
    info += `${template.name}:\n${template.description}\n`;
    const gw = template.groupWeights;
    info += `Driving: ${gw["Driving Performance"]}, Approach: ${gw["Approach - Short (<100)"]}, Putting: ${gw["Putting"]}\n\n`;
  });

  info += "METRIC STRUCTURE (editable):\n";
  info += "Col G,H,I: Driving (3 metrics)\n";
  info += "Col J,K,L: Approach (3 metrics per group)\n";
  info += "Col M: Putting (1 metric)\n";
  info += "Col N: Around Green (1 metric)\n";
  info += "Col O-?: Scoring & Course Mgmt (up to 9 each)\n\n";
  info += "Edit any metric weight, then Run Model.";

  SpreadsheetApp.getUi().alert(info);
}
