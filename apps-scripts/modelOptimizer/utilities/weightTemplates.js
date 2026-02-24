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
  ROYAL_PORTRUSH: {
    name: "ROYAL_PORTRUSH",
    eventId: "100",
    description: "Royal Portrush template based on long-iron emphasis and links setup",
    groupWeights: {
      "Driving Performance": 0.10,
      "Approach - Short (<100)": 0.05,
      "Approach - Mid (100-150)": 0.16,
      "Approach - Long (150-200)": 0.25,
      "Approach - Very Long (>200)": 0.22,
      "Putting": 0.12,
      "Around the Green": 0.06,
      "Scoring": 0.02,
      "Course Management": 0.02
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.2 },
        "Driving Accuracy": { weight: 0.35 },
        "SG OTT": { weight: 0.45 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.4 },
        "Approach <100 SG": { weight: 0.4 },
        "Approach <100 Prox": { weight: 0.2 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.2 },
        "Approach <150 FW SG": { weight: 0.2 },
        "Approach <150 FW Prox": { weight: 0.1 },
        "Approach <150 Rough GIR": { weight: 0.2 },
        "Approach <150 Rough SG": { weight: 0.2 },
        "Approach <150 Rough Prox": { weight: 0.1 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.2 },
        "Approach <200 FW SG": { weight: 0.2 },
        "Approach <200 FW Prox": { weight: 0.1 },
        "Approach >150 Rough GIR": { weight: 0.2 },
        "Approach >150 Rough SG": { weight: 0.2 },
        "Approach >150 Rough Prox": { weight: 0.1 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.4 },
        "Approach >200 FW SG": { weight: 0.4 },
        "Approach >200 FW Prox": { weight: 0.2 }
      },
      "Putting": {
        "SG Putting": { weight: 1.0 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1.0 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.0 },
        "Scoring Average": { weight: 0.25 },
        "Birdie Chances Created": { weight: 0.2 },
        "Scoring: Approach <100 SG": { weight: 0.1 },
        "Scoring: Approach <150 FW SG": { weight: 0.15 },
        "Scoring: Approach <150 Rough SG": { weight: 0.1 },
        "Scoring: Approach >150 Rough SG": { weight: 0.1 },
        "Scoring: Approach <200 FW SG": { weight: 0.05 },
        "Scoring: Approach >200 FW SG": { weight: 0.05 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.15 },
        "Great Shots": { weight: 0.15 },
        "Poor Shot Avoidance": { weight: 0.2 },
        "Course Management: Approach <100 Prox": { weight: 0.1 },
        "Course Management: Approach <150 FW Prox": { weight: 0.1 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.1 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.1 },
        "Course Management: Approach <200 FW Prox": { weight: 0.05 },
        "Course Management: Approach >200 FW Prox": { weight: 0.05 }
      }
    }
  },
  TPC_LOUISIANA: {
    name: "TPC_LOUISIANA",
    eventId: "18",
    description: "Zurich Classic template from provided raw metric weights",
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
        "Driving Distance": { weight: 0.35 },
        "Driving Accuracy": { weight: 0.3 },
        "SG OTT": { weight: 0.35 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.3 },
        "Approach <100 SG": { weight: 0.4 },
        "Approach <100 Prox": { weight: 0.3 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.3 },
        "Approach <150 FW SG": { weight: 0.45 },
        "Approach <150 FW Prox": { weight: 0.25 },
        "Approach <150 Rough GIR": { weight: 0.3 },
        "Approach <150 Rough SG": { weight: 0.45 },
        "Approach <150 Rough Prox": { weight: 0.25 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.3 },
        "Approach <200 FW SG": { weight: 0.45 },
        "Approach <200 FW Prox": { weight: 0.25 },
        "Approach >150 Rough GIR": { weight: 0.3 },
        "Approach >150 Rough SG": { weight: 0.45 },
        "Approach >150 Rough Prox": { weight: 0.25 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.3 },
        "Approach >200 FW SG": { weight: 0.45 },
        "Approach >200 FW Prox": { weight: 0.25 }
      },
      "Putting": {
        "SG Putting": { weight: 1.0 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1.0 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.0 },
        "Scoring Average": { weight: 0.15 },
        "Birdie Chances Created": { weight: 0.35 },
        "Scoring: Approach <100 SG": { weight: 0.07 },
        "Scoring: Approach <150 FW SG": { weight: 0.10 },
        "Scoring: Approach <150 Rough SG": { weight: 0.08 },
        "Scoring: Approach >150 Rough SG": { weight: 0.07 },
        "Scoring: Approach <200 FW SG": { weight: 0.10 },
        "Scoring: Approach >200 FW SG": { weight: 0.08 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.25 },
        "Great Shots": { weight: 0.15 },
        "Poor Shot Avoidance": { weight: 0.2 },
        "Course Management: Approach <100 Prox": { weight: 0.07 },
        "Course Management: Approach <150 FW Prox": { weight: 0.09 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.06 },
        "Course Management: Approach >150 Rough Prox": { weight: 0.05 },
        "Course Management: Approach <200 FW Prox": { weight: 0.08 },
        "Course Management: Approach >200 FW Prox": { weight: 0.05 }
      }
    }
  },
  PEBBLE_BEACH_GOLF_LINKS: {
    name: "PEBBLE_BEACH_GOLF_LINKS",
    eventId: "5",
    description: "ATT Pebble Beach 2026 Optimized: 0.2966 corr, 50.0% Top-20, 51.1% Top-20 Weighted",
    groupWeights: {
      "Driving Performance": 0.10674619569643001,
      "Approach - Short (<100)": 0.12432562408193541,
      "Approach - Mid (100-150)": 0.20171598369561888,
      "Approach - Long (150-200)": 0.11747182033016913,
      "Approach - Very Long (>200)": 0.03105699014772621,
      "Putting": 0.1034256370013901,
      "Around the Green": 0.09756582753955498,
      "Scoring": 0.1584101824516098,
      "Course Management": 0.059281739055565434
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.1803877236425231 },
        "Driving Accuracy": { weight: 0.3836054863808967 },
        "SG OTT": { weight: 0.43600678997658027 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.07853507225935451 },
        "Approach <100 SG": { weight: 0.2823498400385536 },
        "Approach <100 Prox": { weight: 0.6391150877020918 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.04632168767668801 },
        "Approach <150 FW SG": { weight: 0.15372497590082956 },
        "Approach <150 FW Prox": { weight: 0.307371857686299 },
        "Approach <150 Rough GIR": { weight: 0.037920236352637554 },
        "Approach <150 Rough SG": { weight: 0.14210773708127672 },
        "Approach <150 Rough Prox": { weight: -0.3125535053022692 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.038655797252677836 },
        "Approach <200 FW SG": { weight: 0.12936596994634195 },
        "Approach <200 FW Prox": { weight: 0.3527610670068222 },
        "Approach >150 Rough GIR": { weight: 0.03873127292748768 },
        "Approach >150 Rough SG": { weight: 0.14763354558278372 },
        "Approach >150 Rough Prox": { weight: -0.2928523472838866 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.07146206119774032 },
        "Approach >200 FW SG": { weight: 0.2521555010819336 },
        "Approach >200 FW Prox": { weight: 0.6763824377203261 }
      },
      "Putting": {
        "SG Putting": { weight: 1 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.21382267529343155 },
        "Scoring Average": { weight: 0.19034024965689933 },
        "Birdie Chances Created": { weight: 0.04401450236458315 },
        "Scoring: Approach <100 SG": { weight: 0.053793752612453456 },
        "Scoring: Approach <150 FW SG": { weight: 0.10173480452296041 },
        "Scoring: Approach <150 Rough SG": { weight: 0.08438109715216803 },
        "Scoring: Approach <200 FW SG": { weight: 0.176128696600687 },
        "Scoring: Approach >200 FW SG": { weight: 0.06915499237709209 },
        "Scoring: Approach >150 Rough SG": { weight: 0.06662922941972486 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.364441958178438 },
        "Great Shots": { weight: 0.14495792039380806 },
        "Poor Shot Avoidance": { weight: -0.15429194214265352 },
        "Course Management: Approach <100 Prox": { weight: 0.048415150468639735 },
        "Course Management: Approach <150 FW Prox": { weight: 0.07246081564708991 },
        "Course Management: Approach <150 Rough Prox": { weight: -0.08180176381823198 },
        "Course Management: Approach >150 Rough Prox": { weight: -0.0675769839244237 },
        "Course Management: Approach <200 FW Prox": { weight: 0.15442275194536878 },
        "Course Management: Approach >200 FW Prox": { weight: 0.06581459776665337 }
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
  },
  THE_RIVIERA_COUNTRY_CLUB: {
    name: "THE_RIVIERA_COUNTRY_CLUB",
    eventId: "7",
    description: "Genesis Invitational 2026 Optimized: 0.6418 corr, 65.0% Top-20, 72.4% Top-20 Weighted",
    groupWeights: {
      "Driving Performance": 0.14491401069595441,
      "Approach - Short (<100)": 0.14493255462515853,
      "Approach - Mid (100-150)": 0.14126346877427762,
      "Approach - Long (150-200)": 0.12318067661640782,
      "Approach - Very Long (>200)": 0.02998604578451556,
      "Putting": 0.17083720293014232,
      "Around the Green": 0.07996278875870816,
      "Scoring": 0.10994883454322371,
      "Course Management": 0.054974417271611856
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.5121256291951152 },
        "Driving Accuracy": { weight: 0.09293882047578655 },
        "SG OTT": { weight: 0.39493555032909816 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.2625572329653397 },
        "Approach <100 SG": { weight: 0.7372450888294415 },
        "Approach <100 Prox": { weight: 0.00019767820521883359 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.15936071336747104 },
        "Approach <150 FW SG": { weight: 0.3593671285754248 },
        "Approach <150 FW Prox": { weight: 0.00023697051816604892 },
        "Approach <150 Rough GIR": { weight: 0.15789928742890777 },
        "Approach <150 Rough SG": { weight: 0.3228989295918644 },
        "Approach <150 Rough Prox": { weight: 0.00023697051816604892 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.13142478679999592 },
        "Approach <200 FW SG": { weight: 0.388725559496779 },
        "Approach <200 FW Prox": { weight: 0.0002563771341928853 },
        "Approach >150 Rough GIR": { weight: 0.13380444612429132 },
        "Approach >150 Rough SG": { weight: 0.345532453310548 },
        "Approach >150 Rough Prox": { weight: -0.0002563771341928853 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.2197010793735438 },
        "Approach >200 FW SG": { weight: 0.7800361356526654 },
        "Approach >200 FW Prox": { weight: 0.0002627849737908229 }
      },
      "Putting": {
        "SG Putting": { weight: 1 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.23074569266537626 },
        "Scoring Average": { weight: 0.00010824312848986641 },
        "Birdie Chances Created": { weight: 0.0933274578156979 },
        "Scoring: Approach <100 SG": { weight: 0.17643055860134577 },
        "Scoring: Approach <150 FW SG": { weight: 0.1695485759178827 },
        "Scoring: Approach <150 Rough SG": { weight: 0.1537034966494277 },
        "Scoring: Approach <200 FW SG": { weight: 0.0614716273448912 },
        "Scoring: Approach >200 FW SG": { weight: 0.00010824312848986641 },
        "Scoring: Approach >150 Rough SG": { weight: 0.11455610474839885 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.3663343336024537 },
        "Great Shots": { weight: 0.3100090948394791 },
        "Poor Shot Avoidance": { weight: 0.2471999056539836 },
        "Course Management: Approach <100 Prox": { weight: 0.0003595081816616878 },
        "Course Management: Approach <150 FW Prox": { weight: 0.0003595081816616878 },
        "Course Management: Approach <150 Rough Prox": { weight: 0.0003595081816616878 },
        "Course Management: Approach >150 Rough Prox": { weight: -0.0003595081816616878 },
        "Course Management: Approach <200 FW Prox": { weight: 0.0003595081816616878 },
        "Course Management: Approach >200 FW Prox": { weight: 0.0003595081816616878 }
      }
    }
  }};

module.exports = { WEIGHT_TEMPLATES };
