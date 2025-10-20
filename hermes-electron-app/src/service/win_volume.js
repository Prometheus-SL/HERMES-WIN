const path = require('path');
let native = null;
try {
  native = require(path.join(__dirname, '..', '..', 'native', 'win_volume', 'target', 'release', 'win_volume.node'));
} catch (e) {
  try {
    native = require('win_volume');
  } catch (err) {
    console.warn('Native win_volume addon not available:', err.message || err);
  }
}

module.exports = {
  mute: () => native ? native.mute() : false,
  volume_up: () => native ? native.volume_up() : false,
  volume_down: () => native ? native.volume_down() : false,
};
