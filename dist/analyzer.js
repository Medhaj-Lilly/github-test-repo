"use strict";
/**
 * AICodeAnalyzer - GitHub-level AI detection
 *
 * Analyzes commits using:
 * 1. Heuristic signals (bulk changes, file count, etc.)
 * 2. Git blame correlation (check if original lines were AI)
 * 3. Commit message analysis (keywords: "claude", "copilot", etc.)
 * 4. Code style analysis (deviation from author's history)
 *
 * NO Claude API required - all analysis is free using GitHub data
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AICodeAnalyzer = void 0;
class AICodeAnalyzer {
    constructor() {
        this.aiScores = {};
        this.humanScores = {};
    }
    /**
     * Main entry point - analyze a commit
     */
    analyze(commitHash, author, commitMessage, timestamp, filesChanged, linesAdded, linesDeleted, changeDuration // seconds between first and last file change
    ) {
        this.reset();
        const signals = [];
        // Signal 1: Commit message keywords
        const msgSignal = this.analyzeCommitMessage(commitMessage);
        signals.push(msgSignal);
        // Signal 2: Bulk change detection
        const bulkSignal = this.analyzeBulkChanges(linesAdded, filesChanged);
        signals.push(bulkSignal);
        // Signal 3: Change velocity
        const velocitySignal = this.analyzeVelocity(linesAdded, changeDuration);
        signals.push(velocitySignal);
        // Signal 4: File coordination
        const coordSignal = this.analyzeFileCoordination(filesChanged, linesAdded);
        signals.push(coordSignal);
        // Signal 5: Change pattern
        const patternSignal = this.analyzeChangePattern(linesAdded, linesDeleted);
        signals.push(patternSignal);
        // Compute totals
        const aiTotal = Object.values(this.aiScores).reduce((a, b) => a + b, 0);
        const humanTotal = Object.values(this.humanScores).reduce((a, b) => a + b, 0);
        const total = aiTotal + humanTotal;
        let aiConfidence = 0;
        let humanConfidence = 0;
        let classification = 'mixed';
        if (total > 0) {
            const aiRatio = aiTotal / total;
            aiConfidence = Math.min(aiRatio, 0.99);
            humanConfidence = Math.min(1 - aiRatio, 0.99);
            if (aiRatio > 0.65) {
                classification = 'ai';
            }
            else if (aiRatio < 0.35) {
                classification = 'human';
            }
        }
        const reasoning = this.buildReasoning(signals, classification);
        return {
            commit: commitHash,
            author,
            timestamp,
            filesChanged,
            linesAdded,
            linesDeleted,
            classification,
            aiConfidence,
            humanConfidence,
            signals,
            reasoning,
        };
    }
    /**
     * Signal 1: Analyze commit message for AI keywords
     */
    analyzeCommitMessage(message) {
        const lower = message.toLowerCase();
        // Ground truth keywords
        const aiKeywords = ['claude', 'copilot', 'continue', 'cursor', 'ai-generated', 'auto-generated'];
        const humanKeywords = ['refactor', 'bugfix', 'manual', 'hand-written', 'custom'];
        let score = 0;
        let evidence = '';
        for (const keyword of aiKeywords) {
            if (lower.includes(keyword)) {
                score += 0.8; // Strong signal
                evidence = `Contains AI keyword: "${keyword}"`;
            }
        }
        for (const keyword of humanKeywords) {
            if (lower.includes(keyword)) {
                score -= 0.6; // Human signal
                evidence = `Contains human keyword: "${keyword}"`;
            }
        }
        if (!evidence) {
            evidence = 'No explicit AI/human keywords';
        }
        this.recordScore('commitMessage', score);
        return {
            name: 'Commit Message Analysis',
            score: Math.min(Math.max(score, -1), 1),
            evidence,
        };
    }
    /**
     * Signal 2: Detect bulk changes
     * Humans typically edit 1-5 files at a time
     * AI tools often touch many files simultaneously
     */
    analyzeBulkChanges(linesAdded, filesChanged) {
        let score = 0;
        let evidence = '';
        if (linesAdded > 1000) {
            score += 0.8;
            evidence = `Large insertion: ${linesAdded} lines (typical of AI bulk generation)`;
        }
        else if (linesAdded > 500) {
            score += 0.6;
            evidence = `Moderate insertion: ${linesAdded} lines`;
        }
        else if (linesAdded > 100) {
            score += 0.3;
            evidence = `Significant insertion: ${linesAdded} lines`;
        }
        else if (linesAdded > 20) {
            score -= 0.2;
            evidence = `Small insertion: ${linesAdded} lines (typical of human)`;
        }
        else {
            score -= 0.5;
            evidence = `Tiny insertion: ${linesAdded} lines (very human-like)`;
        }
        if (filesChanged > 8) {
            score += 0.5;
            evidence += ` | ${filesChanged} files changed (high coordination)`;
        }
        else if (filesChanged > 3) {
            score += 0.2;
            evidence += ` | ${filesChanged} files changed`;
        }
        this.recordScore('bulkChanges', score);
        return {
            name: 'Bulk Change Detection',
            score: Math.min(Math.max(score, -1), 1),
            evidence,
        };
    }
    /**
     * Signal 3: Change velocity
     * How fast were lines added? (linesAdded / timeDuration)
     */
    analyzeVelocity(linesAdded, durationSeconds) {
        let score = 0;
        let evidence = '';
        if (durationSeconds === 0 || durationSeconds < 1) {
            // All changes in one commit message push (instant)
            score = 0.7;
            evidence = 'Instant commit (all files touched simultaneously)';
        }
        else {
            const linesPerSecond = linesAdded / durationSeconds;
            if (linesPerSecond > 50) {
                // 50+ lines per second is AI-like
                score += 0.8;
                evidence = `Very high velocity: ${linesPerSecond.toFixed(1)} lines/sec`;
            }
            else if (linesPerSecond > 20) {
                score += 0.6;
                evidence = `High velocity: ${linesPerSecond.toFixed(1)} lines/sec`;
            }
            else if (linesPerSecond > 5) {
                score += 0.3;
                evidence = `Moderate velocity: ${linesPerSecond.toFixed(1)} lines/sec`;
            }
            else if (linesPerSecond > 1) {
                score -= 0.2;
                evidence = `Low velocity: ${linesPerSecond.toFixed(1)} lines/sec (human-like)`;
            }
            else {
                score -= 0.5;
                evidence = `Very low velocity: ${linesPerSecond.toFixed(2)} lines/sec (very human)`;
            }
        }
        this.recordScore('velocity', score);
        return {
            name: 'Change Velocity',
            score: Math.min(Math.max(score, -1), 1),
            evidence,
        };
    }
    /**
     * Signal 4: File coordination
     * Do changed files form a coherent module? (suggests AI logic)
     * Or are they scattered? (suggests human workflow)
     */
    analyzeFileCoordination(filesChanged, linesAdded) {
        let score = 0;
        let evidence = '';
        const linesPerFile = linesAdded / filesChanged;
        // If many files changed with balanced additions, looks like coordinated refactor/feature
        if (filesChanged >= 5) {
            if (linesPerFile > 50) {
                // Many files with substantial changes = AI-generated feature
                score += 0.6;
                evidence = `${filesChanged} files with ${linesPerFile.toFixed(0)} lines each (coordinated AI pattern)`;
            }
            else if (linesPerFile > 10) {
                score += 0.3;
                evidence = `${filesChanged} files with ${linesPerFile.toFixed(0)} lines each`;
            }
        }
        else if (filesChanged <= 2 && linesAdded > 50) {
            // Few files but lots of lines = human focused edit
            score -= 0.3;
            evidence = `${filesChanged} files, focused on specific areas (human pattern)`;
        }
        this.recordScore('coordination', score);
        return {
            name: 'File Coordination',
            score: Math.min(Math.max(score, -1), 1),
            evidence,
        };
    }
    /**
     * Signal 5: Change pattern (additions vs deletions)
     * AI tends to add more than delete
     * Humans balance adds/deletes more
     */
    analyzeChangePattern(linesAdded, linesDeleted) {
        let score = 0;
        let evidence = '';
        const ratio = linesAdded / (linesDeleted || 1);
        if (ratio > 5) {
            // Way more additions than deletions
            score += 0.5;
            evidence = `${linesAdded} added vs ${linesDeleted} deleted (heavy addition = AI pattern)`;
        }
        else if (ratio > 2) {
            score += 0.2;
            evidence = `${linesAdded} added vs ${linesDeleted} deleted`;
        }
        else if (ratio > 0.7 && ratio < 1.5) {
            // Balanced
            score -= 0.2;
            evidence = `${linesAdded} added vs ${linesDeleted} deleted (balanced = human refactor)`;
        }
        else if (ratio < 0.5) {
            // More deletions
            score -= 0.4;
            evidence = `Heavy deletion (${linesDeleted} deleted vs ${linesAdded} added = cleanup)`;
        }
        this.recordScore('pattern', score);
        return {
            name: 'Change Pattern',
            score: Math.min(Math.max(score, -1), 1),
            evidence,
        };
    }
    /**
     * Build human-readable reasoning
     */
    buildReasoning(signals, classification) {
        const topSignals = signals.sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 2);
        let reasoning = `Classification: ${classification.toUpperCase()}\n`;
        reasoning += '\nTop signals:\n';
        for (const signal of topSignals) {
            reasoning += `• ${signal.name}: ${signal.evidence}\n`;
        }
        return reasoning;
    }
    /**
     * Helper: Record AI/human score
     */
    recordScore(signalName, score) {
        if (score > 0) {
            this.aiScores[signalName] = score;
        }
        else if (score < 0) {
            this.humanScores[signalName] = Math.abs(score);
        }
    }
    /**
     * Reset scores for new analysis
     */
    reset() {
        this.aiScores = {};
        this.humanScores = {};
    }
}
exports.AICodeAnalyzer = AICodeAnalyzer;
