const os = require('os');

const { execFileText } = require('./commandUtils');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculateCpuTotals(snapshot) {
  return snapshot.map((cpu) => {
    const times = cpu.times || {};
    const idle = Number(times.idle) || 0;
    const total = Object.values(times).reduce(
      (sum, value) => sum + (Number(value) || 0),
      0
    );

    return { idle, total };
  });
}

async function sampleCpuLoadPercent(sampleMs = 200) {
  const first = calculateCpuTotals(os.cpus() || []);
  await sleep(sampleMs);
  const second = calculateCpuTotals(os.cpus() || []);

  let totalDelta = 0;
  let idleDelta = 0;

  for (let index = 0; index < Math.min(first.length, second.length); index += 1) {
    totalDelta += Math.max(0, second[index].total - first[index].total);
    idleDelta += Math.max(0, second[index].idle - first[index].idle);
  }

  if (totalDelta <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(100, Math.round(((totalDelta - idleDelta) / totalDelta) * 100)));
}

function parseDfOutput(output) {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.slice(1).map((line) => {
    const columns = line.split(/\s+/);
    const mount = columns[5] || columns[0] || '';
    const totalBytes = (Number(columns[1]) || 0) * 1024;
    const usedBytes = (Number(columns[2]) || 0) * 1024;
    const freeBytes = (Number(columns[3]) || 0) * 1024;

    return {
      drive: mount,
      totalBytes,
      freeBytes,
      usedBytes,
      percent: totalBytes > 0 ? Math.round((usedBytes / totalBytes) * 100) : 0,
    };
  });
}

async function getUnixDiskUsage() {
  const output = await execFileText('df', ['-kP']);
  return parseDfOutput(output);
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

  const primary =
    entries.find((item) => !item.internal && item.family === 'IPv4' && item.address) ||
    entries.find((item) => !item.internal && item.address) ||
    null;

  return {
    ip: primary?.address || '',
    mac: primary?.mac || '',
    interfaces: entries,
  };
}

function buildSnapshot(mode, cpuPercent, disks, audio, platform = os.platform()) {
  const cpus = os.cpus() || [];
  const cpu = cpus[0] || { model: 'Unknown CPU', speed: 0 };
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = Math.max(0, totalMemory - freeMemory);
  const network = getPrimaryNetworkInfo();

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
        platform,
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
    tags: ['hermes', platform],
  };
}

module.exports = {
  buildSnapshot,
  getPrimaryNetworkInfo,
  getUnixDiskUsage,
  parseDfOutput,
  sampleCpuLoadPercent,
};
