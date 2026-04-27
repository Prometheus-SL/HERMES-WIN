describe('service channel identities', () => {
  const previousChannel = process.env.HERMES_CHANNEL;
  const previousBaseDir = process.env.HERMES_BASE_DIR;

  afterEach(() => {
    jest.resetModules();
    if (previousChannel === undefined) delete process.env.HERMES_CHANNEL;
    else process.env.HERMES_CHANNEL = previousChannel;
    if (previousBaseDir === undefined) delete process.env.HERMES_BASE_DIR;
    else process.env.HERMES_BASE_DIR = previousBaseDir;
  });

  function loadWithLocalChannel(modulePath) {
    jest.resetModules();
    process.env.HERMES_CHANNEL = 'local';
    delete process.env.HERMES_BASE_DIR;
    return require(modulePath);
  }

  test('Windows service constants use the local service name', () => {
    const serviceWindows = loadWithLocalChannel('../serviceWindows');

    expect(serviceWindows.SERVICE_NAME).toBe('HermesNodeAgentLocal');
    expect(serviceWindows.SERVICE_INTERNAL_NAME).toBe('hermesnodeagentlocal.exe');
  });

  test('Linux service metadata uses the local systemd unit', () => {
    const serviceLinux = loadWithLocalChannel('../platform/serviceLinux');

    expect(serviceLinux.buildStatus().internalName).toBe('hermes-agent-local.service');
  });
});
