const { execFile } = require('child_process');

const AUDIO_UNAVAILABLE_STATE = Object.freeze({
  available: false,
  volumePercent: 0,
  muted: false,
  defaultOutputId: '',
  defaultOutputName: '',
  outputDevices: [],
  error: null,
});

function execPowerShell(command, timeout = 15000) {
  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', command],
      { windowsHide: true, timeout },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message || 'PowerShell execution failed'));
          return;
        }

        resolve(String(stdout || '').trim());
      }
    );
  });
}

function toPowerShellString(value) {
  return `'${String(value || '').replace(/'/g, "''")}'`;
}

function buildAudioSnapshotScript() {
  return `
$devices = @(Get-AudioDevice -List | Where-Object { $_.Type -eq 'Playback' } | Sort-Object Index)
$default = Get-AudioDevice -Playback
$volumeText = [string](Get-AudioDevice -PlaybackVolume)
$muted = [bool](Get-AudioDevice -PlaybackMute)
[pscustomobject]@{
  available = $true
  volumeText = $volumeText
  muted = $muted
  defaultOutputId = if ($default) { [string]$default.ID } else { '' }
  defaultOutputName = if ($default) { [string]$default.Name } else { '' }
  outputDevices = @($devices | ForEach-Object {
    [pscustomobject]@{
      id = [string]$_.ID
      name = [string]$_.Name
      index = [int]$_.Index
      type = [string]$_.Type
      isDefault = [bool]$_.Default
      isDefaultCommunication = [bool]$_.DefaultCommunication
    }
  })
} | ConvertTo-Json -Compress -Depth 6
`;
}

function parseVolumePercent(value) {
  const cleaned = String(value || '')
    .replace(',', '.')
    .replace(/[^0-9.\-]/g, '');
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(parsed)));
}

function normalizeAudioState(raw, fallbackError = null) {
  if (!raw || raw.available === false) {
    return {
      ...AUDIO_UNAVAILABLE_STATE,
      error: raw?.error || fallbackError,
    };
  }

  const devices = Array.isArray(raw.outputDevices) ? raw.outputDevices : [];
  const defaultOutputId = String(raw.defaultOutputId || '');

  return {
    available: true,
    volumePercent: parseVolumePercent(raw.volumePercent ?? raw.volumeText),
    muted: Boolean(raw.muted),
    defaultOutputId,
    defaultOutputName: String(raw.defaultOutputName || ''),
    outputDevices: devices.map((device) => ({
      id: String(device.id || ''),
      name: String(device.name || 'Unknown device'),
      index: Number(device.index) || 0,
      type: String(device.type || 'Playback'),
      isDefault:
        Boolean(device.isDefault) || String(device.id || '') === defaultOutputId,
      isDefaultCommunication: Boolean(device.isDefaultCommunication),
    })),
    error: null,
  };
}

async function runAudioScript(script, { timeout = 15000, throwOnError = false } = {}) {
  const command = `
$ErrorActionPreference = 'Stop'
Import-Module AudioDeviceCmdlets -ErrorAction Stop
${script}
`;

  try {
    const output = await execPowerShell(command, timeout);
    if (!output) {
      return normalizeAudioState(null, 'Audio command returned no data');
    }

    try {
      return normalizeAudioState(JSON.parse(output));
    } catch (_parseError) {
      const jsonLine = output
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .reverse()
        .find((line) => line.startsWith('{') || line.startsWith('['));

      if (!jsonLine) {
        throw _parseError;
      }

      return normalizeAudioState(JSON.parse(jsonLine));
    }
  } catch (error) {
    if (throwOnError) {
      throw error;
    }

    return normalizeAudioState(null, error.message || String(error));
  }
}

async function getAudioState() {
  return runAudioScript(buildAudioSnapshotScript());
}

async function setVolume(level) {
  const safeLevel = Math.max(0, Math.min(100, Number(level) || 0));
  return runAudioScript(
    `
$null = Set-AudioDevice -PlaybackVolume ${safeLevel}
${buildAudioSnapshotScript()}
`,
    { throwOnError: true }
  );
}

async function setMuted(muted) {
  return runAudioScript(
    `
$null = Set-AudioDevice -PlaybackMute ${muted ? '$true' : '$false'}
${buildAudioSnapshotScript()}
`,
    { throwOnError: true }
  );
}

async function setDefaultOutputDevice(deviceId) {
  if (!deviceId) {
    throw new Error('deviceId is required');
  }

  return runAudioScript(
    `
$null = Set-AudioDevice -ID ${toPowerShellString(deviceId)}
${buildAudioSnapshotScript()}
`,
    { throwOnError: true }
  );
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
  parseVolumePercent,
  normalizeAudioState,
  getAudioState,
  setVolume,
  setMuted,
  setDefaultOutputDevice,
  adjustVolume,
};
