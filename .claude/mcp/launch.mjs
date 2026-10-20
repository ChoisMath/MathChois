#!/usr/bin/env node
// Cross-platform launcher for the project MCP servers declared in .mcp.json.
//
//   node .claude/mcp/launch.mjs <server>      start one server over stdio
//   node .claude/mcp/launch.mjs --prefetch    download every server into the npx cache
//
// Why a launcher instead of plain `npx` in .mcp.json:
// - Windows (native) cannot spawn `npx` directly — it needs `cmd /c npx`, which in turn
//   does not exist on Linux/macOS. `node` is a real executable everywhere.
// - Claude Code cloud sessions (CLAUDE_CODE_REMOTE=true) run as root in a headless Linux
//   container with a preinstalled Chromium (/opt/pw-browsers) and no Chrome stable, so the
//   browser servers need headless / executable-path / no-sandbox flags there only.
//
// Versions are pinned so a new upstream release can't break a session start.
// To upgrade: `npm view @playwright/mcp version` / `npm view chrome-devtools-mcp version`,
// bump below, and check `--help` for renamed flags.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const SERVERS = {
  playwright: { pkg: '@playwright/mcp@0.0.83', bin: 'playwright-mcp' },
  'chrome-devtools': { pkg: 'chrome-devtools-mcp@1.11.0', bin: 'chrome-devtools-mcp' },
};

const isWindows = process.platform === 'win32';
const isRemote = process.env.CLAUDE_CODE_REMOTE === 'true';
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const headless =
  isRemote || (process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY);

// Chromium preinstalled in the cloud container (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers).
// PW_CHROMIUM_EXECUTABLE (exported by .claude/hooks/session-start.sh) wins if set.
const CLOUD_CHROMIUM = '/opt/pw-browsers/chromium';
const chromiumPath =
  process.env.PW_CHROMIUM_EXECUTABLE || (process.platform === 'linux' && existsSync(CLOUD_CHROMIUM) ? CLOUD_CHROMIUM : '');

function serverArgs(name) {
  const args = [];
  if (name === 'playwright') {
    if (headless) args.push('--headless');
    if (chromiumPath) args.push('--browser', 'chromium', '--executable-path', chromiumPath);
    if (isRoot) args.push('--no-sandbox');
    if (isRemote) {
      // Keep the profile in memory: no profile-lock conflicts between sessions.
      args.push('--isolated');
    }
  } else if (name === 'chrome-devtools') {
    if (headless) args.push('--headless');
    if (chromiumPath) args.push('--executablePath', chromiumPath);
    if (isRoot) args.push('--chromeArg=--no-sandbox');
    if (isRemote) args.push('--isolated');
  }
  return args;
}

// npx is a .cmd shim on Windows, which Node only spawns through a shell.
// None of our arguments contain spaces or shell metacharacters except the executable path,
// which is only set on Linux.
function npxCommand(pkg, bin, args) {
  return { cmd: isWindows ? 'npx.cmd' : 'npx', args: ['--yes', '--package', pkg, '--', bin, ...args] };
}

const [target] = process.argv.slice(2);

if (target === '--prefetch') {
  let failed = false;
  for (const [name, { pkg, bin }] of Object.entries(SERVERS)) {
    const { cmd, args } = npxCommand(pkg, bin, ['--version']);
    const res = spawnSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'], shell: isWindows, encoding: 'utf8' });
    if (res.status === 0) {
      console.error(`[mcp] ${name}: ${pkg} ready (${res.stdout.trim()})`);
    } else {
      console.error(`[mcp] ${name}: failed to fetch ${pkg} (exit ${res.status})`);
      failed = true;
    }
  }
  process.exit(failed ? 1 : 0);
}

const server = SERVERS[target];
if (!server) {
  console.error(`Usage: node .claude/mcp/launch.mjs <${Object.keys(SERVERS).join('|')}> | --prefetch`);
  process.exit(2);
}

const { cmd, args } = npxCommand(server.pkg, server.bin, serverArgs(target));
const child = spawn(cmd, args, { stdio: 'inherit', shell: isWindows });

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on('error', (err) => {
  console.error(`[mcp] failed to start ${target}: ${err.message}`);
  process.exit(1);
});
