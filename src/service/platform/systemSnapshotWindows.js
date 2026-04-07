const { execFile } = require('child_process');

const { getAudioState } = require('../audioControl');
const { buildSnapshot } = require('./systemSnapshotShared');

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

async function execPowerShellJson(command, fallback) {
  try {
    const output = await execPowerShell(command);
    if (!output) return fallback;
    return JSON.parse(output);
  } catch (_error) {
    return fallback;
  }
}

async function getCpuLoadPercent() {
  const cpuLoad = await execPowerShellJson(
    "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average | ConvertTo-Json -Compress",
    0
  );

  return Number.isFinite(Number(cpuLoad)) ? Number(cpuLoad) : 0;
}

async function getDiskUsage() {
  const disks = await execPowerShellJson(
    "Get-CimInstance Win32_LogicalDisk -Filter \"DriveType=3\" | Select-Object @{Name='drive';Expression={$_.DeviceID}}, @{Name='totalBytes';Expression={[double]$_.Size}}, @{Name='freeBytes';Expression={[double]$_.FreeSpace}} | ConvertTo-Json -Compress",
    []
  );

  const items = Array.isArray(disks) ? disks : disks ? [disks] : [];
  return items.map((disk) => {
    const totalBytes = Number(disk.totalBytes) || 0;
    const freeBytes = Number(disk.freeBytes) || 0;
    const usedBytes = Math.max(0, totalBytes - freeBytes);

    return {
      drive: String(disk.drive || ''),
      totalBytes,
      freeBytes,
      usedBytes,
      percent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
    };
  });
}

async function collectSystemSnapshot(mode = 'manual') {
  const [cpuPercent, disks, audio] = await Promise.all([
    getCpuLoadPercent(),
    getDiskUsage(),
    getAudioState(),
  ]);

  return buildSnapshot(mode, cpuPercent, disks, audio, 'win32');
}

module.exports = {
  collectSystemSnapshot,
};
