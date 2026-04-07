function selectSystemCommandsImplementation(platform = process.platform) {
  if (platform === 'win32') {
    return require('./systemCommandsWindows');
  }

  if (platform === 'linux') {
    return require('./systemCommandsLinux');
  }

  return require('./systemCommandsDarwin');
}

const implementation = selectSystemCommandsImplementation();

module.exports = {
  ...implementation,
  selectSystemCommandsImplementation,
};
