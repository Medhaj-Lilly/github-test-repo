/**
 * Simple GitHub Action analyzer - no dependencies needed
 * Directly implements AI detection logic
 */

const fs = require('fs');
const { execSync } = require('child_process');

function analyzeChanges(filesChanged, linesAdded, linesDeleted, message) {
  let aiScore = 0;
  let humanScore = 0;
  const signals = [];

  // Signal 1: Message keywords
  const msgLower = message.toLowerCase();
  if (msgLower.includes('claude') || msgLower.includes('copilot') || msgLower.includes('auto-generated')) {
    aiScore += 3;
    signals.push(`✓ Commit message contains AI keyword`);
  }
  if (msgLower.includes('refactor') || msgLower.includes('bugfix')) {
    humanScore += 2;
    signals.push(`✓ Commit message contains human keyword`);
  }

  // Signal 2: Bulk changes
  if (linesAdded > 500) {
    aiScore += 2;
    signals.push(`✓ Large insertion: ${linesAdded} lines`);
  } else if (linesAdded > 20) {
    humanScore += 1;
    signals.push(`✓ Small insertion: ${linesAdded} lines (human-like)`);
  }

  // Signal 3: File coordination
  if (filesChanged > 5 && linesAdded > 100) {
    aiScore += 1.5;
    signals.push(`✓ ${filesChanged} files changed with ${linesAdded} lines (coordinated)`);
  }

  // Signal 4: Add/delete ratio
  const ratio = linesAdded / (linesDeleted || 1);
  if (ratio > 3) {
    aiScore += 1;
    signals.push(`✓ Heavy additions (ratio: ${ratio.toFixed(1)})`);
  } else if (ratio < 1.5) {
    humanScore += 1;
    signals.push(`✓ Balanced changes (ratio: ${ratio.toFixed(1)})`);
  }

  const total = aiScore + humanScore;
  const aiConfidence = aiScore / total;

  let classification = 'MIXED';
  if (aiConfidence > 0.65) {
    classification = 'AI';
  } else if (aiConfidence < 0.35) {
    classification = 'HUMAN';
  }

  return {
    classification,
    aiConfidence,
    humanConfidence: 1 - aiConfidence,
    filesChanged,
    linesAdded,
    linesDeleted,
    signals: signals.join('\n'),
    message
  };
}

try {
  const author = execSync('git log -1 --format=%an', { encoding: 'utf-8' }).trim();
  const message = execSync('git log -1 --format=%B', { encoding: 'utf-8' }).trim();

  // Get diff stats
  let additions = 0, deletions = 0, files = 1;
  try {
    const numstat = execSync('git diff HEAD~1 HEAD --numstat', { encoding: 'utf-8' }).split('\n').filter(l => l);
    additions = numstat.reduce((sum, line) => sum + parseInt(line.split('\t')[0]) || 0, 0);
    deletions = numstat.reduce((sum, line) => sum + parseInt(line.split('\t')[1]) || 0, 0);
    files = numstat.length;
  } catch (e) {
    // First commit, use HEAD stats
    const stat = execSync('git log -1 --numstat', { encoding: 'utf-8' }).split('\n').filter(l => l && l.includes('\t'));
    additions = stat.reduce((sum, line) => sum + parseInt(line.split('\t')[0]) || 0, 0);
    files = stat.length;
  }

  const result = analyzeChanges(files, additions, deletions, message);

  fs.writeFileSync('/tmp/analysis-result.json', JSON.stringify(result, null, 2));

  console.log('✅ Analysis complete');
  console.log(`Classification: ${result.classification}`);
  console.log(`AI Confidence: ${(result.aiConfidence * 100).toFixed(1)}%`);
  console.log(`\nSignals:\n${result.signals}`);
} catch (error) {
  console.error('❌ Analysis failed:', error.message);
  process.exit(1);
}
