{
  "targets": [
    {
      "target_name": "win_dxgi_capture",
      "conditions": [
        ["OS=='win'", {
          "sources": [
            "src/addon.cc",
            "src/window_capture.cc"
          ],
          "include_dirs": [
            "<!(node -p \"require('node-addon-api').include_dir\")"
          ],
          "defines": [
            "NAPI_DISABLE_CPP_EXCEPTIONS",
            "NOMINMAX",
            "WIN32_LEAN_AND_MEAN",
            "_WIN32_WINNT=0x0A00"
          ],
          "cflags!": [ "-fno-exceptions" ],
          "cflags_cc!": [ "-fno-exceptions" ],
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": [ "/std:c++20", "/EHsc", "/bigobj" ]
            }
          },
          "libraries": [
            "-lwindowsapp.lib",
            "-ld3d11.lib",
            "-ldxgi.lib",
            "-ldxguid.lib",
            "-lole32.lib",
            "-lruntimeobject.lib"
          ]
        }, {
          "sources": [ "src/addon_stub.cc" ],
          "include_dirs": [
            "<!(node -p \"require('node-addon-api').include_dir\")"
          ],
          "defines": [ "NAPI_DISABLE_CPP_EXCEPTIONS" ]
        }]
      ]
    }
  ]
}
