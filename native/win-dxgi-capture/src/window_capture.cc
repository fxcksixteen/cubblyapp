#ifdef _WIN32

#include "window_capture.h"

#include <dxgi1_2.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>

#include <chrono>

#include <winrt/Windows.Foundation.Metadata.h>

#include "win_rt_util.h"

// Deliberately NOT pulling in winrt::Windows::Foundation::IInspectable via a
// blanket using-declaration here: the interop headers above also declare a
// global (non-winrt, ABI-style) ::IInspectable from <inspectable.h>, and the
// two are used for different purposes in this file (see Start() and
// OnFrameArrived()). Keeping both fully qualified avoids the ambiguity.
using winrt::Windows::Graphics::SizeInt32;
using winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool;
using winrt::Windows::Graphics::Capture::GraphicsCaptureItem;
using winrt::Windows::Graphics::Capture::GraphicsCaptureSession;
using winrt::Windows::Graphics::Capture::GraphicsCaptureAccess;
using winrt::Windows::Graphics::Capture::GraphicsCaptureAccessKind;
using winrt::Windows::Graphics::DirectX::DirectXPixelFormat;
using winrt::Windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
// This one is the raw ABI interop interface from windows.graphics.directx.
// direct3d11.interop.h, declared under the global ::Windows namespace (not
// winrt::Windows) — it's how we get back to an ID3D11Texture2D from a
// captured frame's surface.
using ::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess;

