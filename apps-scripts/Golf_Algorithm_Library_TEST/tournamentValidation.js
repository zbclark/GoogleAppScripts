/**
 * Analyze and write metric correlations for a single tournament spreadsheet.
 * @param {Spreadsheet} ss - The tournament spreadsheet object.
 * @param {Object} options - Optional: { sheetName, courseType, ... }
 */
function analyzeSingleTournamentMetrics(ss, options = {}) {
    console.log("Starting analyzeSingleTournamentMetrics...");
    console.log("Spreadsheet name:", ss.getName());
    console.log("Options provided:", options);

    try {
        // Define all metrics
        console.log("Defining metrics...");
        const allMetrics = [
            "Driving Distance", "Driving Accuracy", "SG OTT", "Approach <100 GIR", "Approach <100 SG", "Approach <100 Prox",
            "Approach <150 FW GIR", "Approach <150 FW SG", "Approach <150 FW Prox", "Approach <200 FW GIR", "Approach <200 FW SG", "Approach <200 FW Prox",
            "Approach >200 FW GIR", "Approach >200 FW SG", "Approach >200 FW Prox", "SG Putting", "SG Around Green", "SG T2G",
            "Scoring Average", "Birdie Chances Created", "Approach <100 SG", "Approach <150 FW SG", "Approach <150 Rough SG",
            "Approach >150 Rough SG", "Approach <200 FW SG", "Approach >200 FW SG", "Scrambling", "Great Shots", "Poor Shot Avoidance",
            "Approach <100 Prox", "Approach <150 FW Prox", "Approach <150 Rough Prox", "Approach >150 Rough Prox", "Approach <200 FW Prox", "Approach >200 FW Prox"
        ];
        console.log("Metrics defined:", allMetrics);

        // Get actual results
        console.log("Fetching Tournament Results sheet...");
        const resultsSheet = ss.getSheetByName("Tournament Results");
        if (!resultsSheet) throw new Error("No Tournament Results sheet found");
        const resultsData = resultsSheet.getDataRange().getValues();
        console.log("Results data fetched. Rows:", resultsData.length);
        if (resultsData.length <= 5) throw new Error("Not enough rows in Tournament Results");
        const headerRow = resultsData[4];
        console.log("Header row:", headerRow);
        const headerMap = {};
        headerRow.forEach((header, idx) => { if (header) headerMap[header.toString().trim()] = idx; });
        console.log("Header map:", headerMap);
        const dgIdIdx = headerMap['DG ID'];
        const positionIdx = headerMap['Finish Position'];
        if (dgIdIdx === undefined || positionIdx === undefined) throw new Error("Missing DG ID or Finish Position column");

        // Calculate RMSE for each metric (if possible)
        console.log("Calculating RMSE for metrics...");
        let rmseByMetric = {};
        if (resultsData.length > 5) {
            const headerRowLower = resultsData[4].map(h => String(h || '').toLowerCase().trim());
            allMetrics.forEach(metric => {
                let actualIdx = -1, modelIdx = -1;
                for (let i = 0; i < headerRowLower.length; i++) {
                    if (headerRowLower[i] === metric.toLowerCase()) actualIdx = i;
                    if (headerRowLower[i] === (metric.toLowerCase() + ' - model')) modelIdx = i;
                }
                if (actualIdx !== -1 && modelIdx !== -1) {
                    const predicted = [], actual = [];
                    for (let i = 5; i < resultsData.length; i++) {
                        const pred = parseFloat(resultsData[i][modelIdx]);
                        const act = parseFloat(resultsData[i][actualIdx]);
                        if (!isNaN(pred) && !isNaN(act)) {
                            predicted.push(pred);
                            actual.push(act);
                        }
                    }
                    if (predicted.length > 0 && actual.length > 0) {
                        rmseByMetric[metric] = calculateRMSE(predicted, actual);
                        console.log(`RMSE for ${metric}:`, rmseByMetric[metric]);
                    }
                }
            });
        }

        // Collect finishers
        console.log("Collecting tournament finishers...");
        let tournamentFinishers = [];
        for (let i = 5; i < Math.min(resultsData.length, 500); i++) {
            const row = resultsData[i];
            if (!row || row.length === 0) continue;
            const dgId = row[dgIdIdx];
            const position = row[positionIdx];
            if (!dgId) continue;
            let pos = null;
            if (typeof position === 'number') pos = position;
            else if (typeof position === 'string') {
                const posStr = position.toString().trim().toUpperCase();
                if (posStr.startsWith('T')) pos = parseInt(posStr.substring(1));
                else if (posStr === 'CUT' || posStr === 'WD' || posStr === '') continue;
                else pos = parseInt(posStr);
            }
            if (pos === null || isNaN(pos) || pos <= 0) continue;
            tournamentFinishers.push({ dgId: dgId, position: pos, metrics: {} });
        }
        console.log("Tournament finishers collected. Count:", tournamentFinishers.length);
        if (tournamentFinishers.length < 5) throw new Error("Not enough valid finishers");

        // Get player stats
        console.log("Fetching Player Ranking Model sheet...");
        const playerStatsSheet = ss.getSheetByName("Player Ranking Model");
        if (!playerStatsSheet) throw new Error("No Player Ranking Model sheet found");
        const playerData = playerStatsSheet.getDataRange().getValues();
        console.log("Player data fetched. Rows:", playerData.length);
        if (playerData.length <= 5) throw new Error("Player data too short");
        const playerHeaderRow = playerData[4];
        console.log("Player header row:", playerHeaderRow);
        const playerHeaderMap = {};
        playerHeaderRow.forEach((header, idx) => { if (header) playerHeaderMap[header.toString().trim()] = idx; });
        console.log("Player header map:", playerHeaderMap);
        if (playerHeaderMap['DG ID'] === undefined) throw new Error("DG ID column not found in Player Ranking Model");

        // Map player DG IDs to their metrics
        console.log("Mapping player DG IDs to metrics...");
        const playerMetricsMap = new Map();
        for (let i = 5; i < playerData.length; i++) {
            const row = playerData[i];
            if (!row || row.length === 0) continue;
            const dgId = row[playerHeaderMap['DG ID']];
            if (!dgId) continue;
            const playerMetrics = {};
            allMetrics.forEach(metric => {
                const colIdx = playerHeaderMap[metric];
                if (colIdx !== undefined) {
                    const value = row[colIdx];
                    playerMetrics[metric] = parseFloat(value) || 0;
                }
            });
            playerMetricsMap.set(dgId.toString(), playerMetrics);
        }
        if (playerMetricsMap.size === 0) {
            throw new Error("No player metric data found");
        }

        // Match finishers with their metrics
        let matchedCount = 0;
        tournamentFinishers.forEach(finisher => {
            const metrics = playerMetricsMap.get(finisher.dgId.toString());
            if (metrics) {
                finisher.metrics = metrics;
                matchedCount++;
            }
        });
        if (matchedCount < 3) throw new Error("Insufficient matched finishers");

        // Calculate per-tournament metric correlations
        let tournamentMetrics = {};
        allMetrics.forEach(metric => {
            tournamentMetrics[metric] = { metric: metric, values: [] };
        });
        tournamentFinishers.forEach(finisher => {
            allMetrics.forEach(metric => {
                const value = finisher.metrics[metric];
                if (value !== undefined && !isNaN(value)) {
                    const isTop10 = finisher.position <= 10;
                    tournamentMetrics[metric].values.push({ position: finisher.position, value: value, isTop10: isTop10 });
                }
            });
        });

        // Calculate averages, deltas, and correlations
        allMetrics.forEach(metric => {
            const data = tournamentMetrics[metric];
            if (data.values.length >= 5) {
                const top10Values = data.values.filter(v => v.isTop10);
                const allValues = data.values;
                data.avgForTop10 = top10Values.length > 0 ? top10Values.reduce((sum, v) => sum + v.value, 0) / top10Values.length : 0;
                data.avgForField = allValues.length > 0 ? allValues.reduce((sum, v) => sum + v.value, 0) / allValues.length : 0;
                data.deltaTop10VsField = data.avgForTop10 - data.avgForField;
                data.countTop10 = top10Values.length;
                data.countField = allValues.length;
                const positions = data.values.map(v => v.position);
                const values = data.values.map(v => v.value);
                data.correlation = (positions.length > 2) ? calculatePearsonCorrelation(positions, values) : 0;
            }
        });

        // Build breakdown for this tournament
        const top10Finishers = tournamentFinishers.filter(f => f.position <= 10);
        let breakdown = {
            name: options.sheetName || ss.getName(),
            totalFinishers: tournamentFinishers.length,
            top10Count: top10Finishers.length,
            metricAverages: {},
            topMetrics: []
        };
        allMetrics.forEach(metric => {
            const data = tournamentMetrics[metric];
            breakdown.metricAverages[metric] = {
                top10Avg: data.avgForTop10 || 0,
                fieldAvg: data.avgForField || 0,
                delta: (data.avgForTop10 || 0) - (data.avgForField || 0),
                correlation: data.correlation || 0
            };
        });
        breakdown.topMetrics = Object.values(tournamentMetrics)
            .filter(m => m.values.length >= 5)
            .sort((a, b) => Math.abs(b.deltaTop10VsField) - Math.abs(a.deltaTop10VsField))
            .slice(0, 10);

        // Write the analysis sheet for this tournament
        createTournamentMetricSheet(ss, breakdown, tournamentMetrics, options.courseType || "BALANCED", rmseByMetric);
    } catch (error) {
        console.error("Error in analyzeSingleTournamentMetrics:", error);
        throw error;
    }
}

