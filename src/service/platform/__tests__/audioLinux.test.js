const {
  parsePactlSinkList,
  parseWpctlStatusOutput,
  parseWpctlVolumeOutput,
} = require('../audioLinux');

describe('audioLinux parsers', () => {
  test('parses wpctl volume output', () => {
    expect(parseWpctlVolumeOutput('Volume: 0.42 [MUTED]')).toEqual({
      available: true,
      volumePercent: 42,
      muted: true,
    });
  });

  test('parses wpctl sink list', () => {
    const parsed = parseWpctlStatusOutput(`
Audio
 ├─ Devices:
 │      45. Built-in Audio
 ├─ Sinks:
 │  *   46. Built-in Audio Analog Stereo [vol: 0.42]
 │      52. HDMI / DisplayPort 2 Output [vol: 1.00]
 ├─ Sources:
`);

    expect(parsed.defaultOutputId).toBe('46');
    expect(parsed.defaultOutputName).toBe('Built-in Audio Analog Stereo');
    expect(parsed.outputDevices).toHaveLength(2);
  });

  test('parses pactl sink JSON', () => {
    const parsed = parsePactlSinkList(
      JSON.stringify([
        {
          name: 'alsa_output.pci-0000_00_1f.3.analog-stereo',
          description: 'Built-in Audio Analog Stereo',
          mute: false,
          volume: {
            'front-left': {
              value_percent: '65%',
            },
          },
        },
      ]),
      'alsa_output.pci-0000_00_1f.3.analog-stereo'
    );

    expect(parsed.defaultOutputId).toBe('alsa_output.pci-0000_00_1f.3.analog-stereo');
    expect(parsed.defaultOutputName).toBe('Built-in Audio Analog Stereo');
    expect(parsed.volumePercent).toBe(65);
    expect(parsed.outputDevices).toHaveLength(1);
  });
});
