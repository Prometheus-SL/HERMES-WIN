const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const appDir = path.join(projectRoot, 'dist', 'app');
const sourcePackageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
);

function copyFileIfExists(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.copyFileSync(sourcePath, destinationPath);
}

function copyDirectoryIfExists(sourcePath, destinationPath) {
  if (!fs.existsSync(sourcePath)) {
    return;
  }

  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.cpSync(sourcePath, destinationPath, { recursive: true, force: true });
}

fs.rmSync(appDir, { recursive: true, force: true });
fs.mkdirSync(appDir, { recursive: true });

copyDirectoryIfExists(path.join(projectRoot, 'dist', 'main'), path.join(appDir, 'dist', 'main'));
copyDirectoryIfExists(path.join(projectRoot, 'dist', 'preload'), path.join(appDir, 'dist', 'preload'));
copyDirectoryIfExists(path.join(projectRoot, 'dist', 'renderer'), path.join(appDir, 'dist', 'renderer'));
copyDirectoryIfExists(path.join(projectRoot, 'dist', 'service'), path.join(appDir, 'dist', 'service'));
copyDirectoryIfExists(path.join(projectRoot, 'src', 'native'), path.join(appDir, 'src', 'native'));
copyDirectoryIfExists(path.join(projectRoot, 'extensions'), path.join(appDir, 'extensions'));

copyFileIfExists(path.join(projectRoot, 'LICENSE'), path.join(appDir, 'LICENSE'));

for (const packageName of ['keytar', 'node-windows']) {
  copyDirectoryIfExists(
    path.join(projectRoot, 'node_modules', packageName),
    path.join(appDir, 'node_modules', packageName)
  );
}

const appPackageJson = {
  name: sourcePackageJson.name,
  version: sourcePackageJson.version,
  description: sourcePackageJson.description,
  main: sourcePackageJson.main,
  author:
    typeof sourcePackageJson.author === 'string'
      ? {
          name: sourcePackageJson.author,
          email: 'engineering@prometeo.local',
        }
      : sourcePackageJson.author || {
          name: 'Prometeo',
          email: 'engineering@prometeo.local',
        },
  license: sourcePackageJson.license,
  dependencies: {},
  optionalDependencies: {},
};

fs.writeFileSync(
  path.join(appDir, 'package.json'),
  JSON.stringify(appPackageJson, null, 2)
);
