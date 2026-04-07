const { selectAudioImplementation } = require('../audioControl');
const { selectSystemSnapshotImplementation } = require('../systemSnapshot');
const { selectSystemCommandsImplementation } = require('../platform/systemCommands');

describe('platform selectors', () => {
  test('selects Linux audio implementation', () => {
    const implementation = selectAudioImplementation('linux');
    expect(typeof implementation.getAudioState).toBe('function');
    expect(implementation.capabilities.audio).toBe(true);
  });

  test('selects macOS system commands implementation', () => {
    const implementation = selectSystemCommandsImplementation('darwin');
    expect(typeof implementation.openApp).toBe('function');
    expect(implementation.capabilities.lockScreen).toBe(false);
  });

  test('selects Windows snapshot implementation', () => {
    const implementation = selectSystemSnapshotImplementation('win32');
    expect(typeof implementation.collectSystemSnapshot).toBe('function');
  });
});
