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
        "Poor Shot Avoidance": { weight: 0.08 },
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
        "Poor Shot Avoidance": { weight: 0.08 },
        "Course Management: Approach <100 Prox": { weight: 0.12 },
        "Course Management: Approach <150 FW Prox": { weight: 0.12 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.16 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.18 },
        "Course Management: Approach <200 FW Prox": { weight: 0.11 },
        "Course Management: Approach >200 FW Prox": { weight: 0.03 }
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
        "Approach <150 FW Prox": { weight: 0.3100 },
        "Approach <150 Rough GIR": { weight: 0.0450 },
        "Approach <150 Rough SG": { weight: 0.1450 },
        "Approach <150 Rough Prox": { weight: 0.3100 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.0400 },
        "Approach <200 FW SG": { weight: 0.1350 },
        "Approach <200 FW Prox": { weight: 0.3250 },
        "Approach >150 Rough GIR": { weight: 0.0400 },
        "Approach >150 Rough SG": { weight: 0.1350 },
        "Approach >150 Rough Prox": { weight: 0.3250 }
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
        "Scoring: Approach <200 FW SG": { weight: 0.1546 },
        "Scoring: Approach >200 FW SG": { weight: 0.0727 },
        "Scoring: Approach >150 Rough SG": { weight: 0.0727 }
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
,
  TPC_SCOTTSDALE: {
    name: "TPC_SCOTTSDALE",
    eventId: "3",
    description: "WM Phoenix Open 2026 Optimized: 0.7135 corr, 20.9% Top-20, 22.1% Top-20 Weighted",
    groupWeights: {
      "Driving Performance": 0.13349056691108158,
      "Approach - Short (<100)": 0.09838635088272266,
      "Approach - Mid (100-150)": 0.18483309264611295,
      "Approach - Long (150-200)": 0.1540275772050941,
      "Approach - Very Long (>200)": 0.030805515441018824,
      "Putting": 0.14687852081231612,
      "Around the Green": 0.0821480411760502,
      "Scoring": 0.11295355661706902,
      "Course Management": 0.05647677830853451
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.40669612357611074 },
        "Driving Accuracy": { weight: 0.1186507779029766 },
        "SG OTT": { weight: 0.47465309852091264 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.15550429712109598 },
        "Approach <100 SG": { weight: 0.34824615979030477 },
        "Approach <100 Prox": { weight: -0.4962495430885992 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.0638987848840329 },
        "Approach <150 FW SG": { weight: 0.16523012063207532 },
        "Approach <150 FW Prox": { weight: -0.3060146130811398 },
        "Approach <150 Rough GIR": { weight: 0.05121078557587178 },
        "Approach <150 Rough SG": { weight: 0.17419415071991623 },
        "Approach <150 Rough Prox": { weight: -0.23945154510696393 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.05176139366766823 },
        "Approach <200 FW SG": { weight: 0.15295972845531236 },
        "Approach <200 FW Prox": { weight: -0.32219834698067523 },
        "Approach >150 Rough GIR": { weight: 0.05527551433515456 },
        "Approach >150 Rough SG": { weight: 0.15094218512288377 },
        "Approach >150 Rough Prox": { weight: -0.2668628314383058 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.08580567419451898 },
        "Approach >200 FW SG": { weight: 0.22808686394048258 },
        "Approach >200 FW Prox": { weight: -0.6861074618649984 }
      },
      "Putting": {
        "SG Putting": { weight: 1 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.197042734328472 },
        "Scoring Average": { weight: 0.11000989748253243 },
        "Birdie Chances Created": { weight: 0.09807616423601777 },
        "Scoring: Approach <100 SG": { weight: 0.13532282968779558 },
        "Scoring: Approach <150 FW SG": { weight: 0.1595981613485893 },
        "Scoring: Approach <150 Rough SG": { weight: 0.14764252453574372 },
        "Scoring: Approach <200 FW SG": { weight: 0.046356725304618034 },
        "Scoring: Approach >200 FW SG": { weight: 0.00009624527873559862 },
        "Scoring: Approach >150 Rough SG": { weight: 0.10585471779749546 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.134808639465603 },
        "Great Shots": { weight: 0.08962605440524794 },
        "Poor Shot Avoidance": { weight: 0.17180383115819398 },
        "Course Management: Approach <100 Prox": { weight: -0.08801613412355011 },
        "Course Management: Approach <150 FW Prox": { weight: -0.0991174460159916 },
        "Course Management: Approach <150 Rough Prox": { weight: -0.1436271598877703 },
        "Course Management: Approach >150 Rough Prox": { weight: -0.17931167000003448 },
        "Course Management: Approach <200 FW Prox": { weight: -0.1277083255033646 },
        "Course Management: Approach >200 FW Prox": { weight: -0.04598073944024408 }
      }
    }
  }};

module.exports = { WEIGHT_TEMPLATES };
