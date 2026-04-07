const { parseDfOutput } = require('../systemSnapshotLinux');

describe('systemSnapshotLinux', () => {
  test('parses df output into disk usage entries', () => {
    const parsed = parseDfOutput(`
Filesystem     1024-blocks      Used Available Capacity Mounted on
/dev/nvme0n1p2    976490576 210000000 716490576      23% /
tmpfs               8082404         0   8082404       0% /run/user/1000
`);

    expect(parsed[0]).toEqual({
      drive: '/',
      totalBytes: 999926349824,
      freeBytes: 733686349824,
      usedBytes: 215040000000,
      percent: 22,
    });
    expect(parsed[1].drive).toBe('/run/user/1000');
  });
});