namespace cubbly {

namespace {

// Clamp-to-edge sample of one BGRA pixel; used by chroma averaging so odd
// window dimensions don't read past the mapped buffer.
inline void SampleBgra(const uint8_t* srcData, uint32_t rowPitch, uint32_t width,
                        uint32_t height, uint32_t x, uint32_t y, uint8_t& b,
                        uint8_t& g, uint8_t& r) {
  uint32_t cx = x < width ? x : width - 1;
  uint32_t cy = y < height ? y : height - 1;
  const uint8_t* px = srcData + static_cast<size_t>(cy) * rowPitch + static_cast<size_t>(cx) * 4;
  b = px[0];
  g = px[1];
  r = px[2];
}

inline uint8_t Clamp8(int v) { return static_cast<uint8_t>(v < 0 ? 0 : (v > 255 ? 255 : v)); }

}  // namespace

WindowCapture::~WindowCapture() { Stop(); }

bool WindowCapture::Start(HWND hwnd, FrameCallback callback, uint32_t maxHeight,
                          std::string& outError) {
  maxHeight_ = maxHeight;
  if (running_.load()) {
    outError = "Capture already running";
    return false;
  }
  if (!hwnd || !IsWindow(hwnd)) {
    outError = "Invalid window handle";
    return false;
  }

  if (!EnsureApartmentInitialized()) {
    outError = "COM apartment could not be initialized";
    return false;
  }

  try {
    if (!GraphicsCaptureSession::IsSupported()) {
      outError = "Windows Graphics Capture is not supported on this system";
      return false;
    }

    auto interopFactory =
        winrt::get_activation_factory<GraphicsCaptureItem, IGraphicsCaptureItemInterop>();
    winrt::check_hresult(interopFactory->CreateForWindow(
        hwnd, winrt::guid_of<GraphicsCaptureItem>(),
        reinterpret_cast<void**>(winrt::put_abi(item_))));

    UINT deviceFlags = D3D11_CREATE_DEVICE_BGRA_SUPPORT;
    D3D_FEATURE_LEVEL featureLevel;
    winrt::check_hresult(D3D11CreateDevice(
        nullptr, D3D_DRIVER_TYPE_HARDWARE, nullptr, deviceFlags, nullptr, 0,
        D3D11_SDK_VERSION, d3dDevice_.put(), &featureLevel, d3dContext_.put()));

    auto dxgiDevice = d3dDevice_.as<IDXGIDevice>();
    // CreateDirect3D11DeviceFromDXGIDevice's out-param is the raw ABI
    // ::IInspectable (from <inspectable.h>), not the winrt-projected type —
    // com_ptr<::IInspectable>.as<IDirect3DDevice>() bridges the two.
    winrt::com_ptr<::IInspectable> inspectableDevice;
    winrt::check_hresult(
        CreateDirect3D11DeviceFromDXGIDevice(dxgiDevice.get(), inspectableDevice.put()));
    winrtDevice_ = inspectableDevice.as<IDirect3DDevice>();

    lastSize_ = item_.Size();

    // CreateFreeThreaded (not Create): Create() marshals FrameArrived through
    // a DispatcherQueue on the calling thread, and Electron's main process
    // doesn't pump one, so the callback would never fire. FreeThreaded
    // delivers on an MTA thread-pool thread instead.
    framePool_ = Direct3D11CaptureFramePool::CreateFreeThreaded(
        winrtDevice_, DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, lastSize_);
    session_ = framePool_.CreateCaptureSession(item_);

    // v0.4.22 — kill the yellow "this window is being captured" outline that
    // Windows draws around the capture target. IsBorderRequired only exists on
    // Windows 11 (build 22000+) / late Win10 servicing builds, and on some
    // builds it also needs the graphics-capture-without-border capability, so
    // both the API-presence check and the call itself are best-effort.
    try {
      if (winrt::Windows::Foundation::Metadata::ApiInformation::IsPropertyPresent(
              L"Windows.Graphics.Capture.GraphicsCaptureSession",
              L"IsBorderRequired")) {
        // Best-effort permission request; ignore the result, the setter below
        // simply no-ops if the OS refuses.
        try {
          GraphicsCaptureAccess::RequestAccessAsync(
              GraphicsCaptureAccessKind::Borderless).get();
        } catch (...) {}
        session_.IsBorderRequired(false);
      }
    } catch (...) {
      // Older OS or access denied — keep capturing, just with the border.
    }

    callback_ = std::move(callback);
    running_.store(true, std::memory_order_release);

    frameArrivedRevoker_ = framePool_.FrameArrived(
        winrt::auto_revoke, {this, &WindowCapture::OnFrameArrived});
    itemClosedRevoker_ = item_.Closed(winrt::auto_revoke, [this](auto&&, auto&&) {
      // Window went away underneath us. Just stop delivering frames; full
      // COM teardown still happens via the JS-driven Stop() call so we don't
      // revoke/close objects re-entrantly from inside this WinRT event.
      running_.store(false, std::memory_order_release);
    });

    session_.StartCapture();
  } catch (const winrt::hresult_error& e) {
    outError = winrt::to_string(e.message());
    ResetAfterFailedStart();
    return false;
  } catch (const std::exception& e) {
    outError = e.what();
    ResetAfterFailedStart();
    return false;
  } catch (...) {
    // Nothing may escape into N-API: NAPI_DISABLE_CPP_EXCEPTIONS means an
    // uncaught C++ exception terminates the process.
    outError = "unknown native failure during capture start";
    ResetAfterFailedStart();
    return false;
  }

  return true;
}

void WindowCapture::ResetAfterFailedStart() {
  running_.store(false);
  frameArrivedRevoker_.revoke();
  itemClosedRevoker_.revoke();
  session_ = nullptr;
  framePool_ = nullptr;
  item_ = nullptr;
  stagingTexture_ = nullptr;
  d3dContext_ = nullptr;
  d3dDevice_ = nullptr;
  callback_ = nullptr;
}

void WindowCapture::Stop() {
  if (!running_.exchange(false)) return;

  // No lock held here: revoke() waits for any in-flight OnFrameArrived to
  // return, and that handler's very first check is the running_ flag we just
  // cleared, so it bails before trying to take mutex_. Holding mutex_ across
  // this call would deadlock against a callback blocked on it.
  frameArrivedRevoker_.revoke();
  itemClosedRevoker_.revoke();

  std::lock_guard<std::mutex> lk(mutex_);
  if (session_) {
    session_.Close();
    session_ = nullptr;
  }
  if (framePool_) {
    framePool_.Close();
    framePool_ = nullptr;
  }
  item_ = nullptr;
  stagingTexture_ = nullptr;
  d3dContext_ = nullptr;
  d3dDevice_ = nullptr;
  callback_ = nullptr;
}

void WindowCapture::OnFrameArrived(
    Direct3D11CaptureFramePool const& sender,
    winrt::Windows::Foundation::IInspectable const&) {
  if (!running_.load(std::memory_order_acquire)) return;

  // Stamp arrival before any work so the measured latency includes our own
  // copy/convert cost, not just the IPC hop.
  const uint64_t arrivedUs =
      static_cast<uint64_t>(std::chrono::duration_cast<std::chrono::microseconds>(
                                std::chrono::system_clock::now().time_since_epoch())
                                .count());

  // This runs on a WinRT thread-pool thread. check_hresult() throws on
  // device-removed / resource-lost, and an exception escaping back into WinRT's
  // event dispatch would terminate the process — so nothing may propagate out
  // of here. A dropped frame is always preferable to a dead app.
  try {
    auto frame = sender.TryGetNextFrame();
    if (!frame) return;

    std::lock_guard<std::mutex> lk(mutex_);
    if (!running_.load(std::memory_order_acquire)) return;

    auto contentSize = frame.ContentSize();
    if (contentSize.Width != lastSize_.Width || contentSize.Height != lastSize_.Height) {
      lastSize_ = contentSize;
      framePool_.Recreate(winrtDevice_, DirectXPixelFormat::B8G8R8A8UIntNormalized, 2, lastSize_);
      return;  // next FrameArrived will deliver frames at the new size
    }

    auto access = frame.Surface().as<IDirect3DDxgiInterfaceAccess>();
    winrt::com_ptr<ID3D11Texture2D> frameTexture;
    winrt::check_hresult(
        access->GetInterface(winrt::guid_of<ID3D11Texture2D>(), frameTexture.put_void()));

    D3D11_TEXTURE2D_DESC desc;
    frameTexture->GetDesc(&desc);
    if (desc.Width == 0 || desc.Height == 0) return;

    EnsureStagingTexture(desc.Width, desc.Height);
    d3dContext_->CopyResource(stagingTexture_.get(), frameTexture.get());

    D3D11_MAPPED_SUBRESOURCE mapped;
    winrt::check_hresult(d3dContext_->Map(stagingTexture_.get(), 0, D3D11_MAP_READ, 0, &mapped));
    uint32_t outW = 0, outH = 0;
    ConvertBgraToNv12(static_cast<const uint8_t*>(mapped.pData), mapped.RowPitch, desc.Width,
                       desc.Height, outW, outH);
    d3dContext_->Unmap(stagingTexture_.get(), 0);

    if (callback_ && outW && outH) {
      const size_t emitted =
          static_cast<size_t>(outW) * outH + static_cast<size_t>((outW + 1) / 2) * ((outH + 1) / 2) * 2;
      FrameInfo info{outW, outH, arrivedUs};
      callback_(nv12Buffer_.data(), emitted, info);
    }
  } catch (...) {
    // Swallow and wait for the next frame.
  }
}

void WindowCapture::EnsureStagingTexture(uint32_t width, uint32_t height) {
  if (stagingTexture_ && stagingWidth_ == width && stagingHeight_ == height) return;

  D3D11_TEXTURE2D_DESC desc = {};
  desc.Width = width;
  desc.Height = height;
  desc.MipLevels = 1;
  desc.ArraySize = 1;
  desc.Format = DXGI_FORMAT_B8G8R8A8_UNORM;
  desc.SampleDesc.Count = 1;
  desc.Usage = D3D11_USAGE_STAGING;
  desc.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
  desc.BindFlags = 0;

  stagingTexture_ = nullptr;
  winrt::check_hresult(d3dDevice_->CreateTexture2D(&desc, nullptr, stagingTexture_.put()));
  stagingWidth_ = width;
  stagingHeight_ = height;

  size_t chromaWidth = (width + 1) / 2;
  size_t chromaHeight = (height + 1) / 2;
  nv12Buffer_.resize(static_cast<size_t>(width) * height + chromaWidth * chromaHeight * 2);
}

// BT.601 limited-range BGRA -> NV12. Y is computed per pixel; U/V are
// computed once per 2x2 block from the averaged RGB of that block (standard
// 4:2:0 chroma subsampling), clamped to the edge for odd width/height.
void WindowCapture::ConvertBgraToNv12(const uint8_t* srcData, uint32_t srcRowPitch,
                                       uint32_t width, uint32_t height,
                                       uint32_t& outWidth, uint32_t& outHeight) {
  // Integer downscale factor so the emitted frame never exceeds maxHeight_.
  uint32_t step = 1;
  if (maxHeight_ > 0 && height > maxHeight_) {
    step = (height + maxHeight_ - 1) / maxHeight_;
    if (step < 1) step = 1;
  }
  // Keep both dimensions even so 4:2:0 chroma blocks stay aligned.
  uint32_t dstW = (width / step) & ~1u;
  uint32_t dstH = (height / step) & ~1u;
  if (dstW < 2 || dstH < 2) {
    step = 1;
    dstW = width & ~1u;
    dstH = height & ~1u;
  }
  outWidth = dstW;
  outHeight = dstH;

  uint32_t chromaWidth = dstW / 2;
  uint32_t chromaHeight = dstH / 2;
  size_t ySize = static_cast<size_t>(dstW) * dstH;
  size_t needed = ySize + static_cast<size_t>(chromaWidth) * chromaHeight * 2;
  if (nv12Buffer_.size() < needed) nv12Buffer_.resize(needed);
  uint8_t* yPlane = nv12Buffer_.data();
  uint8_t* uvPlane = nv12Buffer_.data() + ySize;

  for (uint32_t y = 0; y < dstH; ++y) {
    const uint8_t* row = srcData + static_cast<size_t>(y * step) * srcRowPitch;
    uint8_t* yRow = yPlane + static_cast<size_t>(y) * dstW;
    for (uint32_t x = 0; x < dstW; ++x) {
      const uint8_t* px = row + static_cast<size_t>(x * step) * 4;
      int yVal = ((66 * px[2] + 129 * px[1] + 25 * px[0] + 128) >> 8) + 16;
      yRow[x] = Clamp8(yVal);
    }
  }

  for (uint32_t cy = 0; cy < chromaHeight; ++cy) {
    uint8_t* uvRow = uvPlane + static_cast<size_t>(cy) * chromaWidth * 2;
    for (uint32_t cx = 0; cx < chromaWidth; ++cx) {
      uint32_t x0 = cx * 2 * step, y0 = cy * 2 * step;
      uint8_t b0, g0, r0, b1, g1, r1, b2, g2, r2, b3, g3, r3;
      SampleBgra(srcData, srcRowPitch, width, height, x0, y0, b0, g0, r0);
      SampleBgra(srcData, srcRowPitch, width, height, x0 + step, y0, b1, g1, r1);
      SampleBgra(srcData, srcRowPitch, width, height, x0, y0 + step, b2, g2, r2);
      SampleBgra(srcData, srcRowPitch, width, height, x0 + step, y0 + step, b3, g3, r3);
      int r = (r0 + r1 + r2 + r3) / 4;
      int g = (g0 + g1 + g2 + g3) / 4;
      int b = (b0 + b1 + b2 + b3) / 4;
      int uVal = ((-38 * r - 74 * g + 112 * b + 128) >> 8) + 128;
      int vVal = ((112 * r - 94 * g - 18 * b + 128) >> 8) + 128;
      uvRow[cx * 2 + 0] = Clamp8(uVal);
      uvRow[cx * 2 + 1] = Clamp8(vVal);
    }
  }
}

}  // namespace cubbly

#endif  // _WIN32
