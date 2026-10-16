#!/usr/bin/env node
/**
 * PreToolUse Guardrail Hook for AI Agents (Claude Code & OpenCode).
 *
 * Reads the tool invocation payload from stdin and deterministically blocks:
 *  1. Destructive Git operations (reset --hard, clean -f, push --force, branch -D, checkout/restore .)
 *  2. Hook-bypass flags (--no-verify, git commit -n)
 *  3. Co-Authored-By AI attribution trailers in git commit commands
 *  4. Direct edits to build artifacts (src-tauri/target/, dist/, node_modules/)
 *
 * Exits with code 2 and a descriptive stderr message when a prohibition matches.
 */

import { resolve, sep } from 'node:path';

const BLOCKED_BASH_RULES = [
  {
    pattern: /\bgit\s+push\b.*(?:\s--force\b|\s-f\b|\s--force-with-lease\b)/i,
    reason: 'Force-pushing is prohibited by repository guardrails.'
  },
  {
    pattern: /\bgit\s+reset\s+--hard\b/i,
    reason: 'Hard git resets destroy uncommitted work and are prohibited.'
  },
  {
    pattern: /\bgit\s+clean\s+-[a-z]*f/i,
    reason:
      'git clean -f deletes untracked files permanently and is prohibited.'
  },
  {
    pattern: /\bgit\s+branch\s+-D\b/,
    reason: 'Force-deleting branches (git branch -D) is prohibited.'
  },
  {
    pattern: /\bgit\s+(?:checkout|restore)\s+(?:--\s+)?\.(?:\s|$)/,
    reason:
      'Discarding all working-tree changes via git checkout/restore . is prohibited.'
  },
  {
    pattern:
      /\bgit\s+(?:commit|push|merge|rebase)\b.*(?:\s--no-verify\b|\s-n\b)/,
    reason:
      'Bypassing deterministic Git hooks (--no-verify / -n) is strictly prohibited.'
  },
  {
    pattern: /co-authored-by:/i,
    reason:
      'Adding Co-Authored-By or AI attribution trailers to commits is prohibited.'
  }
];

const PROTECTED_PATH_SEGMENTS = [
  `${sep}src-tauri${sep}target${sep}`,
  `${sep}node_modules${sep}`,
  `${sep}dist${sep}`
];

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

try {
  const raw = await readStdin();
  const payload = JSON.parse(raw || '{}');
  const toolName = payload.tool_name || payload.tool || '';
  const toolInput = payload.tool_input || payload.input || {};

  // 1. Validate Bash commands
  if (typeof toolInput.command === 'string') {
    const command = toolInput.command;
    for (const rule of BLOCKED_BASH_RULES) {
      if (rule.pattern.test(command)) {
        process.stderr.write(
          `BLOCKED by .claude/hooks/block-dangerous-commands.mjs:\n` +
            `  Command: ${command}\n` +
            `  Reason:  ${rule.reason}\n`
        );
        process.exit(2);
      }
    }
  }

  // 2. Validate file writes/edits against build artifact directories
  const targetFile =
    toolInput.file_path || toolInput.filePath || toolInput.path;
  if (
    typeof targetFile === 'string' &&
    /Edit|Write|MultiEdit/i.test(toolName)
  ) {
    const absPath = resolve(targetFile);
    for (const segment of PROTECTED_PATH_SEGMENTS) {
      if (absPath.includes(segment)) {
        process.stderr.write(
          `BLOCKED by .claude/hooks/block-dangerous-commands.mjs:\n` +
            `  Path:   ${absPath}\n` +
            `  Reason: Direct modification of generated/artifact directory (${segment}) is prohibited.\n`
        );
        process.exit(2);
      }
    }
  }

  process.exit(0);
} catch {
  // Never fail open/closed on malformed hook telemetry; allow normal execution if stdin is empty.
  process.exit(0);
}
