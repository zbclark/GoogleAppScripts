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
      "Driving Performance": {
        "Driving Distance": { weight: 0.404 },
        "Driving Accuracy": { weight: 0.123},
        "SG OTT": { weight: 0.472 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.14 },
        "Approach <100 SG": { weight: 0.33 },
        "Approach <100 Prox": { weight: 0.53 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.12 },
        "Approach <150 FW SG": { weight: 0.32 },
        "Approach <150 FW Prox": { weight: 0.56 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.11 },
        "Approach <200 FW SG": { weight: 0.30 },
        "Approach <200 FW Prox": { weight: 0.59 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.10 },
        "Approach >200 FW SG": { weight: 0.25 },
        "Approach >200 FW Prox": { weight: 0.65 }
      },
      "Putting": {
        "SG Putting": { weight: 1.0 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1.0 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.20 },
        "Scoring Average": { weight: 0.10 },
        "Birdie Chances Created": { weight: 0.10 },
        "Scoring: Approach <100 SG": { weight: 0.15 },
        "Scoring: Approach <150 FW SG": { weight: 0.15 },
        "Scoring: Approach <150 Rough SG": { weight: 0.15 },
        "Scoring: Approach >150 Rough SG": { weight: 0.10 },
        "Scoring: Approach <200 FW SG": { weight: 0.05 },
        "Scoring: Approach >200 FW SG": { weight: 0.00 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.12 },
        "Great Shots": { weight: 0.08 },
        "Poor Shot Avoidance": { weight: 0.08 },
        "Course Management: Approach <100 Prox": { weight: 0.10 },
        "Course Management: Approach <150 FW Prox": { weight: 0.10 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.15 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.20 },
        "Course Management: Approach <200 FW Prox": { weight: 0.12 },
        "Course Management: Approach >200 FW Prox": { weight: 0.05 }
      }
    }
  },
  TECHNICAL: {
    name: "TECHNICAL",
    description: "Validation CSV TECHNICAL template (2026 Validation - Weight Templates.csv)",
    groupWeights: {
      "Driving Performance": 0.06149975751697382,
      "Approach - Short (<100)": 0.06612209020368574,
      "Approach - Mid (100-150)": 0.16038736663433562,
      "Approach - Long (150-200)": 0.16875303103782735,
      "Approach - Very Long (>200)": 0.08679376818622696,
      "Putting": 0.025430407371484,
      "Around the Green": 0.004425315227934045,
      "Scoring": 0.17587596993210478,
      "Course Management": 0.2507122938894278
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.11474316210807203 },
        "Driving Accuracy": { weight: 0.28739159439626416 },
        "SG OTT": { weight: 0.5978652434956637 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.12888443362451668 },
        "Approach <100 SG": { weight: 0.09351281684089932 },
        "Approach <100 Prox": { weight: 0.777602749534584 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.11734028683181226 },
        "Approach <150 FW SG": { weight: 0.19335071707953064 },
        "Approach <150 FW Prox": { weight: 0.6893089960886571 },
        "Approach <150 Rough GIR": { weight: 0 },
        "Approach <150 Rough SG": { weight: 0 },
        "Approach <150 Rough Prox": { weight: 0 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.10435349747268874 },
        "Approach <200 FW SG": { weight: 0.3277352030001631 },
        "Approach <200 FW Prox": { weight: 0.5679112995271483 },
        "Approach >150 Rough GIR": { weight: 0 },
        "Approach >150 Rough SG": { weight: 0 },
        "Approach >150 Rough Prox": { weight: 0 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.09394081728511038 },
        "Approach >200 FW SG": { weight: 0.15089243776420855 },
        "Approach >200 FW Prox": { weight: 0.755166744950681 }
      },
      "Putting": {
        "SG Putting": { weight: 1 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.40277466994853434 },
        "Scoring Average": { weight: 0.18550011188185275 },
        "Birdie Chances Created": { weight: 0.18371000223763706 },
        "Scoring: Approach <100 SG": { weight: 0.06645782054150817 },
        "Scoring: Approach <150 FW SG": { weight: 0.14499888118147236 },
        "Scoring: Approach <150 Rough SG": { weight: 0.0165585142089953 },
        "Scoring: Approach <200 FW SG": { weight: 0 },
        "Scoring: Approach >200 FW SG": { weight: 0 },
        "Scoring: Approach >150 Rough SG": { weight: 0 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.12983536340516666 },
        "Great Shots": { weight: 0.10708071208673539 },
        "Poor Shot Avoidance": { weight: 0.06715031454959175 },
        "Course Management: Approach <100 Prox": { weight: 0.10279748360326597 },
        "Course Management: Approach <150 FW Prox": { weight: 0.12434747691072147 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.1489760406906706 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.25351358586534606 },
        "Course Management: Approach <200 FW Prox": { weight: 0.08914469281220723 },
        "Course Management: Approach >200 FW Prox": { weight: 0.05715433007629502 }
      }
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
      "Putting": 0.119,
      "Around the Green": 0.100,
      "Scoring": 0.105,
      "Course Management": 0.052
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.061 },
        "Driving Accuracy": { weight: 0.410 },
        "SG OTT": { weight: 0.529 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.12 },
        "Approach <100 SG": { weight: 0.34 },
        "Approach <100 Prox": { weight: 0.54 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.11 },
        "Approach <150 FW SG": { weight: 0.35 },
        "Approach <150 FW Prox": { weight: 0.54 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.10 },
        "Approach <200 FW SG": { weight: 0.32 },
        "Approach <200 FW Prox": { weight: 0.58 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.09 },
        "Approach >200 FW SG": { weight: 0.27 },
        "Approach >200 FW Prox": { weight: 0.64 }
      },
      "Putting": {
        "SG Putting": { weight: 1.0 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1.0 }
      },
      "Scoring": {
        "SG Total": { weight: 0.19 },
        "Scoring Average": { weight: 0.11 },
        "Birdie Chances Created": { weight: 0.10 },
        "Scoring: Approach <100 SG": { weight: 0.15 },
        "Scoring: Approach <150 FW SG": { weight: 0.15 },
        "Scoring: Approach <150 Rough SG": { weight: 0.15 },
        "Scoring: Approach >150 Rough SG": { weight: 0.10 },
        "Scoring: Approach <200 FW SG": { weight: 0.05 },
        "Scoring: Approach >200 FW SG": { weight: 0.00 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.12 },
        "Great Shots": { weight: 0.08 },
        "Poor Shot Avoidance": { weight: 0.08 },
        "Course Management: Approach <100 Prox": { weight: 0.10 },
        "Course Management: Approach <150 FW Prox": { weight: 0.10 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.15 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.20 },
        "Course Management: Approach <200 FW Prox": { weight: 0.12 },
        "Course Management: Approach >200 FW Prox": { weight: 0.05 }
      }
    }
  },
  BALANCED_PGA_WEST: {
    name: "BALANCED_PGA_WEST",
    eventId: "2",
    description: "PGA West optimized: Approach distribution matches actual (15.4% <100, 25.3% 100-150, 29.3% 150-200, 30% >200)",
    groupWeights: {
      "Driving Performance": 0.075,
      "Approach - Short (<100)": 0.083,
      "Approach - Mid (100-150)": 0.137,
      "Approach - Long (150-200)": 0.158,
      "Approach - Very Long (>200)": 0.162,
      "Putting": 0.155,
      "Around the Green": 0.055,
      "Scoring": 0.120,
      "Course Management": 0.055
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.050 },
        "Driving Accuracy": { weight: 0.400 },
        "SG OTT": { weight: 0.550 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.10 },
        "Approach <100 SG": { weight: 0.40 },
        "Approach <100 Prox": { weight: 0.50 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.10 },
        "Approach <150 FW SG": { weight: 0.42 },
        "Approach <150 FW Prox": { weight: 0.48 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.10 },
        "Approach <200 FW SG": { weight: 0.35 },
        "Approach <200 FW Prox": { weight: 0.55 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.09 },
        "Approach >200 FW SG": { weight: 0.28 },
        "Approach >200 FW Prox": { weight: 0.63 }
      },
      "Putting": {
        "SG Putting": { weight: 1.0 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1.0 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.22 },
        "Scoring Average": { weight: 0.12 },
        "Birdie Chances Created": { weight: 0.12 },
        "Scoring: Approach <100 SG": { weight: 0.16 },
        "Scoring: Approach <150 FW SG": { weight: 0.14 },
        "Scoring: Approach <150 Rough SG": { weight: 0.13 },
        "Scoring: Approach >150 Rough SG": { weight: 0.17 },
        "Scoring: Approach <200 FW SG": { weight: 0.03 },
        "Scoring: Approach >200 FW SG": { weight: 0.00 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.10 },
        "Great Shots": { weight: 0.08 },
        "Poor Shot Avoidance": { weight: 0.08 },
        "Course Management: Approach <100 Prox": { weight: 0.12 },
        "Course Management: Approach <150 FW Prox": { weight: 0.12 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.16 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.18 },
        "Course Management: Approach <200 FW Prox": { weight: 0.11 },
        "Course Management: Approach >200 FW Prox": { weight: 0.05 }
      }
    }
  },
  PEBBLE_BEACH_PRO_AM: {
    name: "PEBBLE_BEACH_PRO_AM",
    eventId: "5",
    description: "AT&T Pebble Beach Pro-Am 2026 pre-event blend (TECHNICAL 60/40) with course-adjusted metric weights",
    groupWeights: {
      "Driving Performance": 0.1093,
      "Approach - Short (<100)": 0.1273,
      "Approach - Mid (100-150)": 0.1591,
      "Approach - Long (150-200)": 0.1437,
      "Approach - Very Long (>200)": 0.0318,
      "Putting": 0.1059,
      "Around the Green": 0.0999,
      "Scoring": 0.1622,
      "Course Management": 0.0607
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.1522 },
        "Driving Accuracy": { weight: 0.3831 },
        "SG OTT": { weight: 0.4646 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.0900 },
        "Approach <100 SG": { weight: 0.3200 },
        "Approach <100 Prox": { weight: 0.5900 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.0450 },
        "Approach <150 FW SG": { weight: 0.1450 },
        "Approach <150 FW Prox": { weight: 0.3100 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.0400 },
        "Approach <200 FW SG": { weight: 0.1350 },
        "Approach <200 FW Prox": { weight: 0.3250 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.0800 },
        "Approach >200 FW SG": { weight: 0.2200 },
        "Approach >200 FW Prox": { weight: 0.7000 }
      },
      "Putting": {
        "SG Putting": { weight: 1.0 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1.0 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.2058 },
        "Scoring Average": { weight: 0.2135 },
        "Birdie Chances Created": { weight: 0.0434 },
        "Scoring: Approach <100 SG": { weight: 0.0612 },
        "Scoring: Approach <150 FW SG": { weight: 0.0880 },
        "Scoring: Approach <150 Rough SG": { weight: 0.0880 },
        "Scoring: Approach >150 Rough SG": { weight: 0.0727 },
        "Scoring: Approach <200 FW SG": { weight: 0.1546 },
        "Scoring: Approach >200 FW SG": { weight: 0.0727 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.2959 },
        "Great Shots": { weight: 0.1177 },
        "Poor Shot Avoidance": { weight: -0.1544 },
        "Course Management: Approach <100 Prox": { weight: 0.0492 },
        "Course Management: Approach <150 FW Prox": { weight: 0.0708 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.0708 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.0585 },
        "Course Management: Approach <200 FW Prox": { weight: 0.1243 },
        "Course Management: Approach >200 FW Prox": { weight: 0.0585 }
      }
    }
  },
  WAIALAE_COUNTRY_CLUB: {
    name: "WAIALAE_COUNTRY_CLUB",
    eventId: "6",
    description: "Sony Open 2026 Optimized: 0.4896 corr, 6.4% Top-20, 7.3% Top-20 Weighted",
    groupWeights: {
      "Driving Performance": 0.14221547712535823,
      "Approach - Short (<100)": 0.14223367573656825,
      "Approach - Mid (100-150)": 0.1585070053307613,
      "Approach - Long (150-200)": 0.1471382852447258,
      "Approach - Very Long (>200)": 0.02942765704894516,
      "Putting": 0.14015203361392248,
      "Around the Green": 0.07847375213052042,
      "Scoring": 0.10790140917946558,
      "Course Management": 0.05395070458973279
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.4439213937297278 },
        "Driving Accuracy": { weight: 0.10452536855202589 },
        "SG OTT": { weight: 0.45155323771824624 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.12704935482846694 },
        "Approach <100 SG": { weight: 0.3439453170521983 },
        "Approach <100 Prox": { weight: -0.5290053281193348 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.061009317754322216 },
        "Approach <150 FW SG": { weight: 0.1647364944519474 },
        "Approach <150 FW Prox": { weight: -0.3032646295934103 },
        "Approach <150 Rough GIR": { weight: 0.06366492684648313 },
        "Approach <150 Rough SG": { weight: 0.15126210442130167 },
        "Approach <150 Rough Prox": { weight: -0.25606252693253534 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.058875045115195625 },
        "Approach <200 FW SG": { weight: 0.15107854596009665 },
        "Approach <200 FW Prox": { weight: -0.29321927092225336 },
        "Approach >150 Rough GIR": { weight: 0.053690945491580384 },
        "Approach >150 Rough SG": { weight: 0.1428106531715783 },
        "Approach >150 Rough Prox": { weight: -0.30032553933929573 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.08980228691878112 },
        "Approach >200 FW SG": { weight: 0.2624094451995176 },
        "Approach >200 FW Prox": { weight: -0.6477882678817013 }
      },
      "Putting": {
        "SG Putting": { weight: 1 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.1947674504535388 },
        "Scoring Average": { weight: -0.09468975965994297 },
        "Birdie Chances Created": { weight: 0.09881839144013035 },
        "Scoring: Approach <100 SG": { weight: 0.16398981034606624 },
        "Scoring: Approach <150 FW SG": { weight: 0.14839301873369026 },
        "Scoring: Approach <150 Rough SG": { weight: 0.14399947925214288 },
        "Scoring: Approach <200 FW SG": { weight: 0.05187189593106295 },
        "Scoring: Approach >200 FW SG": { weight: 0.0000955570911835887 },
        "Scoring: Approach >150 Rough SG": { weight: 0.10337463709224189 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.11502369101039253 },
        "Great Shots": { weight: 0.09022106664922576 },
        "Poor Shot Avoidance": { weight: -0.07429961681411379 },
        "Course Management: Approach <100 Prox": { weight: -0.10783374148021413 },
        "Course Management: Approach <150 FW Prox": { weight: -0.10556394634166712 },
        "Course Management: Approach <150 Rough Prox": { weight: -0.16433815048123793 },
        "Course Management: Approach >150 Rough Prox": { weight: -0.17586640960416564 },
        "Course Management: Approach <200 FW Prox": { weight: -0.12204491100887761 },
        "Course Management: Approach >200 FW Prox": { weight: -0.044808466610105416 }
      }
    }
  }
};

