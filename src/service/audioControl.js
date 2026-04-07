function selectAudioImplementation(platform = process.platform) {
  if (platform === 'win32') {
    return require('./platform/audioWindows');
  }

  if (platform === 'linux') {
    return require('./platform/audioLinux');
  }

  return require('./platform/audioDarwin');
}

const implementation = selectAudioImplementation();

module.exports = {
  ...implementation,
  selectAudioImplementation,
};
