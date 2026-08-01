#pragma once
#ifdef _WIN32

#include <windows.h>
#include <d3d11.h>

#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>

#include <atomic>
#include <functional>
#include <mutex>
#include <string>
#include <vector>

namespace cubbly {

struct FrameInfo {
  uint32_t width;
  uint32_t height;
};

// Called with a fully-formed NV12 frame (Y plane followed by interleaved UV).
// Invoked on whatever thread WGC delivers FrameArrived on — NOT the thread
// that called Start().
using FrameCallback =
    std::function<void(const uint8_t* nv12Data, size_t bytes, const FrameInfo& info)>;

class WindowCapture {
 public:
  WindowCapture() = default;
  ~WindowCapture();

  // Begins capturing `hwnd` via Windows Graphics Capture. Returns false and
  // fills outError on failure (unsupported OS, invalid window, D3D11/WinRT
  // failure). Must be called at most once per instance.
  bool Start(HWND hwnd, FrameCallback callback, std::string& outError);

  // Idempotent; safe to call from any thread, safe to call multiple times.
  void Stop();

 private:
  void OnFrameArrived(
      winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool const& sender,
      winrt::Windows::Foundation::IInspectable const& args);

  void EnsureStagingTexture(uint32_t width, uint32_t height);
  void ConvertBgraToNv12(const uint8_t* srcData, uint32_t srcRowPitch,
                          uint32_t width, uint32_t height);

  winrt::com_ptr<ID3D11Device> d3dDevice_;
  winrt::com_ptr<ID3D11DeviceContext> d3dContext_;
  winrt::Windows::Graphics::DirectX::Direct3D11::IDirect3DDevice winrtDevice_{nullptr};

  winrt::Windows::Graphics::Capture::GraphicsCaptureItem item_{nullptr};
  winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool framePool_{nullptr};
  winrt::Windows::Graphics::Capture::GraphicsCaptureSession session_{nullptr};
  winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool::FrameArrived_revoker
      frameArrivedRevoker_;
  winrt::Windows::Graphics::Capture::GraphicsCaptureItem::Closed_revoker itemClosedRevoker_;
  winrt::Windows::Graphics::SizeInt32 lastSize_{0, 0};

  winrt::com_ptr<ID3D11Texture2D> stagingTexture_;
  uint32_t stagingWidth_ = 0;
  uint32_t stagingHeight_ = 0;
  std::vector<uint8_t> nv12Buffer_;

  FrameCallback callback_;
  std::atomic<bool> running_{false};
  // Serializes OnFrameArrived's texture/buffer access against Stop()'s
  // teardown. Stop() never holds this while revoking the event handler, so
  // revoke() waiting on an in-flight callback can never deadlock against it.
  std::mutex mutex_;
};

}  // namespace cubbly

#endif  // _WIN32
