const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.join(__dirname, '..');
const nativeRoot = path.join(projectRoot, 'src', 'native', 'win_volume');
const releaseDir = path.join(nativeRoot, 'target', 'release');
const dllPath = path.join(releaseDir, 'win_volume.dll');
const nodePath = path.join(releaseDir, 'win_volume.node');

function hasCargo() {
  const result = spawnSync('cargo', ['--version'], {
    stdio: 'ignore',
    windowsHide: true,
  });

  return result.status === 0;
}

if (process.platform !== 'win32') {
  console.log("Skipping optional native addon 'win_volume' on non-Windows platform.");
  process.exit(0);
}

if (process.env.HERMES_ENABLE_NATIVE_AUDIO !== '1') {
  console.log("Skipping optional native addon 'win_volume'. Hermes uses the PowerShell audio path by default.");
  process.exit(0);
}

if (!hasCargo()) {
  console.warn('Rust/Cargo was not found. Hermes will keep using the PowerShell audio path.');
  process.exit(0);
}

const build = spawnSync('cargo', ['build', '--release'], {
  cwd: nativeRoot,
  stdio: 'inherit',
  windowsHide: true,
});

if (build.status !== 0) {
  console.warn("Optional native addon 'win_volume' failed to build. Hermes will keep using the PowerShell audio path.");
  process.exit(0);
}

if (!fs.existsSync(dllPath)) {
  console.warn(`Optional native addon output '${dllPath}' was not found. Hermes will keep using the PowerShell audio path.`);
  process.exit(0);
}

fs.copyFileSync(dllPath, nodePath);
console.log(`Native addon ready at ${nodePath}`);
