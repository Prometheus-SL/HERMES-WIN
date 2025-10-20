# Native Addon for Hermes Electron App

This directory contains the native bindings for the Hermes Electron application. The native addon is written in C++ and can be used to extend the functionality of the application with native code.

## Building the Native Addon

To build the native addon, you will need to have the following prerequisites installed:

- Node.js (version >= 12.x)
- npm (Node package manager)
- Python (version 2.7 or 3.x)
- A C++ compiler (such as GCC or Visual Studio)

### Steps to Build

1. Navigate to the `src/native` directory:
   ```
   cd src/native
   ```

2. Install the necessary dependencies:
   ```
   npm install
   ```

3. Build the addon using the `binding.gyp` configuration:
   ```
   node-gyp rebuild
   ```

## Usage

Once the addon is built, you can require it in your Electron application. Make sure to load the addon in the appropriate context (e.g., in the main process or the preload script).

Example of requiring the addon in your code:
```javascript
const myAddon = require('./native/build/Release/myaddon');
```

## License

This project is licensed under the GPL-2.0-or-later license. Please refer to the LICENSE file for more details.