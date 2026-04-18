// Non-Windows fallback: build a no-op N-API module so npm install doesn't fail
// on Linux/macOS dev machines or CI when assembling the JS bundle.

#include <napi.h>

static Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), false);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));
  return exports;
}

NODE_API_MODULE(win_audio_capture, Init)
