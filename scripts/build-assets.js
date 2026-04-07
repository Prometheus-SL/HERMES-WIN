const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const distRendererDir = path.join(projectRoot, 'dist', 'renderer');
const stylesDir = path.join(distRendererDir, 'styles');
const rendererHtml = path.join(projectRoot, 'src', 'renderer', 'index.html');
const npmExecPath = process.env.npm_execpath;

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit',
    env: process.env,
    ...options,
  });

  if (result.error) {
    console.error(result.error);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

fs.rmSync(stylesDir, { recursive: true, force: true });

if (!npmExecPath) {
  throw new Error('npm_execpath is not available for build-assets.js');
}

run(process.execPath, [npmExecPath, 'run', 'build:renderer']);
fs.mkdirSync(distRendererDir, { recursive: true });
fs.copyFileSync(rendererHtml, path.join(distRendererDir, 'index.html'));
