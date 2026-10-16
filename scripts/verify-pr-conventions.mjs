#!/usr/bin/env node
/**
 * Deterministic Judge for Branch, Commit, and Pull Request Conventions.
 *
 * Modes:
 *  - `node scripts/verify-pr-conventions.mjs --branch`
 *      Validates current git branch name against allowed pattern.
 *  - `node scripts/verify-pr-conventions.mjs --commit-msg <file>`
 *      Validates commit message file (Conventional Commits, <= 100 chars, no Co-Authored-By).
 *  - `node scripts/verify-pr-conventions.mjs --pr`
 *      Validates PR title (PR_TITLE env), branch (PR_BRANCH env or current git branch),
 *      and PR body (PR_BODY env or .github/PULL_REQUEST_TEMPLATE.md contract).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const BRANCH_REGEX =
  /^(?:main|(?:feat|fix|chore|docs|style|refactor|perf|test|build|ci|revert)\/[a-z0-9._-]+)$/;
const COMMIT_HEADER_REGEX =
  /^(?:feat|fix|chore|docs|test|style|refactor|perf|build|ci|revert)(?:\([a-z0-9._-]+\))?!?: .{1,}$/;
const CO_AUTHOR_REGEX = /co-authored-by:/i;
const ISSUE_LINK_REGEX = /\b(?:closes|fixes|resolves)\s+#\d+\b/i;

function getCurrentBranch() {
  try {
    return execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      encoding: 'utf8'
    }).trim();
  } catch {
    return '';
  }
}

function fail(message) {
  process.stderr.write(`\n[DETERMINISTIC JUDGE FAILED] ${message}\n`);
  process.exit(1);
}

function validateBranch(branchName) {
  if (!branchName || branchName === 'HEAD') return;
  if (!BRANCH_REGEX.test(branchName)) {
    fail(
      `Invalid branch name "${branchName}".\n` +
        `Expected pattern: <type>/<description> (e.g., feat/provider-picker, fix/ipc-error-mapping) or "main".\n` +
        `Allowed types: feat, fix, chore, docs, style, refactor, perf, test, build, ci, revert.`
    );
  }
}

function validateCommitMessage(rawContent) {
  const lines = rawContent.split(/\r?\n/).filter(line => !line.startsWith('#'));
  const header = (lines[0] || '').trim();

  if (/^(?:Merge|Revert)\b/.test(header)) {
    return;
  }

  if (!COMMIT_HEADER_REGEX.test(header)) {
    fail(
      `Invalid commit header: "${header}"\n` +
        `Expected Conventional Commit format: <type>(<scope>): <description>\n` +
        `Allowed types: feat, fix, chore, docs, test, style, refactor, perf, build, ci, revert.`
    );
  }

  if (header.length > 100) {
    fail(
      `Commit header exceeds 100 characters (${header.length} chars): "${header}"`
    );
  }

  if (header.endsWith('.')) {
    fail(`Commit header must not end with a period: "${header}"`);
  }

  if (CO_AUTHOR_REGEX.test(rawContent)) {
    fail(
      'Commit message contains a "Co-Authored-By" trailer. AI attribution trailers are strictly forbidden.'
    );
  }
}

function validatePr() {
  const branch = process.env.PR_BRANCH || getCurrentBranch();
  validateBranch(branch);

  const title = process.env.PR_TITLE;
  if (title) {
    validateCommitMessage(title);
  }

  const body = process.env.PR_BODY;
  if (body) {
    if (CO_AUTHOR_REGEX.test(body)) {
      fail('PR body must not contain "Co-Authored-By" or AI attribution.');
    }
    if (!ISSUE_LINK_REGEX.test(body)) {
      fail(
        'PR body must link an issue using "Closes #N", "Fixes #N", or "Resolves #N".'
      );
    }
    const requiredHeadings = ['## Summary', '## Changes', '## Test Plan'];
    for (const heading of requiredHeadings) {
      if (!body.includes(heading)) {
        fail(`PR body is missing required section "${heading}".`);
      }
    }
  }
}

const args = process.argv.slice(2);
const mode = args[0] || '--branch';

if (mode === '--branch') {
  validateBranch(getCurrentBranch());
  process.stdout.write('[JUDGE OK] Branch naming convention verified.\n');
} else if (mode === '--commit-msg') {
  const file = args[1];
  if (!file) fail('Missing commit message file path for --commit-msg.');
  const content = readFileSync(file, 'utf8');
  validateCommitMessage(content);
  process.stdout.write('[JUDGE OK] Commit message convention verified.\n');
} else if (mode === '--pr') {
  validatePr();
  process.stdout.write('[JUDGE OK] Branch and PR conventions verified.\n');
} else {
  fail(`Unknown mode "${mode}". Use --branch, --commit-msg <file>, or --pr.`);
}
