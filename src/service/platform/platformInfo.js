function getPlatformCapabilities(platform = process.platform) {
  if (platform === 'win32') {
    return {
      audio: true,
      audioOutputs: true,
      sleep: true,
      hibernate: true,
      lockScreen: true,
      daemonControl: true,
    };
  }

  if (platform === 'linux') {
    return {
      audio: true,
      audioOutputs: true,
      sleep: true,
      hibernate: true,
      lockScreen: true,
      daemonControl: true,
    };
  }

  return {
    audio: false,
    audioOutputs: false,
    sleep: false,
    hibernate: false,
    lockScreen: false,
    daemonControl: false,
  };
}

module.exports = {
  getPlatformCapabilities,
};
