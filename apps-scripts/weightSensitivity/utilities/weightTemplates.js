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
    description: "Sony Open 2026 Optimized: 0.5390 corr, 14.5% Top-20, 12.1% Top-20 Weighted",
    groupWeights: {
      "Driving Performance": 0.1344253113378687,
      "Approach - Short (<100)": 0.12062858707382042,
      "Approach - Mid (100-150)": 0.18612735416012588,
      "Approach - Long (150-200)": 0.15510612846677155,
      "Approach - Very Long (>200)": 0.03102122569335431,
      "Putting": 0.13472259926569316,
      "Around the Green": 0.06735205268891725,
      "Scoring": 0.11374449420896582,
      "Course Management": 0.05687224710448291
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.4503554789091777 },
        "Driving Accuracy": { weight: 0.13111108343429 },
        "SG OTT": { weight: 0.41853343765653234 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.13669524419840726 },
        "Approach <100 SG": { weight: 0.3132972620533951 },
        "Approach <100 Prox": { weight: -0.5500074937481977 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.06352316319510953 },
        "Approach <150 FW SG": { weight: 0.1574664299401706 },
        "Approach <150 FW Prox": { weight: -0.262143237719928 },
        "Approach <150 Rough GIR": { weight: 0.06060928322069065 },
        "Approach <150 Rough SG": { weight: 0.13960772596175686 },
        "Approach <150 Rough Prox": { weight: -0.3166501599623444 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.055844639613191936 },
        "Approach <200 FW SG": { weight: 0.17812656046818184 },
        "Approach <200 FW Prox": { weight: -0.26454245653528874 },
        "Approach >150 Rough GIR": { weight: 0.05444911873219939 },
        "Approach >150 Rough SG": { weight: 0.1440464653910694 },
        "Approach >150 Rough Prox": { weight: -0.30299075926006874 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.11103947259049146 },
        "Approach >200 FW SG": { weight: 0.2631480637541838 },
        "Approach >200 FW Prox": { weight: -0.6258124636553247 }
      },
      "Putting": {
        "SG Putting": { weight: 1 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.2108284466352304 },
        "Scoring Average": { weight: -0.10106158720394683 },
        "Birdie Chances Created": { weight: 0.08854426618500005 },
        "Scoring: Approach <100 SG": { weight: 0.1675003436936131 },
        "Scoring: Approach <150 FW SG": { weight: 0.13375446218087048 },
        "Scoring: Approach <150 Rough SG": { weight: 0.16495979029381327 },
        "Scoring: Approach <200 FW SG": { weight: 0.0474116259561093 },
        "Scoring: Approach >200 FW SG": { weight: 0.00010096537005757082 },
        "Scoring: Approach >150 Rough SG": { weight: 0.08583851248135904 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.10518851881432498 },
        "Great Shots": { weight: 0.0922251014717156 },
        "Poor Shot Avoidance": { weight: -0.08471882371138874 },
        "Course Management: Approach <100 Prox": { weight: -0.09714000714002521 },
        "Course Management: Approach <150 FW Prox": { weight: -0.096865241590582 },
        "Course Management: Approach <150 Rough Prox": { weight: -0.15163014772255434 },
        "Course Management: Approach >150 Rough Prox": { weight: -0.18529199830971677 },
        "Course Management: Approach <200 FW Prox": { weight: -0.13365844556099854 },
        "Course Management: Approach >200 FW Prox": { weight: -0.05328171567869391 }
      }
    }
  }
};

module.exports = { WEIGHT_TEMPLATES };
