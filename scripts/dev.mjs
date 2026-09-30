// Cross-platform dev launcher for QUENbot.
// Unsets ELECTRON_RUN_AS_NODE (set by VSCode/Claude Code), which otherwise makes
// Electron start as plain Node and the app never opens.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const bin = path.join(path.dirname(require.resolve('electron-vite/package.json')), 'bin', 'electron-vite.js');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// Run electron-vite's CLI with this Node directly: no shell, so arguments pass through unchanged.
const child = spawn(process.execPath, [bin, 'dev', ...process.argv.slice(2)], { stdio: 'inherit', env });

child.on('error', (err) => {
  console.error(`Failed to start electron-vite: ${err.message}`);
  process.exit(1);
});
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
