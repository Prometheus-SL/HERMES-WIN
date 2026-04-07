const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { ZipFile } = require('yazl');

const projectRoot = path.join(__dirname, '..');
const releaseDir = path.join(projectRoot, 'release');
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
);
const version = String(packageJson.version);
const platformLabel =
  process.platform === 'win32'
    ? 'windows'
    : process.platform === 'darwin'
      ? 'macos'
      : process.platform;
const bundleDir = path.join(releaseDir, `client-bundle-${platformLabel}`);
const bundlePath = path.join(
  releaseDir,
  `HERMES-${platformLabel}-client-bundle-${version}.zip`
);
const hashFile = path.join(releaseDir, `SHA256SUMS-${platformLabel}.txt`);
const artifactExtensions = new Set(['.appimage', '.blockmap', '.deb', '.dmg', '.exe', '.zip']);

function sha256Hex(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

function addDirectoryToZip(zipFile, sourceDir, relativeDir = '') {
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const fullPath = path.join(sourceDir, entry.name);
    const zipPath = path.posix.join(relativeDir, entry.name);

    if (entry.isDirectory()) {
      addDirectoryToZip(zipFile, fullPath, zipPath);
      continue;
    }

    zipFile.addFile(fullPath, zipPath);
  }
}

async function createZip(sourceDir, destinationPath) {
  await new Promise((resolve, reject) => {
    const zipFile = new ZipFile();
    const output = fs.createWriteStream(destinationPath);

    output.on('close', resolve);
    output.on('error', reject);
    zipFile.outputStream.pipe(output);

    addDirectoryToZip(zipFile, sourceDir);
    zipFile.end();
  });
}

if (!fs.existsSync(releaseDir)) {
  throw new Error(`Release directory '${releaseDir}' does not exist. Run 'npm run build' first.`);
}

fs.rmSync(bundleDir, { recursive: true, force: true });
fs.rmSync(bundlePath, { force: true });
fs.mkdirSync(bundleDir, { recursive: true });

const documentationFiles = [
  path.join(projectRoot, 'README.md'),
  path.join(projectRoot, 'LICENSE'),
];

const docsDir = path.join(projectRoot, 'docs');
if (fs.existsSync(docsDir)) {
  for (const entry of fs.readdirSync(docsDir)) {
    if (entry.toLowerCase().endsWith('.md')) {
      documentationFiles.push(path.join(docsDir, entry));
    }
  }
}

for (const filePath of documentationFiles) {
  if (fs.existsSync(filePath)) {
    fs.copyFileSync(filePath, path.join(bundleDir, path.basename(filePath)));
  }
}

const artifacts = fs
  .readdirSync(releaseDir, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(releaseDir, entry.name))
  .filter((filePath) => {
    const extension = path.extname(path.basename(filePath)).toLowerCase();
    return artifactExtensions.has(extension);
  })
  .filter((filePath) => {
    const fileName = path.basename(filePath);
    return (
      fileName !== path.basename(bundlePath) &&
      fileName !== path.basename(hashFile) &&
      !fileName.includes('-client-bundle-')
    );
  });

if (artifacts.length === 0) {
  throw new Error(`No release artifacts were found in '${releaseDir}'.`);
}

for (const artifactPath of artifacts) {
  fs.copyFileSync(artifactPath, path.join(bundleDir, path.basename(artifactPath)));
}

const hashLines = artifacts
  .map((artifactPath) => `${sha256Hex(artifactPath)} *${path.basename(artifactPath)}`)
  .sort();

fs.writeFileSync(hashFile, `${hashLines.join('\n')}\n`, 'ascii');
fs.copyFileSync(hashFile, path.join(bundleDir, path.basename(hashFile)));

createZip(bundleDir, bundlePath)
  .then(() => {
    console.log(`Client bundle ready at ${bundlePath}`);
    fs.rmSync(bundleDir, { recursive: true, force: true });
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