/**
 * Loads the selected weight template into the Configuration Sheet
 * Priority:
 *   1. Check G9 for eventId and match to template with that eventId
 *   2. Fall back to checkboxes from B33 (POWER), B34 (TECHNICAL), B35 (BALANCED), B36 (BALANCED_SCORING)
 * Writes:
 * - Group weights to column Q (rows 16-24)
 * - Metric weights to columns G onwards (variable length per group)
 *   G, H, I: Driving (3), Approach (3), etc.
 *   Scoring and Course Management get up to 9 metric columns
 */
function loadWeightTemplate() {
  try {
    console.log("=== LOAD WEIGHT TEMPLATE START ===");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const configSheet = ss.getSheetByName("Configuration Sheet");
    
    if (!configSheet) {
      console.error("❌ Configuration Sheet not found");
      SpreadsheetApp.getUi().alert("Configuration Sheet not found");
      return;
    }
    console.log("✓ Configuration Sheet found");

    let selectedTemplate = null;
    let selectionMethod = "";

    // PRIORITY 1: Check for eventId match in G9
    console.log("\n--- PRIORITY 1: Checking eventId in G9 ---");
    const eventId = configSheet.getRange("G9").getValue();
    console.log(`G9 raw value: ${JSON.stringify(eventId)} (type: ${typeof eventId}, isEmpty: ${eventId === ""})`);
    
    if (eventId && eventId !== "") {
      const eventIdStr = String(eventId).trim();
      console.log(`Looking for eventId: "${eventIdStr}" (length: ${eventIdStr.length})`);
      
      // Search templates for matching eventId
      console.log(`Available templates: ${Object.keys(WEIGHT_TEMPLATES).join(", ")}`);
      for (const [templateName, template] of Object.entries(WEIGHT_TEMPLATES)) {
        if (template.eventId) {
          const templateIdStr = String(template.eventId).trim();
          const matches = templateIdStr === eventIdStr;
          console.log(`  ${templateName}: eventId="${templateIdStr}" (len:${templateIdStr.length}) vs "${eventIdStr}" (len:${eventIdStr.length}) → ${matches ? "✓ MATCH" : "✗ no match"}`);
          if (matches) {
            selectedTemplate = templateName;
            selectionMethod = `eventId match (${eventId})`;
            console.log(`✓✓✓ AUTO-SELECTED: ${selectedTemplate}`);
            break;
          }
        } else {
          console.log(`  ${templateName}: no eventId defined`);
        }
      }
      
      if (!selectedTemplate) {
        console.log(`⚠ No template found for eventId: "${eventIdStr}"`);
      }
    } else {
      console.log("G9 is empty or null, skipping eventId matching");
    }

    // PRIORITY 2: Fall back to checkbox selections if no eventId match
    if (!selectedTemplate) {
      console.log("\n--- PRIORITY 2: Checking checkboxes (fallback) ---");
      const powerChecked = configSheet.getRange("B33").getValue();
      const technicalChecked = configSheet.getRange("B34").getValue();
      const balancedChecked = configSheet.getRange("B35").getValue();
      
      console.log(`B33 (POWER): ${powerChecked} (type: ${typeof powerChecked})`);
      console.log(`B34 (TECHNICAL): ${technicalChecked} (type: ${typeof technicalChecked})`);
      console.log(`B35 (BALANCED): ${balancedChecked} (type: ${typeof balancedChecked})`);

      if (powerChecked === true) {
        selectedTemplate = "POWER";
        selectionMethod = "checkbox";
        console.log("✓ Selected POWER via checkbox");
      } else if (technicalChecked === true) {
        selectedTemplate = "TECHNICAL";
        selectionMethod = "checkbox";
        console.log("✓ Selected TECHNICAL via checkbox");
      } else if (balancedChecked === true) {
        selectedTemplate = "BALANCED";
        selectionMethod = "checkbox";
        console.log("✓ Selected BALANCED via checkbox");
      } else {
        console.log("❌ No checkbox selected");
        SpreadsheetApp.getUi().alert("No template selected.\n\nEither:\n1. Set eventId in G9 for auto-selection, or\n2. Select a template: POWER, TECHNICAL, BALANCED");
        return;
      }
    }

    console.log(`\n=== FINAL SELECTION: ${selectedTemplate} (via ${selectionMethod}) ===\n`);

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
        
        // Convert metricWeights object to array if needed
        if (metricWeights && !Array.isArray(metricWeights)) {
          metricWeights = Object.values(metricWeights).map(obj => obj.weight);
        }
        
        // For Scoring and Course Management: apply dynamic shot distribution to approach metrics
        if ((groupName === "Scoring" || groupName === "Course Management") && metricWeights && Array.isArray(metricWeights)) {
          const adjustedWeights = [...metricWeights];
          
          // Both groups have same structure: [non-approach metrics (0-2)], [approach metrics (3-8)]
          // Scoring: [SG T2G, Scoring Avg, BCC, <100 SG, 100-150 FW, 100-150 Rough, 150-200 FW, >200 FW, >150 Rough]
          // Course Mgmt: [Scrambling, Great Shots, Poor Shots, <100 Prox, 100-150 FW Prox, 100-150 Rough Prox, 150-200 FW Prox, >200 FW Prox, >150 Rough Prox]
          
          // Current template weights for approach metrics (indices 3-8)
          const templateApproachWeights = metricWeights.slice(3, 9);
          const approachSigns = templateApproachWeights.map(val => Math.sign(val) || 1);
          const sumTemplateWeights = templateApproachWeights.reduce((sum, val) => sum + Math.abs(val), 0);
          
          // Scale each by corresponding shot distribution
          // Index 3: <100 → P17
          // Index 4: 100-150 FW → P18
          // Index 5: 100-150 Rough → P18 (same bucket)
          // Index 6: 150-200 FW → P19
          // Index 7: >200 FW → P20
          // Index 8: >150 Rough → P20 (same bucket)
          
          adjustedWeights[3] = normalizedDistribution[0] * sumTemplateWeights * approachSigns[0];  // <100
          adjustedWeights[4] = (normalizedDistribution[1] * sumTemplateWeights / 2) * approachSigns[1];  // 100-150 FW (split with Rough)
          adjustedWeights[5] = (normalizedDistribution[1] * sumTemplateWeights / 2) * approachSigns[2];  // 100-150 Rough
          adjustedWeights[6] = normalizedDistribution[2] * sumTemplateWeights * approachSigns[3];  // 150-200 FW
          adjustedWeights[7] = (normalizedDistribution[3] * sumTemplateWeights / 2) * approachSigns[4];  // >200 FW (split with Rough)
          adjustedWeights[8] = (normalizedDistribution[3] * sumTemplateWeights / 2) * approachSigns[5];  // >150 Rough
          
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
