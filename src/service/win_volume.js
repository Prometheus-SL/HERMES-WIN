const path = require('path');
let native = null;

function getNativeCandidates() {
    const candidates = [
        path.join(__dirname, '..', 'native', 'win_volume', 'target', 'release', 'win_volume.node'),
    ];

    if (process.resourcesPath) {
        candidates.push(
            path.join(process.resourcesPath, 'app.asar.unpacked', 'src', 'native', 'win_volume', 'target', 'release', 'win_volume.node')
        );
    }

    return candidates;
}

for (const candidate of getNativeCandidates()) {
    try {
        native = require(candidate);
        break;
    } catch (_error) {
        // Try the next packaged/native location.
    }
}

if (!native) {
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
