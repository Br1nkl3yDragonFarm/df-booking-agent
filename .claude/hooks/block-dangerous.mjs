// PreToolUse hook for Bash: stop recursive force-deletes and reads of secret files.
// Exit code 2 blocks the command and shows the reason to Claude.
import { readFileSync } from 'node:fs';

let cmd = '';
try { cmd = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command || ''; } catch { process.exit(0); }

// rm with both -r/-R and -f, in any order or spelling (-rf, -fr, -r -f, --recursive --force)
const rmRecursiveForce = /\brm(?=[^;&|]*\s(?:-[a-zA-Z]*[rR]|--recursive))(?=[^;&|]*\s(?:-[a-zA-Z]*f|--force))/;
// .env, .env.local etc. read by a shell command
const readsEnv = /(?:^|[\s;&|(])(?:cat|less|more|head|tail|grep|sed|awk|source|\.)\s(?:[^;&|]*[\s/'"])?\.env(?:\.[\w-]+)?(?![\w.-])/;

if (rmRecursiveForce.test(cmd)) {
  console.error('Blocked: rm -rf is not allowed in this repo. Delete specific files, or ask the owner.');
  process.exit(2);
}
if (readsEnv.test(cmd)) {
  console.error('Blocked: .env files hold secrets and must not be read. Ask the owner which variable is set instead.');
  process.exit(2);
}
process.exit(0);
