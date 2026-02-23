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
  PEBBLE_BEACH_GOLF_LINKS: {
    name: "PEBBLE_BEACH_GOLF_LINKS",
    eventId: "5",
    description: "Pebble Beach Pro-Am 2026 Optimized: 0.3047 corr, 50.0% Top-20, 53.4% Top-20 Weighted",
    groupWeights: {
      "Driving Performance": 0.10253232601257035,
      "Approach - Short (<100)": 0.1194177959871931,
      "Approach - Mid (100-150)": 0.19375312503916445,
      "Approach - Long (150-200)": 0.11283455022262502,
      "Approach - Very Long (>200)": 0.029830996955166857,
      "Putting": 0.09934284835069716,
      "Around the Green": 0.13318995424683816,
      "Scoring": 0.1521568461046561,
      "Course Management": 0.05694155708108894
    },
    metricWeights: {
      "Driving Performance": {
        "Driving Distance": { weight: 0.16519314628973553 },
        "Driving Accuracy": { weight: 0.41495245725416324 },
        "SG OTT": { weight: 0.4198543964561012 }
      },
      "Approach - Short (<100)": {
        "Approach <100 GIR": { weight: 0.07167125851986278 },
        "Approach <100 SG": { weight: 0.2977358675266523 },
        "Approach <100 Prox": { weight: 0.630592873953485 }
      },
      "Approach - Mid (100-150)": {
        "Approach <150 FW GIR": { weight: 0.06708734747394228 },
        "Approach <150 FW SG": { weight: 0.22250121842213122 },
        "Approach <150 FW Prox": { weight: 0.44512389317756607 },
        "Approach <150 Rough GIR": { weight: 0.06405885133956395 },
        "Approach <150 Rough SG": { weight: 0.20107751449134112 },
        "Approach <150 Rough Prox": { weight: -0.00015117509545549586 }
      },
      "Approach - Long (150-200)": {
        "Approach <200 FW GIR": { weight: 0.06108743854760371 },
        "Approach <200 FW SG": { weight: 0.17985027266788273 },
        "Approach <200 FW Prox": { weight: 0.47683240996839626 },
        "Approach >150 Rough GIR": { weight: 0.06608787603574998 },
        "Approach >150 Rough SG": { weight: 0.21598692436306388 },
        "Approach >150 Rough Prox": { weight: -0.00015507841730361856 }
      },
      "Approach - Very Long (>200)": {
        "Approach >200 FW GIR": { weight: 0.0675386398867802 },
        "Approach >200 FW SG": { weight: 0.25391418022988105 },
        "Approach >200 FW Prox": { weight: 0.6785471798833387 }
      },
      "Putting": {
        "SG Putting": { weight: 1 }
      },
      "Around the Green": {
        "SG Around Green": { weight: 1 }
      },
      "Scoring": {
        "SG T2G": { weight: 0.18450510196443498 },
        "Scoring Average": { weight: 0.19630805597599443 },
        "Birdie Chances Created": { weight: 0.04784940963206374 },
        "Scoring: Approach <100 SG": { weight: 0.05728197800506118 },
        "Scoring: Approach <150 FW SG": { weight: 0.08939371466950806 },
        "Scoring: Approach <150 Rough SG": { weight: 0.09228072687229313 },
        "Scoring: Approach <200 FW SG": { weight: 0.1856757452158533 },
        "Scoring: Approach >200 FW SG": { weight: 0.07140720714703559 },
        "Scoring: Approach >150 Rough SG": { weight: 0.07529806051775546 }
      },
      "Course Management": {
        "Scrambling": { weight: 0.4243083111011691 },
        "Great Shots": { weight: 0.16867554116207167 },
        "Poor Shot Avoidance": { weight: -0.07794848211446015 },
        "Course Management: Approach <100 Prox": { weight: 0.04525146102788264 },
        "Course Management: Approach <150 FW Prox": { weight: 0.07549007658011239 },
        "Course Management: Approach <150 Rough Prox": { weight: -0.00010419015793454041 },
        "Course Management: Approach >150 Rough Prox": { weight: -0.00010419015793454041 },
        "Course Management: Approach <200 FW Prox": { weight: 0.13943513462551332 },
        "Course Management: Approach >200 FW Prox": { weight: 0.07028763515918848 }
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

module.exports = { WEIGHT_TEMPLATES };
