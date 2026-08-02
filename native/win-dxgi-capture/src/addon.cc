#ifdef _WIN32

#include <napi.h>

#include <winrt/Windows.Graphics.Capture.h>

#include <memory>
#include <mutex>
#include <unordered_map>
#include <vector>

#include "win_rt_util.h"
#include "window_capture.h"

using winrt::Windows::Graphics::Capture::GraphicsCaptureSession;

namespace {

std::mutex g_mutex;
uint32_t g_nextHandle = 1;
std::unordered_map<uint32_t, std::unique_ptr<cubbly::WindowCapture>> g_captures;
std::unordered_map<uint32_t, Napi::ThreadSafeFunction> g_callbacks;

struct FramePayload {
  std::vector<uint8_t> nv12;
  uint32_t width;
  uint32_t height;
  uint64_t captureTimeUs;
};

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  bool supported = false;
  // Everything WinRT-touching stays inside the catch-all: with
  // NAPI_DISABLE_CPP_EXCEPTIONS an escaping C++ exception would terminate the
  // process instead of throwing into JS.
  try {
    if (cubbly::EnsureApartmentInitialized()) {
      supported = GraphicsCaptureSession::IsSupported();
    }
  } catch (...) {
    supported = false;
  }
  return Napi::Boolean::New(env, supported);
}

Napi::Value StartCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsNumber() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "startCapture(hwnd: number, onFrame: function, maxHeight?: number)")
        .ThrowAsJavaScriptException();
    return env.Null();
  }
  HWND hwnd = reinterpret_cast<HWND>(
      static_cast<uintptr_t>(info[0].As<Napi::Number>().Int64Value()));
  Napi::Function jsCb = info[1].As<Napi::Function>();
  uint32_t maxHeight = 0;
  if (info.Length() >= 3 && info[2].IsNumber()) {
    int32_t v = info[2].As<Napi::Number>().Int32Value();
    if (v > 0) maxHeight = static_cast<uint32_t>(v);
  }

  uint32_t handle;
  {
    std::lock_guard<std::mutex> lk(g_mutex);
    handle = g_nextHandle++;
  }

  // BOUNDED queue + NonBlockingCall (v0.4.24).
  //
  // This used to be an unlimited queue driven by BlockingCall. Capturing a
  // busy game window meant the WGC thread could enqueue multi-megabyte NV12
  // frames faster than the Electron main thread could drain them, so the
  // queue — and main-process memory — grew without bound and the whole app
  // stopped responding (Windows offers to force-close it). With a depth of 2
  // and a non-blocking call, a main thread that falls behind simply drops
  // frames, which is always the correct trade for live video.
  auto tsfn = Napi::ThreadSafeFunction::New(
      env, jsCb, "cubbly-dxgi-frame-callback",
      2,   // max queue depth
      1);  // single thread

  auto capture = std::make_unique<cubbly::WindowCapture>();

  // Register the TSFN BEFORE Start(). Start() calls session_.StartCapture(),
  // after which WGC may deliver FrameArrived on a thread-pool thread at any
  // moment — and the frame callback below looks the handle up in g_callbacks.
  // Publishing the entry only after Start() returned left a window where the
  // very first frames were silently discarded.
  {
    std::lock_guard<std::mutex> lk(g_mutex);
    g_callbacks.emplace(handle, tsfn);
  }

  std::string err;
  bool ok = capture->Start(
      hwnd,
      [handle](const uint8_t* data, size_t bytes, const cubbly::FrameInfo& info) {
        auto* payload = new FramePayload{
            std::vector<uint8_t>(data, data + bytes), info.width, info.height,
            info.captureTimeUs};
        Napi::ThreadSafeFunction tsfn;
        {
          std::lock_guard<std::mutex> lk(g_mutex);
          auto it = g_callbacks.find(handle);
          if (it == g_callbacks.end()) {
            delete payload;
            return;
          }
          tsfn = it->second;
        }
        // NonBlockingCall: when the main thread is behind, napi_queue_full is
        // returned and this frame is discarded instead of stalling the WGC
        // thread and growing an unbounded backlog.
        auto status = tsfn.NonBlockingCall(
            payload, [](Napi::Env env, Napi::Function cb, FramePayload* p) {
              auto buf = Napi::Buffer<uint8_t>::Copy(env, p->nv12.data(), p->nv12.size());
              Napi::Object frame = Napi::Object::New(env);
              frame.Set("data", buf);
              frame.Set("width", Napi::Number::New(env, p->width));
              frame.Set("height", Napi::Number::New(env, p->height));
              // Epoch microseconds fit exactly in a double until year ~2255
              // (1.75e15 << 2^53), so no precision loss here.
              frame.Set("captureTimeUs",
                        Napi::Number::New(env, static_cast<double>(p->captureTimeUs)));
              delete p;
              cb.Call({frame});
            });
        if (status != napi_ok) delete payload;
      },
      maxHeight,
      err);

  if (!ok) {
    {
      std::lock_guard<std::mutex> lk(g_mutex);
      g_callbacks.erase(handle);
    }
    tsfn.Release();
    Napi::Error::New(env, err.empty() ? "Capture start failed" : err)
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  {
    std::lock_guard<std::mutex> lk(g_mutex);
    g_captures.emplace(handle, std::move(capture));
  }

  return Napi::Number::New(env, handle);
}

Napi::Value StopCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsNumber()) {
    Napi::TypeError::New(env, "stopCapture(handle: number)").ThrowAsJavaScriptException();
    return env.Undefined();
  }
  uint32_t handle = info[0].As<Napi::Number>().Uint32Value();

  std::unique_ptr<cubbly::WindowCapture> cap;
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

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  exports.Set("startCapture", Napi::Function::New(env, StartCapture));
  exports.Set("stopCapture", Napi::Function::New(env, StopCapture));
  return exports;
}

NODE_API_MODULE(win_dxgi_capture, Init)

#endif  // _WIN32
