const os = require('os');
const { execFile } = require('child_process');
const { getAudioState } = require('./audioControl');

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

function getPrimaryNetworkInfo() {
  const interfaces = os.networkInterfaces();
  const entries = [];

  for (const [name, addresses] of Object.entries(interfaces)) {
    for (const address of addresses || []) {
      entries.push({
        name,
        address: address.address,
        family: address.family,
        internal: Boolean(address.internal),
        mac: address.mac,
      });
    }
  }

  const primary = entries.find(
    (item) => !item.internal && item.family === 'IPv4' && item.address
  ) || entries.find((item) => !item.internal && item.address) || null;

  return {
    ip: primary?.address || '',
    mac: primary?.mac || '',
    interfaces: entries,
  };
}

async function collectSystemSnapshot(mode = 'manual') {
  const cpus = os.cpus() || [];
  const cpu = cpus[0] || { model: 'Unknown CPU', speed: 0 };
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = Math.max(0, totalMemory - freeMemory);
  const network = getPrimaryNetworkInfo();
  const [cpuPercent, disks, audio] = await Promise.all([
    getCpuLoadPercent(),
    getDiskUsage(),
    getAudioState(),
  ]);

  return {
    dataType: 'system_status',
    schemaVersion: 1,
    sampledAt: new Date().toISOString(),
    mode,
    system: {
      hostname: os.hostname(),
      username: os.userInfo().username,
      uptimeSeconds: os.uptime(),
      os: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
      },
    },
    resources: {
      cpu: {
        model: cpu.model,
        cores: cpus.length,
        speedMHz: cpu.speed || 0,
        percent: cpuPercent,
      },
      memory: {
        totalBytes: totalMemory,
        freeBytes: freeMemory,
        usedBytes: usedMemory,
        percent: totalMemory > 0 ? Math.round((usedMemory / totalMemory) * 100) : 0,
      },
      disks,
    },
    network: {
      ip: network.ip,
      mac: network.mac,
      interfaces: network.interfaces,
    },
    audio,
    tags: ['hermes', 'windows'],
  };
}

module.exports = {
  collectSystemSnapshot,
};
