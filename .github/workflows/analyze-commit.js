/**
 * GitHub Action runner - executes analysis and saves result
 * This is what runs in the CI environment
 */

const fs = require('fs');
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
      // Push event
      const commit = event.head_commit || event.commits?.[0];
      if (!commit) {
        console.log('No commit found in push event');
        process.exit(0);
      }

      result = analyzer.analyze(
        commit.id,
        commit.author.name,
        commit.message,
        commit.timestamp,
        event.pusher?.commits?.length || 1, // Rough estimate
        0, // Would need GitHub API to get accurate counts
        0,
        0
      );
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
