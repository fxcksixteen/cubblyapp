# Prebuilt native binaries for win-dxgi-capture land here, same as the
# win-audio-capture module:
#
#   prebuilds/win32-x64/win-dxgi-capture.node
#
# electron-builder picks them up via the asarUnpack rule in package.json so they
# ship inside the installed app at:
#
#   resources/app.asar.unpacked/native/win-dxgi-capture/prebuilds/win32-x64/
#
# index.js scans this directory for ANY .node file at runtime (it does not rely
# on node-gyp-build's strict `electron.napi.node` naming — see the comment in
# win-audio-capture/index.js for why).
#
# Rebuild locally with:
#   cd native/win-dxgi-capture
#   npx node-gyp rebuild --runtime=electron --target=<electron version> \
#       --dist-url=https://electronjs.org/headers
