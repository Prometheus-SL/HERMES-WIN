const { commandExists, execFileText } = require('./commandUtils');
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

function normalizePercent(value) {
  const cleaned = String(value || '')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function parseWpctlVolumeOutput(output) {
  const text = String(output || '').trim();
  const match = text.match(/Volume:\s*([0-9]+(?:[.,][0-9]+)?)/i);
  const rawVolume = match ? Number(match[1].replace(',', '.')) : 0;
  const volumePercent =
    rawVolume <= 1 ? Math.round(rawVolume * 100) : Math.round(rawVolume);

  return {
    available: Boolean(match),
    volumePercent: Math.max(0, Math.min(100, volumePercent || 0)),
    muted: /\bMUTED\b/i.test(text),
  };
}

function parseWpctlStatusOutput(output) {
  const devices = [];
  let inSinksSection = false;

  for (const line of String(output || '').split(/\r?\n/)) {
    const stripped = line.replace(/^[\s│├└─]+/, '').trim();
    if (!stripped) {
      continue;
    }

    if (/^[A-Za-z].*:\s*$/.test(stripped)) {
      inSinksSection = stripped === 'Sinks:';
      continue;
    }

    if (!inSinksSection) {
      continue;
    }

    const normalized = stripped.replace(/^\*\s*/, '* ').trim();
    const match = normalized.match(
      /^(\*)?\s*(\d+)\.\s+(.+?)(?:\s+\[vol:[^\]]+\])?$/
    );
    if (!match) {
      continue;
    }

    const isDefault = Boolean(match[1]);
    const id = String(match[2]);
    const name = String(match[3] || '').trim();
    devices.push({
      id,
      name,
      isDefault,
      isDefaultCommunication: false,
      type: 'Playback',
    });
  }

  const defaultDevice = devices.find((device) => device.isDefault) || devices[0] || null;
  return {
    outputDevices: devices,
    defaultOutputId: defaultDevice?.id || '',
    defaultOutputName: defaultDevice?.name || '',
  };
}

function parsePactlVolumePercent(volume = {}) {
  for (const value of Object.values(volume)) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    if (value.value_percent) {
      return normalizePercent(value.value_percent);
    }
  }

  return 0;
}

function parsePactlSinkList(output, defaultSinkName = '') {
  const parsed = JSON.parse(String(output || '[]'));
  const sinks = Array.isArray(parsed) ? parsed : [parsed];

  const devices = sinks.map((sink) => {
    const id = String(sink.name || sink.index || '');
    const name = String(sink.description || sink.name || `Sink ${sink.index || ''}`).trim();
    return {
      id,
      name,
      isDefault: id === defaultSinkName,
      isDefaultCommunication: false,
      type: 'Playback',
      volumePercent: parsePactlVolumePercent(sink.volume),
      muted: Boolean(sink.mute),
    };
  });

  const defaultDevice =
    devices.find((device) => device.isDefault) || devices[0] || null;

  return {
    outputDevices: devices.map(({ volumePercent, muted, ...device }) => device),
    defaultOutputId: defaultDevice?.id || '',
    defaultOutputName: defaultDevice?.name || '',
    volumePercent: defaultDevice?.volumePercent || 0,
    muted: Boolean(defaultDevice?.muted),
  };
}

async function runWpctl(args) {
  return execFileText('wpctl', args, { timeout: 15000 });
}

async function runPactl(args) {
  return execFileText('pactl', args, { timeout: 15000 });
}

function getUnavailableState(message) {
  return {
    ...AUDIO_UNAVAILABLE_STATE,
    error: message,
  };
}

function ensureAudioAvailable() {
  if (!commandExists('wpctl') && !commandExists('pactl')) {
    throw createFeatureUnavailableError(
      'audio',
      'Neither wpctl nor pactl is available on this Linux system.'
    );
  }
}

