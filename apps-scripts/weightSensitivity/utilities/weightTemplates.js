/**
 * Weight Templates for Tournament Analysis
 * Extracted from Golf_Algorithm_Library/utilities/templateLoader.js
 * 
 * These represent POWER, BALANCED, and TECHNICAL course weight profiles
 */

const WEIGHT_TEMPLATES = {
  POWER: {
    name: "POWER",
    description: "Data-driven weights for distance-heavy courses (HIGH Distance correlation: 0.37)",
    groupWeights: {
      "Driving Performance": 0.130,
      "Approach - Short (<100)": 0.145,
      "Approach - Mid (100-150)": 0.180,
      "Approach - Long (150-200)": 0.150,
      "Approach - Very Long (>200)": 0.030,
      "Putting": 0.120,
      "Around the Green": 0.080,
      "Scoring": 0.110,
      "Course Management": 0.055
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.404 },
        "Driving Accuracy": { weight: 0.123 },
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
        "Approach <150 FW Prox": { weight: 0.56 },
        "Approach <150 Rough GIR": { weight: 0.12 },
        "Approach <150 Rough SG": { weight: 0.32 },
        "Approach <150 Rough Prox": { weight: 0.56 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.11 },
        "Approach <200 FW SG": { weight: 0.30 },
        "Approach <200 FW Prox": { weight: 0.59 },
        "Approach >150 Rough GIR": { weight: 0.11 },
        "Approach >150 Rough SG": { weight: 0.30 },
        "Approach >150 Rough Prox": { weight: 0.59 }
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
        "Scoring: Approach <200 FW SG": { weight: 0.05 },
        "Scoring: Approach >200 FW SG": { weight: 0.00 },
        "Scoring: Approach >150 Rough SG": { weight: 0.10 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.12 },
        "Great Shots": { weight: 0.08 },
        "Poor Shots": { weight: 0.08 },
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
    description: "Data-driven weights for precision courses (LOW Distance: 0.06, HIGH Accuracy: 0.25, Around Green: 0.33)",
    groupWeights: {
      "Driving Performance": 0.065,
      "Approach - Short (<100)": 0.148,
      "Approach - Mid (100-150)": 0.185,
      "Approach - Long (150-200)": 0.167,
      "Approach - Very Long (>200)": 0.037,
      "Putting": 0.107,
      "Around the Green": 0.125,
      "Scoring": 0.097,
      "Course Management": 0.069
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.086 },
        "Driving Accuracy": { weight: 0.354 },
        "SG OTT": { weight: 0.560 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.09 },
        "Approach <100 SG": { weight: 0.32 },
        "Approach <100 Prox": { weight: 0.59 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.09 },
        "Approach <150 FW SG": { weight: 0.29 },
        "Approach <150 FW Prox": { weight: 0.62 },
        "Approach <150 Rough GIR": { weight: 0.09 },
        "Approach <150 Rough SG": { weight: 0.29 },
        "Approach <150 Rough Prox": { weight: 0.62 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.08 },
        "Approach <200 FW SG": { weight: 0.27 },
        "Approach <200 FW Prox": { weight: 0.65 },
        "Approach >150 Rough GIR": { weight: 0.08 },
        "Approach >150 Rough SG": { weight: 0.27 },
        "Approach >150 Rough Prox": { weight: 0.65 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.08 },
        "Approach >200 FW SG": { weight: 0.22 },
        "Approach >200 FW Prox": { weight: 0.70 }
      },
      "Putting": {
        "SG Putting": { weight: 1.0 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1.0 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.18 },
        "Scoring Average": { weight: 0.12 },
        "Birdie Chances Created": { weight: 0.10 },
        "Scoring: Approach <100 SG": { weight: 0.083 },
        "Scoring: Approach <150 FW SG": { weight: 0.298 },
        "Scoring: Approach <150 Rough SG": { weight: 0.298 },
        "Scoring: Approach <200 FW SG": { weight: 0.448 },
        "Scoring: Approach >200 FW SG": { weight: 0.056 },
        "Scoring: Approach >150 Rough SG": { weight: 0.056 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.12 },
        "Great Shots": { weight: 0.08 },
        "Poor Shots": { weight: 0.08 },
        "Course Management: Approach <100 Prox": { weight: 0.068 },
        "Course Management: Approach <150 FW Prox": { weight: 0.121 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.121 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.364 },
        "Course Management: Approach <200 FW Prox": { weight: 0.023 },
        "Course Management: Approach >200 FW Prox": { weight: 0.023 }
      }
    }
  },
  
  BALANCED: {
    name: "BALANCED",
    description: "Data-driven weights for balanced courses (Accuracy: 0.35, SG Approach: 0.56)",
    groupWeights: {
      "Driving Performance": 0.090,
      "Approach - Short (<100)": 0.148,
      "Approach - Mid (100-150)": 0.190,
      "Approach - Long (150-200)": 0.160,
      "Approach - Very Long (>200)": 0.035,
      "Putting": 0.115,
      "Around the Green": 0.100,
      "Scoring": 0.105,
      "Course Management": 0.057
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
        "Approach <150 FW GIR": { weight: 0.10 },
        "Approach <150 FW SG": { weight: 0.30 },
        "Approach <150 FW Prox": { weight: 0.60 },
        "Approach <150 Rough GIR": { weight: 0.10 },
        "Approach <150 Rough SG": { weight: 0.30 },
        "Approach <150 Rough Prox": { weight: 0.60 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.09 },
        "Approach <200 FW SG": { weight: 0.28 },
        "Approach <200 FW Prox": { weight: 0.63 },
        "Approach >150 Rough GIR": { weight: 0.09 },
        "Approach >150 Rough SG": { weight: 0.28 },
        "Approach >150 Rough Prox": { weight: 0.63 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.09 },
        "Approach >200 FW SG": { weight: 0.24 },
        "Approach >200 FW Prox": { weight: 0.67 }
      },
      "Putting": {
        "SG Putting": { weight: 1.0 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1.0 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.19 },
        "Scoring Average": { weight: 0.11 },
        "Birdie Chances Created": { weight: 0.10 },
        "Scoring: Approach <100 SG": { weight: 0.15 },
        "Scoring: Approach <150 FW SG": { weight: 0.15 },
        "Scoring: Approach <150 Rough SG": { weight: 0.15 },
        "Scoring: Approach <200 FW SG": { weight: 0.07 },
        "Scoring: Approach >200 FW SG": { weight: 0.03 },
        "Scoring: Approach >150 Rough SG": { weight: 0.05 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.12 },
        "Great Shots": { weight: 0.08 },
        "Poor Shots": { weight: 0.08 },
        "Course Management: Approach <100 Prox": { weight: 0.12 },
        "Course Management: Approach <150 FW Prox": { weight: 0.12 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.16 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.18 },
        "Course Management: Approach <200 FW Prox": { weight: 0.11 },
        "Course Management: Approach >200 FW Prox": { weight: 0.03 }
      }
    }
  },
  WAIALAE_COUNTRY_CLUB: {
    name: "WAIALAE_COUNTRY_CLUB",
    eventId: "6",
    description: "Sony Open 2026 Optimized: Data-driven from actual results (0.1066 correlation, 35% Top-20 accuracy, 5.7x improvement)",
    groupWeights: {
      "Driving Performance": 0.037,
      "Approach - Short (<100)": 0.090,
      "Approach - Mid (100-150)": 0.077,
      "Approach - Long (150-200)": 0.087,
      "Approach - Very Long (>200)": 0.116,
      "Putting": 0.252,
      "Around the Green": 0.156,
      "Scoring": 0.115,
      "Course Management": 0.070
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.271 },
        "Driving Accuracy": { weight: 0.011 },
        "SG OTT": { weight: 0.718 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.429 },
        "Approach <100 SG": { weight: 0.402 },
        "Approach <100 Prox": { weight: 0.168 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.125 },
        "Approach <150 FW SG": { weight: 0.216 },
        "Approach <150 FW Prox": { weight: 0.246 },
        "Approach <150 Rough GIR": { weight: 0.205 },
        "Approach <150 Rough SG": { weight: 0.008 },
        "Approach <150 Rough Prox": { weight: 0.200 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.177 },
        "Approach <200 FW SG": { weight: 0.148 },
        "Approach <200 FW Prox": { weight: 0.146 },
        "Approach >150 Rough GIR": { weight: 0.196 },
        "Approach >150 Rough SG": { weight: 0.211 },
        "Approach >150 Rough Prox": { weight: 0.269 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.061 },
        "Approach >200 FW SG": { weight: 0.388 },
        "Approach >200 FW Prox": { weight: 0.550 }
      },
      "Putting": {
        "SG Putting": { weight: 1.0 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1.0 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.115 },
        "Scoring Average": { weight: 0.150 },
        "Birdie Chances Created": { weight: 0.145 },
        "Scoring: Approach <100 SG": { weight: 0.117 },
        "Scoring: Approach <150 FW SG": { weight: 0.119 },
        "Scoring: Approach <150 Rough SG": { weight: 0.099 },
        "Scoring: Approach >150 Rough SG": { weight: 0.087 },
        "Scoring: Approach <200 FW SG": { weight: 0.107 },
        "Scoring: Approach >200 FW SG": { weight: 0.060 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.350 },
        "Great Shots": { weight: 0.215 },
        "Poor Shot Avoidance": { weight: 0.436 },
        "Course Management: Approach <100 Prox": { weight: 0.0 },
        "Course Management: Approach <150 FW Prox": { weight: 0.0 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.0 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.0 },
        "Course Management: Approach <200 FW Prox": { weight: 0.0 },
        "Course Management: Approach >200 FW Prox": { weight: 0.0 }
      }
    }
  }
};

module.exports = { WEIGHT_TEMPLATES };
