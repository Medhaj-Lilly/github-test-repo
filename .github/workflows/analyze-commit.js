/**
 * GitHub Action runner - executes analysis and saves result
 * This is what runs in the CI environment
 */

const fs = require('fs');
const { execSync } = require('child_process');
const { AICodeAnalyzer } = require('../dist/analyzer');

async function main() {
  try {
    const event = JSON.parse(process.env.GITHUB_EVENT || '{}');
    const analyzer = new AICodeAnalyzer();

    let result;

    // Handle different event types
    if (event.pull_request) {
      // PR event
      const pr = event.pull_request;
      result = analyzer.analyze(
        pr.head.sha,
        pr.user.login,
        pr.title + '\n' + (pr.body || ''),
        pr.created_at,
        pr.changed_files || 0,
        pr.additions || 0,
        pr.deletions || 0,
        Math.floor((new Date(pr.updated_at) - new Date(pr.created_at)) / 1000)
      );
    } else if (event.push) {
      // Push event - get stats from git
      try {
        const author = execSync('git log -1 --format=%an', { encoding: 'utf-8' }).trim();
        const message = execSync('git log -1 --format=%B', { encoding: 'utf-8' }).trim();
        const hash = execSync('git rev-parse HEAD', { encoding: 'utf-8' }).trim();
        const timestamp = execSync('git log -1 --format=%aI', { encoding: 'utf-8' }).trim();

        const additions = parseInt(execSync('git diff HEAD~1 HEAD --numstat | awk \'{s+=$1} END {print s}\'', { encoding: 'utf-8' }).trim()) || 0;
        const deletions = parseInt(execSync('git diff HEAD~1 HEAD --numstat | awk \'{s+=$2} END {print s}\'', { encoding: 'utf-8' }).trim()) || 0;
        const files = parseInt(execSync('git diff HEAD~1 HEAD --name-only | wc -l', { encoding: 'utf-8' }).trim()) || 1;

        result = analyzer.analyze(
          hash,
          author,
          message,
          timestamp,
          files,
          additions,
          deletions,
          30
        );
      } catch (e) {
        console.log('Could not get git stats:', e.message);
        process.exit(0);
      }
    } else {
      console.log('Unknown event type');
      process.exit(0);
    }

    // Save result for GitHub Action to use
    fs.writeFileSync('/tmp/analysis-result.json', JSON.stringify(result, null, 2));

    // Log result
    console.log('Analysis complete:');
    console.log(`Classification: ${result.classification}`);
    console.log(`AI Confidence: ${(result.aiConfidence * 100).toFixed(1)}%`);
    console.log(`Human Confidence: ${(result.humanConfidence * 100).toFixed(1)}%`);
    console.log('\nReasoning:');
    console.log(result.reasoning);
  } catch (error) {
    console.error('Analysis failed:', error);
    process.exit(1);
  }
}

main();
