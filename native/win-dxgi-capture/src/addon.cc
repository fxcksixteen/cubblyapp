#ifdef _WIN32

#include <napi.h>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>

#include <mutex>

using winrt::Windows::Graphics::Capture::GraphicsCaptureSession;

namespace {

// C++/WinRT needs the calling thread's COM apartment initialized before any
// projection type touches an activation factory. Addon load happens on
// Node's main thread and stays there for the lifetime of the process, so a
// single multi-threaded-apartment init up front covers every export we add.
std::once_flag g_apartmentInitFlag;

void EnsureApartmentInitialized() {
  std::call_once(g_apartmentInitFlag, []() {
    winrt::init_apartment(winrt::apartment_type::multi_threaded);
  });
}

Napi::Value IsSupported(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  EnsureApartmentInitialized();
  bool supported = false;
  try {
    supported = GraphicsCaptureSession::IsSupported();
  } catch (const winrt::hresult_error&) {
    supported = false;
  }
  return Napi::Boolean::New(env, supported);
}

}  // namespace

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("isSupported", Napi::Function::New(env, IsSupported));
  return exports;
}

NODE_API_MODULE(win_dxgi_capture, Init)

#endif  // _WIN32
