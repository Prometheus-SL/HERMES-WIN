const { createFeatureUnavailableError } = require('./errors');

const AUDIO_UNAVAILABLE_STATE = Object.freeze({
  available: false,
  volumePercent: 0,
  muted: false,
  defaultOutputId: '',
  defaultOutputName: '',
  outputDevices: [],
  error: null,
});

async function getAudioState() {
  return {
    ...AUDIO_UNAVAILABLE_STATE,
    error: 'feature_unavailable: Audio control is not implemented on macOS yet.',
  };
}

function unsupported() {
  throw createFeatureUnavailableError(
    'audio',
    'Audio control is not implemented on macOS yet.'
  );
}

module.exports = {
  AUDIO_UNAVAILABLE_STATE,
  capabilities: {
    audio: false,
    audioOutputs: false,
  },
  getAudioState,
  setVolume: unsupported,
  setMuted: unsupported,
  setDefaultOutputDevice: unsupported,
  adjustVolume: unsupported,
  stepVolume: unsupported,
};
