// npm run package -- the RAMS Connector as a folder to copy to the office PC:
//
//   dist/rams-connector/
//     Setup RAMS Connector.cmd  double-click: the setup window (setup.ps1) checks
//                               Tally and RAMS, takes the Connector code,
//                               installs, loads Tally the first time, starts
//     rams-connector.cmd        starts it: rams-connector run | status | ping ...
//     install-service.ps1       sets it up to start at sign-in (Setup runs it)
//     uninstall-service.ps1     removes that
//     connector.example.json    the settings template
//     runtime/node.exe          the Node.js this was packaged with, so the
//                               office PC needs no Node install (Windows x64)
//     src/, package.json, node_modules/ (production only)
//
// The settings and logs live in %ProgramData%\RAMS\ (connectorConfig.js), not
// in this folder, so a new version is just a new folder.
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { version } = require('../package.json');

const root = path.resolve(__dirname, '..');
const out = path.join(root, 'dist', 'rams-connector');

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const item of ['src', 'package.json', 'package-lock.json', 'connector.example.json']) {
  fs.cpSync(path.join(root, item), path.join(out, item), { recursive: true });
}
for (const script of ['setup.ps1', 'install-service.ps1', 'uninstall-service.ps1']) {
  fs.copyFileSync(path.join(__dirname, script), path.join(out, script));
}
fs.writeFileSync(path.join(out, 'rams-connector.cmd'), [
  '@echo off',
  'rem The RAMS Connector. Reads Tally, never writes to it. Settings: %ProgramData%\\RAMS\\connector.json',
  'rem Uses the Node.js in runtime\\ (packaged with it), else the one on PATH.',
  'cd /d "%~dp0"',
  'if exist "%~dp0runtime\\node.exe" (',
  '  "%~dp0runtime\\node.exe" "%~dp0src\\cli.js" %*',
  ') else (',
  '  node "%~dp0src\\cli.js" %*',
  ')',
  'exit /b %errorlevel%',
  '',
].join('\r\n'));
// Opened from inside the zip, Windows copies only this file to a temp folder:
// say to unzip first. `start` lets this window close while setup runs.
fs.writeFileSync(path.join(out, 'Setup RAMS Connector.cmd'), [
  '@echo off',
  'rem Double-click to connect TallyPrime on this PC to RAMS. RAMS only reads Tally.',
  'if not exist "%~dp0setup.ps1" (',
  '  echo Unzip the RAMS Connector folder first: right-click the zip file, choose Extract All,',
  '  echo then double-click "Setup RAMS Connector" in the folder it makes.',
  '  pause',
  '  exit /b 1',
  ')',
  'start "" powershell.exe -NoProfile -ExecutionPolicy Bypass -STA -WindowStyle Hidden -File "%~dp0setup.ps1"',
  '',
].join('\r\n'));
execSync('npm ci --omit=dev --no-audit --no-fund', { cwd: out, stdio: 'inherit' });

// The office PC runs Windows on x64, so only a Windows x64 build of Node can go in.
if (process.platform === 'win32' && process.arch === 'x64') {
  const runtime = path.join(out, 'runtime');
  fs.mkdirSync(runtime);
  fs.copyFileSync(process.execPath, path.join(runtime, 'node.exe'));
  const licence = path.join(path.dirname(process.execPath), 'LICENSE');
  if (fs.existsSync(licence)) fs.copyFileSync(licence, path.join(runtime, 'LICENSE'));
  fs.writeFileSync(path.join(runtime, 'README.txt'),
    `Node.js ${process.version} (https://nodejs.org, MIT licence), packaged with the RAMS Connector so this PC needs no Node install.\r\n`);
} else {
  console.warn(`\nNot a Windows x64 build of Node (${process.platform}/${process.arch}): runtime\\node.exe is left out, so the office PC needs Node 20+ installed.`);
}
fs.writeFileSync(path.join(out, 'VERSION.txt'), `RAMS Connector ${version}\r\n`);
console.log(`\nRAMS Connector ${version} packaged in ${out}`);
