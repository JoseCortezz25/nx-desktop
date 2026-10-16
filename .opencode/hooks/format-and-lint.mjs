#!/usr/bin/env node
/**
 * PostToolUse Hook: Auto-format and lint-fix files modified by the agent
 * via Edit / Write / MultiEdit.
 *
 * - For TypeScript/JavaScript/JSON/CSS/Markdown files: runs Prettier (--write)
 *   and ESLint (--fix) for JS/TS sources.
 * - For Rust (.rs) files under src-tauri/: runs rustfmt (--edition 2024).
 *
 * Non-zero exits from formatters/linters are swallowed so unfixable diagnostics
 * never crash the originating tool call.
 */

import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, sep } from 'node:path';

const ESLINT_EXTENSIONS = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const RUST_EXTENSIONS = /\.rs$/;

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function runSilently(bin, args) {
  try {
    execFileSync(bin, args, { stdio: 'ignore' });
  } catch {
    // Formatter/linter warnings or unfixable errors must not break the tool call.
  }
}

try {
  const raw = await readStdin();
  const { tool_input = {}, tool_response = {} } = JSON.parse(raw || '{}');
  const file =
    tool_response.filePath ||
    tool_input.file_path ||
    tool_input.filePath ||
    tool_input.path;

  if (!file) process.exit(0);

  const projectRoot = process.cwd();
  const abs = resolve(file);

  if (!abs.startsWith(projectRoot + sep)) process.exit(0);

  if (RUST_EXTENSIONS.test(abs)) {
    runSilently('rustfmt', ['--edition', '2024', abs]);
    process.exit(0);
  }

  const prettier = resolve(projectRoot, 'node_modules/.bin/prettier');
  if (existsSync(prettier)) {
    runSilently(prettier, ['--write', '--ignore-unknown', abs]);
  }

  const eslint = resolve(projectRoot, 'node_modules/.bin/eslint');
  if (existsSync(eslint) && ESLINT_EXTENSIONS.test(abs)) {
    runSilently(eslint, ['--fix', '--no-warn-ignored', abs]);
  }
} catch {
  // Ignore malformed stdin
}
