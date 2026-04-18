#ifdef _WIN32

#include <napi.h>

#include <memory>
#include <mutex>
#include <unordered_map>

#include "process_loopback_capture.h"

namespace {

// Map handle (int) -> capture instance. Renderer holds the handle via JS Number.
std::mutex g_mutex;
uint32_t g_nextHandle = 1;
std::unordered_map<uint32_t, std::unique_ptr<cubbly::ProcessLoopbackCapture>> g_captures;

// One ThreadSafeFunction per active capture so we can deliver PCM buffers to JS
// without blocking the audio thread.
std::unordered_map<uint32_t, Napi::ThreadSafeFunction> g_callbacks;

// Latest format reported by an active capture (for getFormat()).
cubbly::PcmFormat g_lastFormat{};

Napi::Value StartCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "startCapture(pid: number, onPcm: function)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  DWORD pid = static_cast<DWORD>(info[0].As<Napi::Number>().Uint32Value());
  Napi::Function jsCb = info[1].As<Napi::Function>();

  uint32_t handle;
  {
    std::lock_guard<std::mutex> lk(g_mutex);
    handle = g_nextHandle++;
  }

  auto tsfn = Napi::ThreadSafeFunction::New(
      env, jsCb, "cubbly-pcm-callback",
      0,   // unlimited queue
      1);  // single thread

  auto capture = std::make_unique<cubbly::ProcessLoopbackCapture>();

  std::string err;
  bool ok = capture->Start(
      pid,
      [handle](const uint8_t* data, size_t bytes, const cubbly::PcmFormat& fmt) {
        // Copy into a heap buffer; JS owns it after delivery.
        auto* copy = new std::vector<uint8_t>(data, data + bytes);
        Napi::ThreadSafeFunction tsfn;
        {
          std::lock_guard<std::mutex> lk(g_mutex);
          auto it = g_callbacks.find(handle);
          if (it == g_callbacks.end()) { delete copy; return; }
          tsfn = it->second;
          g_lastFormat = fmt;
        }
        auto status = tsfn.BlockingCall(
            copy, [](Napi::Env env, Napi::Function cb, std::vector<uint8_t>* buf) {
              auto napiBuf = Napi::Buffer<uint8_t>::Copy(env, buf->data(), buf->size());
              delete buf;
              cb.Call({ napiBuf });
            });
        if (status != napi_ok) delete copy;
      },
      err);

  if (!ok) {
    tsfn.Release();
    Napi::Error::New(env, err.empty() ? "Capture start failed" : err)
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  {
    std::lock_guard<std::mutex> lk(g_mutex);
    g_captures.emplace(handle, std::move(capture));
    g_callbacks.emplace(handle, std::move(tsfn));
    g_lastFormat = g_captures[handle]->Format();
  }

  return Napi::Number::New(env, handle);
}

Napi::Value StopCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "stopCapture(handle: number)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  uint32_t handle = info[0].As<Napi::Number>().Uint32Value();

  std::unique_ptr<cubbly::ProcessLoopbackCapture> cap;
  Napi::ThreadSafeFunction tsfn;
  {
    std::lock_guard<std::mutex> lk(g_mutex);
    auto cit = g_captures.find(handle);
    if (cit != g_captures.end()) {
      cap = std::move(cit->second);
      g_captures.erase(cit);
    }
    auto fit = g_callbacks.find(handle);
    if (fit != g_callbacks.end()) {
      tsfn = std::move(fit->second);
      g_callbacks.erase(fit);
    }
  }
  if (cap) cap->Stop();
  if (tsfn) tsfn.Release();
  return env.Undefined();
}

Napi::Value GetFormat(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (g_lastFormat.sampleRate == 0) return env.Null();
  Napi::Object o = Napi::Object::New(env);
  o.Set("sampleRate", Napi::Number::New(env, g_lastFormat.sampleRate));
  o.Set("channels", Napi::Number::New(env, g_lastFormat.channels));
  o.Set("bitsPerSample", Napi::Number::New(env, g_lastFormat.bitsPerSample));
  o.Set("floatPcm", Napi::Boolean::New(env, g_lastFormat.floatPcm));
  return o;
}

Napi::Value IsAvailable(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), true);
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startCapture", Napi::Function::New(env, StartCapture));
  exports.Set("stopCapture", Napi::Function::New(env, StopCapture));
  exports.Set("getFormat", Napi::Function::New(env, GetFormat));
  exports.Set("isAvailable", Napi::Function::New(env, IsAvailable));
  return exports;
}

NODE_API_MODULE(win_audio_capture, Init)

#endif  // _WIN32
