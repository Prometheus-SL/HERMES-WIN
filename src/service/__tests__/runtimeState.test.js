const fs = require('fs');
const os = require('os');
const path = require('path');

describe('runtimeState', () => {
  let tmpDir;
  let previousBaseDir;

  beforeEach(() => {
    jest.resetModules();
    previousBaseDir = process.env.HERMES_BASE_DIR;
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-runtime-'));
    process.env.HERMES_BASE_DIR = tmpDir;
  });

  afterEach(() => {
    jest.resetModules();
    if (previousBaseDir === undefined) {
      delete process.env.HERMES_BASE_DIR;
    } else {
      process.env.HERMES_BASE_DIR = previousBaseDir;
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('can force reload runtime state written by another process', () => {
    const runtimeState = require('../runtimeState');
    runtimeState.ensureRuntimeDir();

    fs.writeFileSync(
      runtimeState.RUNTIME_STATE_FILE,
      JSON.stringify({
        agentId: 'PC-FIRST',
        serverUrl: 'https://first.example',
      })
    );

    expect(runtimeState.loadRuntimeState().serverUrl).toBe('https://first.example');

    fs.writeFileSync(
      runtimeState.RUNTIME_STATE_FILE,
      JSON.stringify({
        agentId: 'PC-SECOND',
        serverUrl: 'https://second.example',
      })
    );

    expect(runtimeState.loadRuntimeState({ force: true }).serverUrl).toBe('https://second.example');
  });
});
