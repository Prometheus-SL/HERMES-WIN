const fs = require('fs');
const os = require('os');
const path = require('path');

describe('mediaBridgeManager', () => {
  const originalBaseDir = process.env.HERMES_BASE_DIR;
  let tempDir = null;

  beforeEach(() => {
    jest.resetModules();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-media-bridge-'));
    process.env.HERMES_BASE_DIR = tempDir;
  });

  afterEach(() => {
    if (originalBaseDir) {
      process.env.HERMES_BASE_DIR = originalBaseDir;
    } else {
      delete process.env.HERMES_BASE_DIR;
    }

    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  test('normalizes browser media payloads', () => {
    const MediaBridgeManager = require('../mediaBridgeManager');

    const snapshot = MediaBridgeManager.normalizeMediaUpdate({
      provider: 'youtube',
      canonicalUrl: 'https://www.youtube.com/watch?v=abc123',
      title: 'Demo video',
      artist: 'Prometeo',
      artworkUrl: 'https://i.ytimg.com/vi/abc123/maxresdefault.jpg',
      playbackStatus: 'playing',
      positionMs: 12345,
      durationMs: 54321,
      canNext: true,
    }, 'service');

    expect(snapshot.dataType).toBe('media_update');
    expect(snapshot.media.available).toBe(true);
    expect(snapshot.media.provider).toBe('youtube');
    expect(snapshot.media.sourceAppName).toBe('YouTube');
    expect(snapshot.media.title).toBe('Demo video');
    expect(snapshot.media.playbackStatus).toBe('playing');
    expect(snapshot.media.positionMs).toBe(12345);
    expect(snapshot.media.canNext).toBe(true);
  });

  test('queues commands when media telemetry is enabled', () => {
    const { saveRuntimeState } = require('../runtimeState');
    const MediaBridgeManager = require('../mediaBridgeManager');

    saveRuntimeState({
      mediaTelemetryEnabled: true,
    });

    const manager = new MediaBridgeManager({ mode: 'service', platform: 'win32' });
    const result = manager.queueCommand('media_toggle_playback');

    expect(result.queued).toBe(true);
    expect(result.commandId).toBeTruthy();
    expect(manager.pendingCommands).toHaveLength(1);
    expect(manager.pendingCommands[0].command).toBe('media_toggle_playback');
  });
});
