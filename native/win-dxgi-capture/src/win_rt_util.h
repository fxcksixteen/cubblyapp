#pragma once
#ifdef _WIN32

// winerror.h for RPC_E_CHANGED_MODE — winrt/base.h alone doesn't declare it.
#include <winerror.h>
#include <winrt/base.h>

namespace cubbly {

/**
 * Initializes the calling thread's COM apartment for C++/WinRT, once per
 * process. Returns false only if COM is genuinely unusable.
 *
 * CRITICAL: this must never throw. The addon is built with
 * NAPI_DISABLE_CPP_EXCEPTIONS, so a C++ exception escaping into N-API
 * terminates the whole process rather than surfacing as a JS error.
 *
 * The case that actually bites: Electron's main thread is already an STA
 * (Chromium initializes it that way before any addon loads), so asking for
 * MTA here returns RPC_E_CHANGED_MODE. That is NOT a failure for us — COM is
 * initialized either way, and both IGraphicsCaptureItemInterop and
 * Direct3D11CaptureFramePool::CreateFreeThreaded work from an STA precisely
 * because CreateFreeThreaded doesn't need the caller's DispatcherQueue.
 *
 * This was originally an unguarded init_apartment(multi_threaded), which
 * worked under ELECTRON_RUN_AS_NODE (no Chromium, no pre-existing apartment)
 * but hard-crashed the real Electron main process.
 */
inline bool EnsureApartmentInitialized() {
  // Magic-static: thread-safe, evaluated exactly once.
  static const bool ok = []() noexcept -> bool {
    try {
      winrt::init_apartment(winrt::apartment_type::multi_threaded);
      return true;
    } catch (const winrt::hresult_error& e) {
      // Already in an STA (Electron main thread) — usable as-is.
      return e.code() == RPC_E_CHANGED_MODE;
    } catch (...) {
      return false;
    }
  }();
  return ok;
}

}  // namespace cubbly

#endif  // _WIN32
