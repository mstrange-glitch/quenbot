// Cross-platform dev launcher for QUENbot.
// Unsets ELECTRON_RUN_AS_NODE (set by VSCode/Claude Code), which otherwise makes
// Electron start as plain Node and the app never opens.
import { spawn } from 'node:child_process';

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn('npx', ['electron-vite', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

child.on('exit', (code) => process.exit(code ?? 0));
