#!/usr/bin/env node
/**
 * Focused tests for the deterministic branch/commit/PR conventions judge
 * (`scripts/verify-pr-conventions.mjs`).
 *
 * Coverage:
 *  - `--pr` accepts the Fabrica delivery title
 *    `Agent-<positive task id>-<lowercase kebab-case slug>`.
 *  - `--pr` keeps accepting Conventional Commit titles and keeps the branch,
 *    body, length and attribution guards intact.
 *  - `--commit-msg` stays strictly Conventional Commits and rejects the
 *    Fabrica Agent title.
 *
 * Run with: `node --test scripts/verify-pr-conventions.test.mjs`.
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it } from 'node:test';

const SCRIPT = fileURLToPath(
  new URL('./verify-pr-conventions.mjs', import.meta.url)
);

const VALID_BRANCH = 'feat/issue-42-native-window-chrome';

const VALID_BODY = [
  '## Linked Issue',
  '',
  'Closes #47',
  '',
  '## Summary',
  '',
  '- Reconciliation of the repository PR-title judge with the Fabrica title rule.',
  '',
  '## Changes',
  '',
  '| File | Change |',
  '| ---- | ------ |',
  '| `scripts/verify-pr-conventions.mjs` | Accept Fabrica Agent PR titles |',
  '',
  '## Test Plan',
  '',
  '- [x] `node --test scripts/verify-pr-conventions.test.mjs`'
].join('\n');

function runPr({ title, branch = VALID_BRANCH, body = VALID_BODY } = {}) {
  const env = { ...process.env };
  delete env.PR_TITLE;
  delete env.PR_BRANCH;
  delete env.PR_BODY;
  if (title !== undefined) env.PR_TITLE = title;
  if (branch !== undefined) env.PR_BRANCH = branch;
  if (body !== undefined) env.PR_BODY = body;

  const result = spawnSync(process.execPath, [SCRIPT, '--pr'], {
    encoding: 'utf8',
    env
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? ''
  };
}

function runCommitMsg(content) {
  const dir = mkdtempSync(join(tmpdir(), 'pr-conventions-judge-'));
  const file = join(dir, 'COMMIT_EDITMSG');
  writeFileSync(file, content, 'utf8');
  try {
    const result = spawnSync(process.execPath, [SCRIPT, '--commit-msg', file], {
      encoding: 'utf8',
      env: { ...process.env }
    });
    return {
      status: result.status,
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? ''
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('--pr Fabrica Agent PR titles', () => {
  it('accepts the current Fabrica PR title Agent-42-native-window-chrome', () => {
    const result = runPr({ title: 'Agent-42-native-window-chrome' });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /JUDGE OK/);
  });

  it('accepts this fix delivery title Agent-47-fabrica-pr-title-judge', () => {
    const result = runPr({ title: 'Agent-47-fabrica-pr-title-judge' });
    assert.equal(result.status, 0, result.stderr);
  });

  it('accepts a single-segment slug and a multi-digit task id', () => {
    assert.equal(runPr({ title: 'Agent-1-fix' }).status, 0);
    assert.equal(
      runPr({ title: 'Agent-1234-multi-provider-fan-out' }).status,
      0
    );
  });

  const malformedAgentTitles = [
    'Agent-native-window-chrome', // missing task id
    'Agent-0-native-window-chrome', // zero task id
    'Agent-02-native-window-chrome', // leading-zero task id
    'Agent-42-Native-Window-Chrome', // uppercase slug
    'Agent-42-native window chrome', // whitespace in slug
    'Agent-42-native-window-chrome!', // trailing punctuation
    'Agent-42-native_underscore', // underscore in slug
    'Agent-42-native--window', // empty kebab segment
    'Agent-42-' // empty slug
  ];

  for (const title of malformedAgentTitles) {
    it(`rejects malformed Agent title "${title}"`, () => {
      const result = runPr({ title });
      assert.notEqual(result.status, 0, `expected rejection for "${title}"`);
      assert.match(result.stderr, /DETERMINISTIC JUDGE FAILED/);
      assert.match(result.stderr, /Invalid Fabrica Agent PR title/);
    });
  }
});

describe('--pr Conventional Commit titles', () => {
  it('still accepts a Conventional Commit PR title', () => {
    const result = runPr({ title: 'feat(shell): use the native menu' });
    assert.equal(result.status, 0, result.stderr);
  });

  it('rejects a title that is neither Agent nor Conventional Commit', () => {
    const result = runPr({ title: 'Update the judge' });
    assert.notEqual(result.status, 0);
  });

  it('keeps the 100-character title guard for Conventional titles', () => {
    const result = runPr({ title: `feat(shell): ${'x'.repeat(100)}` });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /exceeds 100 characters/);
  });
});

describe('--pr branch and body guards remain intact', () => {
  it('rejects an invalid branch even with a valid Agent title', () => {
    const result = runPr({
      title: 'Agent-42-native-window-chrome',
      branch: 'feature/not-allowed'
    });
    assert.notEqual(result.status, 0);
  });

  it('rejects a body that does not link an issue', () => {
    const result = runPr({
      title: 'Agent-42-native-window-chrome',
      body: VALID_BODY.replace('Closes #47', 'See the tracking issue')
    });
    assert.notEqual(result.status, 0);
  });

  it('rejects a body missing a required section', () => {
    const result = runPr({
      title: 'Agent-42-native-window-chrome',
      body: 'Closes #47\n'
    });
    assert.notEqual(result.status, 0);
  });

  it('rejects Co-Authored-By attribution in the body', () => {
    const result = runPr({
      title: 'Agent-42-native-window-chrome',
      body: `${VALID_BODY}\n\nCo-Authored-By: someone`
    });
    assert.notEqual(result.status, 0);
  });
});

describe('--commit-msg stays strictly Conventional Commits', () => {
  it('rejects the Fabrica Agent title as a commit message', () => {
    const result = runCommitMsg('Agent-42-native-window-chrome\n');
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /DETERMINISTIC JUDGE FAILED/);
  });

  it('accepts a valid Conventional Commit message', () => {
    const result = runCommitMsg(
      'fix(harness): accept Fabrica Agent PR titles in the judge\n'
    );
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /JUDGE OK/);
  });

  it('rejects malformed commit messages', () => {
    assert.notEqual(runCommitMsg('updated the judge\n').status, 0);
    assert.notEqual(
      runCommitMsg('feat(harness): ends with a period.\n').status,
      0
    );
  });
});
