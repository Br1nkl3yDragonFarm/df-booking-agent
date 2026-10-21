// PostToolUse hook for Edit|Write: syntax-check the JS file Claude just changed.
// This repo has no formatter, so `node --check` is the safety net. Exit code 2 sends the error back to Claude.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

let file = '';
try { file = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.file_path || ''; } catch { process.exit(0); }

if (!/\.m?js$/.test(file) || /[\\/]vendor[\\/]/.test(file)) process.exit(0);

const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
if (run.status !== 0) {
  console.error(`node --check failed on ${file}:\n${run.stderr}`);
  process.exit(2);
}
process.exit(0);
