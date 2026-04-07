function selectSystemSnapshotImplementation(platform = process.platform) {
  if (platform === 'win32') {
    return require('./platform/systemSnapshotWindows');
  }

  if (platform === 'linux') {
    return require('./platform/systemSnapshotLinux');
  }

  return require('./platform/systemSnapshotDarwin');
}

const implementation = selectSystemSnapshotImplementation();

module.exports = {
  ...implementation,
  selectSystemSnapshotImplementation,
};
