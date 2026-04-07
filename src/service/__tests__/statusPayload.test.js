const { buildStatusPayload } = require('../statusPayload');

describe('buildStatusPayload', () => {
  test('normalizes Windows service metadata', () => {
    const payload = buildStatusPayload({
      platform: 'win32',
      runtime: { lifecycle: 'running' },
      runtimeState: { serverUrl: 'https://example.com' },
      service: {
        installed: true,
        running: true,
        status: 'running',
      },
      hasStoredCredentials: true,
    });

    expect(payload.platform).toBe('win32');
    expect(payload.capabilities.daemonControl).toBe(true);
    expect(payload.service.kind).toBe('windows-service');
    expect(payload.service.supported).toBe(true);
    expect(payload.service.running).toBe(true);
  });

  test('preserves Linux systemd metadata', () => {
    const payload = buildStatusPayload({
      platform: 'linux',
      service: {
        kind: 'systemd-user',
        displayName: 'Linux user service',
        supported: true,
        installed: true,
        running: false,
        status: 'inactive',
        actions: {
          install: true,
          start: true,
          stop: true,
          uninstall: true,
        },
      },
    });

    expect(payload.capabilities.lockScreen).toBe(true);
    expect(payload.service.kind).toBe('systemd-user');
    expect(payload.service.displayName).toBe('Linux user service');
    expect(payload.service.supported).toBe(true);
    expect(payload.service.installed).toBe(true);
  });

  test('falls back to manual mode on macOS', () => {
    const payload = buildStatusPayload({
      platform: 'darwin',
      service: {
        status: 'manual-only',
      },
    });

    expect(payload.capabilities.daemonControl).toBe(false);
    expect(payload.service.kind).toBe('manual');
    expect(payload.service.supported).toBe(false);
    expect(payload.service.actions.install).toBe(false);
  });
});