async function getAudioStateFromPactl() {
  const [defaultSinkName, rawSinks] = await Promise.all([
    runPactl(['get-default-sink']).catch(() => ''),
    runPactl(['-f', 'json', 'list', 'sinks']),
  ]);

  const parsed = parsePactlSinkList(rawSinks, String(defaultSinkName || '').trim());
  return {
    available: parsed.outputDevices.length > 0,
    volumePercent: parsed.volumePercent || 0,
    muted: Boolean(parsed.muted),
    defaultOutputId: parsed.defaultOutputId,
    defaultOutputName: parsed.defaultOutputName,
    outputDevices: parsed.outputDevices,
    error: parsed.outputDevices.length > 0 ? null : 'No playback devices were detected.',
  };
}

async function getAudioStateFromWpctl() {
  const [volumeOutput, statusOutput] = await Promise.all([
    runWpctl(['get-volume', '@DEFAULT_AUDIO_SINK@']),
    runWpctl(['status', '--name']),
  ]);

  const volumeState = parseWpctlVolumeOutput(volumeOutput);
  const deviceState = parseWpctlStatusOutput(statusOutput);

  if (!deviceState.outputDevices.length && commandExists('pactl')) {
    return getAudioStateFromPactl();
  }

  return {
    available: volumeState.available || deviceState.outputDevices.length > 0,
    volumePercent: volumeState.volumePercent,
    muted: volumeState.muted,
    defaultOutputId: deviceState.defaultOutputId,
    defaultOutputName: deviceState.defaultOutputName,
    outputDevices: deviceState.outputDevices,
    error:
      volumeState.available || deviceState.outputDevices.length > 0
        ? null
        : 'No playback devices were detected.',
  };
}

async function getAudioState() {
  try {
    if (commandExists('wpctl')) {
      return await getAudioStateFromWpctl();
    }

    if (commandExists('pactl')) {
      return await getAudioStateFromPactl();
    }
  } catch (error) {
    return getUnavailableState(error.message || String(error));
  }

  return getUnavailableState(
    'feature_unavailable: Neither wpctl nor pactl is available on this Linux system.'
  );
}

async function setVolume(level) {
  ensureAudioAvailable();
  const safeLevel = Math.max(0, Math.min(100, Number(level) || 0));

  if (commandExists('wpctl')) {
    await runWpctl(['set-volume', '@DEFAULT_AUDIO_SINK@', `${safeLevel}%`]);
    return getAudioState();
  }

  await runPactl(['set-sink-volume', '@DEFAULT_SINK@', `${safeLevel}%`]);
  return getAudioState();
}

async function setMuted(muted) {
  ensureAudioAvailable();

  if (commandExists('wpctl')) {
    await runWpctl(['set-mute', '@DEFAULT_AUDIO_SINK@', muted ? '1' : '0']);
    return getAudioState();
  }

  await runPactl(['set-sink-mute', '@DEFAULT_SINK@', muted ? '1' : '0']);
  return getAudioState();
}

async function setDefaultOutputDevice(deviceId) {
  if (!deviceId) {
    throw new Error('deviceId is required');
  }

  ensureAudioAvailable();

  if (commandExists('wpctl')) {
    await runWpctl(['set-default', String(deviceId)]);
    return getAudioState();
  }

  await runPactl(['set-default-sink', String(deviceId)]);
  return getAudioState();
}

async function adjustVolume(delta) {
  const current = await getAudioState();
  if (!current.available) {
    throw new Error(current.error || 'Audio control is not available');
  }

  return setVolume((current.volumePercent || 0) + Number(delta || 0));
}

module.exports = {
  AUDIO_UNAVAILABLE_STATE,
  capabilities: {
    audio: true,
    audioOutputs: true,
  },
  normalizePercent,
  parseWpctlVolumeOutput,
  parseWpctlStatusOutput,
  parsePactlSinkList,
  getAudioState,
  setVolume,
  setMuted,
  setDefaultOutputDevice,
  adjustVolume,
};
