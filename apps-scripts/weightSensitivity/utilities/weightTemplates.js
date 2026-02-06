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
      "Driving Performance::Driving Distance": 0.404,
      "Driving Performance::Driving Accuracy": 0.123,
      "Driving Performance::SG OTT": 0.472,
      
      "Approach - Short (<100)::Approach <100 GIR": 0.14,
      "Approach - Short (<100)::Approach <100 SG": 0.33,
      "Approach - Short (<100)::Approach <100 Prox": 0.53,
      
      "Approach - Mid (100-150)::Approach <150 FW GIR": 0.12,
      "Approach - Mid (100-150)::Approach <150 FW SG": 0.32,
      "Approach - Mid (100-150)::Approach <150 FW Prox": 0.56,
      "Approach - Mid (100-150)::Approach <150 Rough GIR": 0.12,
      "Approach - Mid (100-150)::Approach <150 Rough SG": 0.32,
      "Approach - Mid (100-150)::Approach <150 Rough Prox": 0.56,
      
      "Approach - Long (150-200)::Approach <200 FW GIR": 0.11,
      "Approach - Long (150-200)::Approach <200 FW SG": 0.30,
      "Approach - Long (150-200)::Approach <200 FW Prox": 0.59,
      "Approach - Long (150-200)::Approach >150 Rough GIR": 0.11,
      "Approach - Long (150-200)::Approach >150 Rough SG": 0.30,
      "Approach - Long (150-200)::Approach >150 Rough Prox": 0.59,
      
      "Approach - Very Long (>200)::Approach >200 FW GIR": 0.10,
      "Approach - Very Long (>200)::Approach >200 FW SG": 0.25,
      "Approach - Very Long (>200)::Approach >200 FW Prox": 0.65,
      
      "Putting::SG Putting": 1.0,
      "Around the Green::SG Around Green": 1.0,
      
      "Scoring::SG T2G": 0.20,
      "Scoring::Scoring Average": 0.10,
      "Scoring::Birdie Chances Created": 0.10,
      "Scoring::Scoring: Approach <100 SG": 0.15,
      "Scoring::Scoring: Approach <150 FW SG": 0.15,
      "Scoring::Scoring: Approach <150 Rough SG": 0.15,
      "Scoring::Scoring: Approach <200 FW SG": 0.05,
      "Scoring::Scoring: Approach >200 FW SG": 0.00,
      "Scoring::Scoring: Approach >150 Rough SG": 0.10,
      
      "Course Management::Scrambling": 0.12,
      "Course Management::Great Shots": 0.08,
      "Course Management::Poor Shots": 0.08,
      "Course Management::Course Management: Approach <100 Prox": 0.10,
      "Course Management::Course Management: Approach <150 FW Prox": 0.10,
      "Course Management::Course Management: Approach <150 Rough Prox": 0.15,
      "Course Management::Course Management: Approach >150 Rough Prox": 0.20,
      "Course Management::Course Management: Approach <200 FW Prox": 0.12,
      "Course Management::Course Management: Approach >200 FW Prox": 0.05
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
      "Driving Performance::Driving Distance": 0.086,
      "Driving Performance::Driving Accuracy": 0.354,
      "Driving Performance::SG OTT": 0.560,
      
      "Approach - Short (<100)::Approach <100 GIR": 0.09,
      "Approach - Short (<100)::Approach <100 SG": 0.32,
      "Approach - Short (<100)::Approach <100 Prox": 0.59,
      
      "Approach - Mid (100-150)::Approach <150 FW GIR": 0.09,
      "Approach - Mid (100-150)::Approach <150 FW SG": 0.29,
      "Approach - Mid (100-150)::Approach <150 FW Prox": 0.62,
      "Approach - Mid (100-150)::Approach <150 Rough GIR": 0.09,
      "Approach - Mid (100-150)::Approach <150 Rough SG": 0.29,
      "Approach - Mid (100-150)::Approach <150 Rough Prox": 0.62,
      
      "Approach - Long (150-200)::Approach <200 FW GIR": 0.08,
      "Approach - Long (150-200)::Approach <200 FW SG": 0.27,
      "Approach - Long (150-200)::Approach <200 FW Prox": 0.65,
      "Approach - Long (150-200)::Approach >150 Rough GIR": 0.08,
      "Approach - Long (150-200)::Approach >150 Rough SG": 0.27,
      "Approach - Long (150-200)::Approach >150 Rough Prox": 0.65,
      
      "Approach - Very Long (>200)::Approach >200 FW GIR": 0.08,
      "Approach - Very Long (>200)::Approach >200 FW SG": 0.22,
      "Approach - Very Long (>200)::Approach >200 FW Prox": 0.70,
      
      "Putting::SG Putting": 1.0,
      "Around the Green::SG Around Green": 1.0,
      
      "Scoring::SG T2G": 0.18,
      "Scoring::Scoring Average": 0.12,
      "Scoring::Birdie Chances Created": 0.10,
      "Scoring::Scoring: Approach <100 SG": 0.083,
      "Scoring::Scoring: Approach <150 FW SG": 0.298,
      "Scoring::Scoring: Approach <150 Rough SG": 0.298,
      "Scoring::Scoring: Approach <200 FW SG": 0.448,
      "Scoring::Scoring: Approach >200 FW SG": 0.056,
      "Scoring::Scoring: Approach >150 Rough SG": 0.056,
      
      "Course Management::Scrambling": 0.12,
      "Course Management::Great Shots": 0.08,
      "Course Management::Poor Shots": 0.08,
      "Course Management::Course Management: Approach <100 Prox": 0.068,
      "Course Management::Course Management: Approach <150 FW Prox": 0.121,
      "Course Management::Course Management: Approach <150 Rough Prox": 0.121,
      "Course Management::Course Management: Approach >150 Rough Prox": 0.364,
      "Course Management::Course Management: Approach <200 FW Prox": 0.023,
      "Course Management::Course Management: Approach >200 FW Prox": 0.023
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
      "Driving Performance::Driving Distance": 0.061,
      "Driving Performance::Driving Accuracy": 0.410,
      "Driving Performance::SG OTT": 0.529,
      
      "Approach - Short (<100)::Approach <100 GIR": 0.12,
      "Approach - Short (<100)::Approach <100 SG": 0.34,
      "Approach - Short (<100)::Approach <100 Prox": 0.54,
      
      "Approach - Mid (100-150)::Approach <150 FW GIR": 0.10,
      "Approach - Mid (100-150)::Approach <150 FW SG": 0.30,
      "Approach - Mid (100-150)::Approach <150 FW Prox": 0.60,
      "Approach - Mid (100-150)::Approach <150 Rough GIR": 0.10,
      "Approach - Mid (100-150)::Approach <150 Rough SG": 0.30,
      "Approach - Mid (100-150)::Approach <150 Rough Prox": 0.60,
      
      "Approach - Long (150-200)::Approach <200 FW GIR": 0.09,
      "Approach - Long (150-200)::Approach <200 FW SG": 0.28,
      "Approach - Long (150-200)::Approach <200 FW Prox": 0.63,
      "Approach - Long (150-200)::Approach >150 Rough GIR": 0.09,
      "Approach - Long (150-200)::Approach >150 Rough SG": 0.28,
      "Approach - Long (150-200)::Approach >150 Rough Prox": 0.63,
      
      "Approach - Very Long (>200)::Approach >200 FW GIR": 0.09,
      "Approach - Very Long (>200)::Approach >200 FW SG": 0.24,
      "Approach - Very Long (>200)::Approach >200 FW Prox": 0.67,
      
      "Putting::SG Putting": 1.0,
      "Around the Green::SG Around Green": 1.0,
      
      "Scoring::SG T2G": 0.19,
      "Scoring::Scoring Average": 0.11,
      "Scoring::Birdie Chances Created": 0.10,
      "Scoring::Scoring: Approach <100 SG": 0.15,
      "Scoring::Scoring: Approach <150 FW SG": 0.15,
      "Scoring::Scoring: Approach <150 Rough SG": 0.15,
      "Scoring::Scoring: Approach <200 FW SG": 0.07,
      "Scoring::Scoring: Approach >200 FW SG": 0.03,
      "Scoring::Scoring: Approach >150 Rough SG": 0.05,
      
      "Course Management::Scrambling": 0.12,
      "Course Management::Great Shots": 0.08,
      "Course Management::Poor Shots": 0.08,
      "Course Management::Course Management: Approach <100 Prox": 0.12,
      "Course Management::Course Management: Approach <150 FW Prox": 0.12,
      "Course Management::Course Management: Approach <150 Rough Prox": 0.16,
      "Course Management::Course Management: Approach >150 Rough Prox": 0.18,
      "Course Management::Course Management: Approach <200 FW Prox": 0.11,
      "Course Management::Course Management: Approach >200 FW Prox": 0.03
    }
  }
};

module.exports = { WEIGHT_TEMPLATES };
