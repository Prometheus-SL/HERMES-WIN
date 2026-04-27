const path = require('path');

describe('Hermes channel paths', () => {
  const previousChannel = process.env.HERMES_CHANNEL;
  const previousHermesEnv = process.env.HERMES_ENV;
  const previousBaseDir = process.env.HERMES_BASE_DIR;

  afterEach(() => {
    jest.resetModules();
    if (previousChannel === undefined) delete process.env.HERMES_CHANNEL;
    else process.env.HERMES_CHANNEL = previousChannel;
    if (previousHermesEnv === undefined) delete process.env.HERMES_ENV;
    else process.env.HERMES_ENV = previousHermesEnv;
    if (previousBaseDir === undefined) delete process.env.HERMES_BASE_DIR;
    else process.env.HERMES_BASE_DIR = previousBaseDir;
  });

  function loadPaths(env = {}) {
    jest.resetModules();
    delete process.env.HERMES_CHANNEL;
    delete process.env.HERMES_ENV;
    delete process.env.HERMES_BASE_DIR;
    Object.assign(process.env, env);
    return require('../paths');
  }

  test('uses production identities by default', () => {
    const paths = loadPaths();

    expect(paths.getHermesChannel()).toBe('pro');
    expect(paths.getWindowsServiceName()).toBe('HermesNodeAgent');
    expect(paths.getCredentialServiceName()).toBe('HERMES-WIN-Agent');
    expect(paths.SYSTEMD_SERVICE_NAME).toBe('hermes-agent.service');
    expect(paths.getRuntimeStateFilePath('win32')).toBe(
      path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'HERMES-WIN', 'runtime-state.json')
    );
    expect(paths.getRuntimeStateFilePath('linux')).toMatch(
      /[\\/]hermes[\\/]runtime-state\.json$/
    );
    expect(paths.getRuntimeStateFilePath('darwin')).toMatch(
      /[\\/]Prometeo Hermes[\\/]runtime-state\.json$/
    );
  });

  test('uses separate local identities when HERMES_CHANNEL is local', () => {
    const paths = loadPaths({ HERMES_CHANNEL: 'local' });

    expect(paths.getHermesChannel()).toBe('local');
    expect(paths.getWindowsServiceName()).toBe('HermesNodeAgentLocal');
    expect(paths.getCredentialServiceName()).toBe('HERMES-WIN-Agent-Local');
    expect(paths.SYSTEMD_SERVICE_NAME).toBe('hermes-agent-local.service');
    expect(paths.getRuntimeStateFilePath('win32')).toBe(
      path.join(
        process.env.PROGRAMDATA || 'C:\\ProgramData',
        'HERMES-WIN-LOCAL',
        'runtime-state.json'
      )
    );
    expect(paths.getRuntimeStateFilePath('linux')).toMatch(
      /[\\/]hermes-local[\\/]runtime-state\.json$/
    );
    expect(paths.getRuntimeStateFilePath('darwin')).toMatch(
      /[\\/]Prometeo Hermes Local[\\/]runtime-state\.json$/
    );
  });

  test('keeps local service identity when HERMES_BASE_DIR overrides storage', () => {
    const customBaseDir = path.join('C:\\tmp', 'hermes-custom-local');
    const paths = loadPaths({
      HERMES_CHANNEL: 'local',
      HERMES_BASE_DIR: customBaseDir,
    });

    expect(paths.getWindowsServiceName()).toBe('HermesNodeAgentLocal');
    expect(paths.SYSTEMD_SERVICE_NAME).toBe('hermes-agent-local.service');
    expect(paths.getRuntimeStateFilePath('win32')).toBe(
      path.join(customBaseDir, 'runtime-state.json')
    );
  });
});
