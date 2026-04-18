# Prebuilt native binaries for win-audio-capture land here from the
# `Prebuild Windows native addon` GitHub Actions workflow:
#
#   prebuilds/win32-x64/electron.napi.node
#
# electron-builder picks them up via the asarUnpack rule in package.json so they
# ship inside the installed app at:
#
#   resources/app.asar.unpacked/native/win-audio-capture/prebuilds/win32-x64/
#
# `node-gyp-build` (in index.js) finds the right binary at runtime.
