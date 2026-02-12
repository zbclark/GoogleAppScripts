#!/usr/bin/env node
/**
 * Tournament Weight Optimization Workflow Orchestrator
 * 
 * Usage:
 *   node runWorkflow.js <eventId> [tournamentName]
 *   node runWorkflow.js 6 "Sony Open"
 *   node runWorkflow.js 2 "PGA West"
 * 
 * This script:
 * 1. Runs tournamentAnalyzer.js to identify metric correlations
 * 2. Runs weightIterator.js to test baseline with metric inversion
 * 3. Runs configurationTester.js to compare all available templates
 * 4. Generates comprehensive comparison report
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Get command line arguments
const args = process.argv.slice(2);
const eventId = args[0];
const tournamentName = args[1] || `Tournament ${eventId}`;

// Validate inputs
if (!eventId) {
  console.error('❌ Usage: node runWorkflow.js <eventId> [tournamentName]');
  console.error('❌ Example: node runWorkflow.js 6 "Sony Open"');
  process.exit(1);
}

// Available tournaments
const TOURNAMENTS = {
  '2': 'PGA_WEST',
  '6': 'SONY_OPEN'
};

const tournamentKey = TOURNAMENTS[eventId];
if (!tournamentKey) {
  console.warn(`⚠️  Warning: eventId "${eventId}" not in predefined list (2=PGA_WEST, 6=SONY_OPEN)`);
  console.warn(`⚠️  Proceeding with custom tournament name: "${tournamentName}"\n`);
}

const ROOT_DIR = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const RESULTS_FILE = path.join(OUTPUT_DIR, 'workflow_results.json');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

console.log('\n' + '='.repeat(90));
console.log(`🏌️  WEIGHT OPTIMIZATION WORKFLOW - ${tournamentName.toUpperCase()} (Event ID: ${eventId})`);
console.log('='.repeat(90));
console.log(`Started: ${new Date().toISOString()}\n`);

let workflowResults = {
  eventId,
  tournamentName,
  startTime: new Date().toISOString(),
  steps: {
    tournamentAnalyzer: null,
    weightIterator: null,
    configurationTester: null
  },
  summary: {}
};

/**
 * Run a script in the workflow
 */
function runStep(scriptName, stepKey, stepNumber) {
  return new Promise((resolve, reject) => {
    console.log(`\n📊 Step ${stepNumber}/3: ${scriptName}`);
    console.log('-'.repeat(90));
    
    const scriptPath = path.join(__dirname, scriptName);
    const proc = spawn('node', [scriptPath, eventId, tournamentName], {
      cwd: __dirname,
      stdio: 'inherit'
    });

    proc.on('error', (err) => {
      console.error(`❌ Error running ${scriptName}:`, err);
      reject(err);
    });

    proc.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${scriptName} completed successfully`);
        workflowResults.steps[stepKey] = {
          status: 'success',
          completedAt: new Date().toISOString()
        };
        resolve();
      } else {
        console.error(`❌ ${scriptName} exited with code ${code}`);
        reject(new Error(`${scriptName} failed with exit code ${code}`));
      }
    });
  });
}

/**
 * Load and compare results
 */
function generateComparison() {
  try {
    const correlationFile = path.join(OUTPUT_DIR, 'correlation_analysis.json');
    const configFile = path.join(OUTPUT_DIR, 'configuration_test_results.json');
    
    if (!fs.existsSync(correlationFile) || !fs.existsSync(configFile)) {
      console.warn('⚠️  Could not find all output files for comparison');
      return {};
    }

    const correlation = JSON.parse(fs.readFileSync(correlationFile, 'utf8'));
    const configurations = JSON.parse(fs.readFileSync(configFile, 'utf8'));

    return {
      metricsAnalyzed: correlation.metricsAnalyzed,
      invertedMetrics: correlation.invertedMetrics.length,
      topCorrelationMetric: correlation.correlations?.[0] || null,
      bestConfiguration: configurations.configurations?.[0] || null,
      allConfigurations: configurations.configurations || []
    };
  } catch (err) {
    console.error('Error loading results:', err);
    return {};
  }
}

/**
 * Main workflow execution
 */
async function runWorkflow() {
  try {
    // Step 1: Tournament Analyzer
    await runStep('tournamentAnalyzer.js', 'tournamentAnalyzer', 1);

    // Step 2: Weight Iterator
    await runStep('weightIterator.js', 'weightIterator', 2);

    // Step 3: Configuration Tester
    await runStep('configurationTester.js', 'configurationTester', 3);

    // Generate comparison
    console.log('\n' + '='.repeat(90));
    console.log('📋 WORKFLOW SUMMARY');
    console.log('='.repeat(90));

    const comparison = generateComparison();
    workflowResults.summary = comparison;
    workflowResults.endTime = new Date().toISOString();

    // Display summary
    if (comparison.metricsAnalyzed) {
      console.log(`\n✓ Metrics Analyzed: ${comparison.metricsAnalyzed}`);
      console.log(`✓ Inverted Metrics Detected: ${comparison.invertedMetrics}`);
      
      if (comparison.topCorrelationMetric) {
        console.log(`\n🎯 Top Metric by Correlation:`);
        console.log(`   ${comparison.topCorrelationMetric.metric}: ${comparison.topCorrelationMetric.correlation.toFixed(4)}`);
      }
      
      if (comparison.bestConfiguration) {
        console.log(`\n🥇 Best Configuration:`);
        console.log(`   ${comparison.bestConfiguration.name}`);
        console.log(`   Correlation: ${comparison.bestConfiguration.correlation?.toFixed(4) || 'N/A'}`);
        console.log(`   Top-20 Accuracy: ${comparison.bestConfiguration.topNAccuracy?.toFixed(1) || 'N/A'}%`);
      }

      if (comparison.allConfigurations?.length > 1) {
        console.log(`\n📊 All Configurations Tested: ${comparison.allConfigurations.length}`);
        comparison.allConfigurations.slice(0, 3).forEach((config, idx) => {
          console.log(`   ${idx + 1}. ${config.name}: ${config.correlation?.toFixed(4) || 'N/A'} correlation`);
        });
      }
    }

    console.log('\n' + '='.repeat(90));
    console.log('✅ WORKFLOW COMPLETED SUCCESSFULLY');
    console.log('='.repeat(90));
    console.log(`\nOutput files saved to: ${OUTPUT_DIR}/`);
    console.log('  • correlation_analysis.json - Metric correlations and inverted metrics');
    console.log('  • weight_iteration_results.json - Baseline results with inversion');
    console.log('  • configuration_test_results.json - All template comparisons');
    console.log(`\nWorkflow results saved to: ${RESULTS_FILE}`);

    // Save workflow results
    fs.writeFileSync(RESULTS_FILE, JSON.stringify(workflowResults, null, 2));

    console.log(`\nCompleted: ${new Date().toISOString()}\n`);
    process.exit(0);

  } catch (err) {
    console.error('\n' + '='.repeat(90));
    console.error('❌ WORKFLOW FAILED');
    console.error('='.repeat(90));
    console.error(`Error: ${err.message}`);
    
    workflowResults.error = err.message;
    workflowResults.endTime = new Date().toISOString();
    
    try {
      fs.writeFileSync(RESULTS_FILE, JSON.stringify(workflowResults, null, 2));
    } catch (writeErr) {
      console.error('Could not save workflow results:', writeErr);
    }

    process.exit(1);
  }
}

// Run the workflow
runWorkflow();
