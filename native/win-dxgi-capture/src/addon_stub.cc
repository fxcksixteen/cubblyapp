// Non-Windows fallback: build a no-op N-API module so npm install doesn't fail
// on Linux/macOS dev machines or CI when assembling the JS bundle.

#include <napi.h>

static Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), false);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  return exports;
}

NODE_API_MODULE(win_dxgi_capture, Init)
