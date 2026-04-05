{
  "targets": {
    "node": {
      "target_defaults": {
        "cflags": ["-fno-strict-aliasing"],
        "default_configuration": "Release"
      },
      "variables": {
        "node_root": "<!(node -e \"console.log(require('node-addon-api').include)\")",
        "node_gyp_dir": "<!(node -e \"console.log(require('node-gyp').gyp_dir)\")"
      },
      "sources": [
        "src/addon.cc"
      ]
    }
  }
}