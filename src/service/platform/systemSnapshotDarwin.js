const { getAudioState } = require('../audioControl');
const {
  buildSnapshot,
  getUnixDiskUsage,
  parseDfOutput,
  sampleCpuLoadPercent,
} = require('./systemSnapshotShared');

async function collectSystemSnapshot(mode = 'manual') {
  const [cpuPercent, disks, audio] = await Promise.all([
    sampleCpuLoadPercent(),
    getUnixDiskUsage(),
    getAudioState(),
  ]);

  return buildSnapshot(mode, cpuPercent, disks, audio, 'darwin');
}

module.exports = {
  parseDfOutput,
  collectSystemSnapshot,
};