/**
 * Create a metric analysis sheet for a single tournament.
 * @param {Spreadsheet} ss
 * @param {Object} breakdown
 * @param {Object} tournamentMetrics
 * @param {string} courseType
 * @param {Object} rmseByMetric
 */
function createTournamentMetricSheet(ss, breakdown, tournamentMetrics, courseType, rmseByMetric) {
    const sheetName = `${breakdown.name}_Metric Validation`.substring(0, 49);
    const sheet = ss.insertSheet(sheetName);
    sheet.appendRow([`${breakdown.name} - Metric Analysis (${courseType} Course)`]);
    sheet.getRange(1, 1).setFontWeight("bold").setFontSize(12);
    sheet.appendRow([`Top 10: ${breakdown.top10Count} | Total Finishers: ${breakdown.totalFinishers}`]);
    sheet.appendRow([" "]);
    sheet.appendRow([
        "Metric", "Top 10 Avg", "Field Avg", "Delta", "% Above Field", "Correlation", "RMSE"
    ]);
    const headerRange = sheet.getRange(4, 1, 1, 7);
    headerRange.setBackground("#70AD47").setFontColor("white").setFontWeight("bold");
    // Add all metrics sorted by % above field (descending by absolute percentage)
    const sortedMetrics = Object.keys(breakdown.metricAverages)
        .map(metric => ({ metric, ...breakdown.metricAverages[metric] }))
        .filter(m => m.delta !== undefined && m.fieldAvg !== 0)
        .sort((a, b) => {
            // Exact sort order as specified - group by distance threshold, then by metric type within each threshold
            const sortOrder = [
                "Driving Distance",
                "Driving Accuracy",
                "SG OTT",
                "Approach <100 GIR",
                "Approach <100 SG",
                "Approach <100 Prox",
                "Approach <150 FW GIR",
                "Approach <150 FW SG",
                "Approach <150 FW Prox",
                "Approach <200 FW GIR",
                "Approach <200 FW SG",
                "Approach <200 FW Prox",
                "Approach >200 FW GIR",
                "Approach >200 FW SG",
                "Approach >200 FW Prox",
                "SG Putting",
                "SG Around Green",
                "SG T2G",
                "Scoring Average",
                "Birdie Chances Created",
                "Approach <100 SG",
                "Approach <150 FW SG",
                "Approach <150 Rough SG",
                "Approach >150 Rough SG",
                "Approach <200 FW SG",
                "Approach >200 FW SG",
                "Scrambling",
                "Great Shots",
                "Poor Shot Avoidance",
                "Approach <100 Prox",
                "Approach <150 FW Prox",
                "Approach <150 Rough Prox",
                "Approach >150 Rough Prox",
                "Approach <200 FW Prox",
                "Approach >200 FW Prox"
            ];

            // Find best matching index - check for exact match first, then partial
            const findBestMatch = (metricName) => {
                const metricLower = metricName.toLowerCase();

                for (let i = 0; i < sortOrder.length; i++) {
                    const sortKeyLower = sortOrder[i].toLowerCase();
                    // Exact match (highest priority)
                    if (metricLower === sortKeyLower) {
                        return i;
                    }
                }

                // Partial match - metricLower contains sortKey
                let bestIndex = sortOrder.length;
                let bestLength = 0;

                for (let i = 0; i < sortOrder.length; i++) {
                    const sortKeyLower = sortOrder[i].toLowerCase();
                    if (metricLower.includes(sortKeyLower)) {
                        if (sortKeyLower.length > bestLength) {
                            bestIndex = i;
                            bestLength = sortKeyLower.length;
                        }
                    }
                }

                return bestIndex;
            };

            const indexA = findBestMatch(a.metric);
            const indexB = findBestMatch(b.metric);

            return indexA - indexB;
        });
    

    // Calculate recommended weights based on correlation strength within each group
    // Group metrics and find max correlation per group
    const metricGroups = getMetricGroupings();
    const groupMaxCorrelations = {};

    // Find max correlation by group
    for (const [groupName, metrics] of Object.entries(metricGroups)) {
        let maxCorrelation = 0;
        for (const metricName of metrics) {
            const metricData = breakdown.metricAverages[metricName];
            if (metricData) {
                const absCorr = Math.abs(metricData.correlation || 0);
                if (absCorr > maxCorrelation) {
                    maxCorrelation = absCorr;
                }
            }
        }
        groupMaxCorrelations[groupName] = maxCorrelation;
    }

    sortedMetrics.forEach((m, idx) => {
        // Calculate percentage with special handling for lower-is-better metrics
        let pct = "N/A";
        if (m.fieldAvg !== 0) {
            const metricNameLower = m.metric.toLowerCase();
            const isLowerBetter = metricNameLower.includes("proximity") || 
                                 metricNameLower.includes("scoring") || 
                                 metricNameLower.includes("poor shot");
            
            if (isLowerBetter) {
                // For Proximity, Scoring Average, and Poor Shots (lower is better):
                // Flip sign if top10 is actually better (lower values = improvement = positive %)
                let adjustedDelta = m.delta;
                if (m.top10Avg < m.fieldAvg) {
                    // Top 10 is better (lower values), show as positive improvement
                    adjustedDelta = Math.abs(m.delta);
                } else if (m.top10Avg > m.fieldAvg) {
                    // Top 10 is worse (higher values), show as negative decline
                    adjustedDelta = -Math.abs(m.delta);
                }
                pct = ((adjustedDelta / Math.abs(m.fieldAvg)) * 100).toFixed(1);
            } else {
                // For all other metrics (higher is better): natural calculation
                // Positive delta = improvement, negative delta = decline
                pct = ((m.delta / m.fieldAvg) * 100).toFixed(1);
            }
        }

        const correlation = m.correlation !== undefined ? m.correlation : 0;
        const templateWeight = determineTournamentWeights(group);
       
        // Define groupName and metricName before calling determineTournamentWeights
        const groupName = getMetricGroup(m.metric);
        const metricName = m.metric;

        // Fetch weights for the specific metric
        const metricWeights = determineTournamentWeights(groupName, metricName);
        console.log(`Weights for ${m.metric}:`, metricWeights);

        // Loop through all weights for the metric
        for (const [key, weight] of Object.entries(metricWeights)) {
            console.log(`  Sub-metric: ${key}, Weight: ${weight}`);
            // Perform operations on each weight if needed
        }

        // Calculate recommended weight based on correlation strength within the metric's group
        // Formula: templateWeight * (metricCorrelation / maxCorrelationInGroup)
        let recommendedWeight = 0;
        const metricGroup = getMetricGroup(m.metric);
        if (metricGroup && groupMaxCorrelations[metricGroup] > 0) {
            const maxCorr = groupMaxCorrelations[metricGroup];
            const correlationRatio = Math.abs(correlation) / maxCorr;
            recommendedWeight = templateWeight * correlationRatio;
        }

        // Log the calculated recommended weight
        console.log("Recommended weight calculated:", recommendedWeight);

        // Find matching config weight for this metric
        // Try exact match first, then fuzzy matching
        const configWeights = getTournamentConfigurationWeights(ss);
        let configWeight = configWeights[m.metric] || 0;

        if (configWeight === 0) {
            // Try partial matches if exact match didn't work
            const metricLower = m.metric.toLowerCase();
            for (const [configMetric, weight] of Object.entries(configWeights)) {
                if (weight > 0) {  // Only consider non-zero weights
                    const configLower = configMetric.toLowerCase();
                    if (metricLower.includes(configLower) || configLower.includes(metricLower)) {
                        configWeight = weight;
                        console.log(`  Matched "${m.metric}" to config metric "${configMetric}" = ${weight}`);
                        break;
                    }
                }
            }
        }

        if (configWeight > 0) {
            console.log(`  ${m.metric}: configWeight = ${configWeight}`);
        }

        // Always show Template Weight and Recommended Weight for all metrics
        const templateWeightValue = templateWeight.toFixed(4);
        const recommendedWeightValue = recommendedWeight.toFixed(4);

        sheet.appendRow([
            m.metric,
            m.top10Avg.toFixed(3),
            m.fieldAvg.toFixed(3),
            m.delta.toFixed(3),
            pct + "%",
            correlation.toFixed(4),
            configWeight.toFixed(4),
            templateWeightValue,
            recommendedWeightValue
        ]);

        const rowIdx = idx + 5;
        const absDelta = Math.abs(m.delta);
        if (absDelta > 0.5) {
            sheet.getRange(rowIdx, 4).setBackground("#90EE90");
        } else if (absDelta > 0.2) {
            sheet.getRange(rowIdx, 4).setBackground("#FFFFE0");
        }
    });
    
    // ========== PLAYER ACCURACY DATA SECTION (DELTAS) ==========
    // Add spacing and header
    const metricsEndRow = sheet.getLastRow();
    sheet.appendRow([" "]);
    sheet.appendRow(["PLAYER-LEVEL ACCURACY ANALYSIS"]);
    sheet.getRange(metricsEndRow + 2, 1).setFontWeight("bold").setFontSize(11).setBackground("#e5e7eb");
    
    // Load tournament file with actual results and model data
    const tournamentFile = tournamentFiles[tournament.name];
    if (tournamentFile) {
        try {
            const tournamendSs = SpreadsheetApp.open(tournamentFile);
            const resultsSheet = tournamendSs.getSheetByName("Tournament Results");
            
            if (resultsSheet) {
                // Read Tournament Results to get player data with model and actual values
                const resultsRange = resultsSheet.getDataRange();
                const resultsData = resultsRange.getValues();
                
                // Map column headers to indices
                let colMap = {};
                const headerRow = resultsData[4]; // Row 5 (index 4) contains headers
                
                headerRow.forEach((header, idx) => {
                    const h = String(header || "").toLowerCase().trim();
                    if (h === "dg id") colMap.dgId = idx;
                    if (h === "player name") colMap.name = idx;
                    if (h === "model rank") colMap.modelRank = idx;
                    if (h === "finish position") colMap.finishPos = idx;
                    
                    // Actual metric values
                    if (h === "sg total") colMap.sgTotal = idx;
                    if (h === "driving distance") colMap.drivDist = idx;
                    if (h === "driving accuracy") colMap.drivAcc = idx;
                    if (h === "sg t2g") colMap.sgT2G = idx;
                    if (h === "sg approach") colMap.sgApproach = idx;
                    if (h === "sg around green") colMap.sgAroundGreen = idx;
                    if (h === "sg ott") colMap.sgOTT = idx;
                    if (h === "sg putting") colMap.sgPutting = idx;
                    if (h === "greens in regulation") colMap.gir = idx;
                    if (h === "fairway proximity") {
                        colMap.fairwayProx = idx;
                        console.log(`✓ Found Fairway Proximity at column ${idx}`);
                    }
                    if (h === "rough proximity") {
                        colMap.roughProx = idx;
                        console.log(`✓ Found Rough Proximity at column ${idx}`);
                    }
                    
                    // Model metric values
                    if (h === "sg total - model") colMap.sgTotalModel = idx;
                    if (h === "driving distance - model") colMap.drivDistModel = idx;
                    if (h === "driving accuracy - model") colMap.drivAccModel = idx;
                    if (h === "sg t2g - model") colMap.sgT2GModel = idx;
                    if (h === "sg approach - model") colMap.sgApproachModel = idx;
                    if (h === "sg around green - model") colMap.sgAroundGreenModel = idx;
                    if (h === "sg ott - model") colMap.sgOTTModel = idx;
                    if (h === "sg putting - model") colMap.sgPuttingModel = idx;
                    if (h === "greens in regulation - model") colMap.girModel = idx;
                    if (h === "fairway proximity - model") {
                        colMap.fairwayProxModel = idx;
                        console.log(`✓ Found Fairway Proximity - Model at column ${idx}`);
                    }
                    if (h === "rough proximity - model") {
                        colMap.roughProxModel = idx;
                        console.log(`✓ Found Rough Proximity - Model at column ${idx}`);
                    }
                });
                
                // Log all found columns
                console.log("Full colMap:", colMap);
                console.log("Total columns in data:", headerRow.length);
                console.log("Column headers around Y-AB:", headerRow.slice(24, 28));
                
                // Parse player data
                const playerDataWithDeltas = [];
                for (let i = 5; i < resultsData.length; i++) {
                    const row = resultsData[i];
                    const dgId = String(row[colMap.dgId] || "").trim();
                    const name = String(row[colMap.name] || "").trim();
                    
                    if (!dgId) break;
                    
                    const modelRank = parseInt(row[colMap.modelRank]) || 999;
                    const finishStr = String(row[colMap.finishPos] || "").trim();
                    let finishPos = 999;
                    if (!isNaN(parseInt(finishStr))) {
                        finishPos = parseInt(finishStr);
                    } else if (finishStr.includes("T")) {
                        finishPos = parseInt(finishStr.replace("T", "")) || 999;
                    }
                    
                    if (finishPos === 999) continue; // Skip non-finishers
                    
                    // Calculate deltas for all metrics (Model - Actual)
                    const statDeltas = {
                        "SG Total": (parseFloat(row[colMap.sgTotalModel]) || 0) - (parseFloat(row[colMap.sgTotal]) || 0),
                        "Driving Distance": (parseFloat(row[colMap.drivDistModel]) || 0) - (parseFloat(row[colMap.drivDist]) || 0),
                        "Driving Accuracy": (parseFloat(row[colMap.drivAccModel]) || 0) - (parseFloat(row[colMap.drivAcc]) || 0),
                        "SG T2G": (parseFloat(row[colMap.sgT2GModel]) || 0) - (parseFloat(row[colMap.sgT2G]) || 0),
                        "SG Approach": (parseFloat(row[colMap.sgApproachModel]) || 0) - (parseFloat(row[colMap.sgApproach]) || 0),
                        "SG Around Green": (parseFloat(row[colMap.sgAroundGreenModel]) || 0) - (parseFloat(row[colMap.sgAroundGreen]) || 0),
                        "SG OTT": (parseFloat(row[colMap.sgOTTModel]) || 0) - (parseFloat(row[colMap.sgOTT]) || 0),
                        "SG Putting": (parseFloat(row[colMap.sgPuttingModel]) || 0) - (parseFloat(row[colMap.sgPutting]) || 0),
                        "GIR": (parseFloat(row[colMap.girModel]) || 0) - (parseFloat(row[colMap.gir]) || 0),
                        "Fairway Proximity": (parseFloat(row[colMap.fairwayProxModel]) || 0) - (parseFloat(row[colMap.fairwayProx]) || 0),
                        "Rough Proximity": (parseFloat(row[colMap.roughProxModel]) || 0) - (parseFloat(row[colMap.roughProx]) || 0)
                    };
                    
                    playerDataWithDeltas.push({
                        name: name,
                        dgId: dgId,
                        modelRank: modelRank,
                        finishPos: finishPos,
                        finishText: finishStr,
                        statDeltas: statDeltas
                    });
                }
                
                if (playerDataWithDeltas.length > 0) {
                    // Sort by model rank ascending (low to high)
                    playerDataWithDeltas.sort((a, b) => a.modelRank - b.modelRank);
                    
                    // Build header row
                    const deltaMetrics = [
                        "SG Total Δ", "Driving Distance Δ", "Driving Accuracy Δ",
                        "SG T2G Δ", "SG Approach Δ", "SG Around Green Δ",
                        "SG OTT Δ", "SG Putting Δ", "GIR Δ",
                        "Fairway Proximity Δ", "Rough Proximity Δ"
                    ];
                    
                    const playerHeaderRow = ["Player", "Model Rank", "Finish Pos", "Miss Score", "Gap Analysis", ...deltaMetrics];
                    sheet.appendRow(playerHeaderRow);
                    
                    const playerDataHeaderRow = sheet.getLastRow();
                    sheet.getRange(playerDataHeaderRow, 1, 1, playerHeaderRow.length)
                        .setFontWeight("bold")
                        .setBackground("#1f2937")
                        .setFontColor("white");
                    
                    // Add each player's data
                    playerDataWithDeltas.forEach((player, idx) => {
                        // Calculate Miss Score and Gap Analysis
                        const missScore = player.modelRank - player.finishPos;
                        let gapAnalysis = "";
                        if (missScore === 0) {
                            gapAnalysis = "Perfect";
                        } else if (missScore > 0) {
                            gapAnalysis = `Predicted ${missScore} spots too high`;
                        } else {
                            gapAnalysis = `Predicted ${Math.abs(missScore)} spots too low`;
                        }
                        
                        const rowData = [
                            player.name,
                            player.modelRank,
                            player.finishText,
                            missScore,
                            gapAnalysis
                        ];
                        
                        // Debug: Log metrics
                        if (idx === 0) {
                            console.log("statDeltas keys:", Object.keys(player.statDeltas));
                        }
                        
                        // Add delta values for this player
                        deltaMetrics.forEach(deltaKey => {
                            const metricKey = deltaKey.replace(" Δ", "");
                            const delta = player.statDeltas[metricKey];
                            
                            // Debug first player
                            if (idx === 0) {
                                console.log(`  ${metricKey}: delta=${delta}`);
                            }
                            
                            // Format based on metric type
                            if (metricKey.includes("Distance") || metricKey === "Scoring Average") {
                                rowData.push(delta !== undefined ? delta.toFixed(0) : "");
                            } else if (metricKey === "Driving Accuracy" || metricKey.includes("Proximity")) {
                                rowData.push(delta !== undefined ? delta.toFixed(1) : "");
                            } else {
                                rowData.push(delta !== undefined ? delta.toFixed(2) : "");
                            }
                        });
                        
                        sheet.appendRow(rowData);
                        
                        // Highlight top 10 finishers
                        if (player.finishPos <= 10) {
                            sheet.getRange(sheet.getLastRow(), 1, 1, rowData.length).setBackground("#ffffcc");
                        }
                    });
                    
                    // Auto-resize columns
                    sheet.autoResizeColumns(1, playerHeaderRow.length);
                    console.log(`✓ Added ${playerDataWithDeltas.length} players with delta data to ${tournament.name}`);
                }
            }
            
            sheet.autoResizeColumns(1, 9);
        } catch (error) {
        console.error("Error occurred:", error);
        }
    }
}



