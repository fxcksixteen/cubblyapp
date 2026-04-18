// Windows WASAPI process-loopback capture.
// Requires Windows 10 build 20348+ (PROCESS_LOOPBACK).
//
// Captures only the audio of one target process tree (matched by PID) and
// invokes a callback on a worker thread with raw PCM frames. The renderer is
// responsible for resampling / mixing.

#pragma once

#ifdef _WIN32

#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <wrl/implements.h>

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <thread>
#include <vector>

namespace cubbly {

struct PcmFormat {
  uint32_t sampleRate = 0;
  uint16_t channels = 0;
  uint16_t bitsPerSample = 0;
  bool floatPcm = false;
};

using PcmCallback = std::function<void(const uint8_t* data, size_t bytes, const PcmFormat& fmt)>;

// Async activation completion handler — required by ActivateAudioInterfaceAsync.
class ActivationHandler
    : public Microsoft::WRL::RuntimeClass<
          Microsoft::WRL::RuntimeClassFlags<Microsoft::WRL::ClassicCom>,
          Microsoft::WRL::FtmBase,
          IActivateAudioInterfaceCompletionHandler> {
 public:
  ActivationHandler();
  ~ActivationHandler() override;

  // Wait for activation to complete and return the activated IAudioClient.
  // Returns nullptr on failure; check GetLastError() for HRESULT.
  HRESULT Wait(IAudioClient** outClient, DWORD timeoutMs = 5000);

  // IActivateAudioInterfaceCompletionHandler
  STDMETHOD(ActivateCompleted)(IActivateAudioInterfaceAsyncOperation* op) override;

 private:
  HANDLE doneEvent_ = nullptr;
  HRESULT activateResult_ = E_FAIL;
  Microsoft::WRL::ComPtr<IUnknown> activatedInterface_;
};

class ProcessLoopbackCapture {
 public:
  ProcessLoopbackCapture();
  ~ProcessLoopbackCapture();

  // Start capturing audio from `pid` (and its child processes). The callback
  // is invoked from a worker thread for every batch of frames. Returns true
  // on success; on failure the addon should surface the message via JS error.
  bool Start(DWORD pid, PcmCallback cb, std::string& errorOut);

  // Stop capture, join the worker thread, release WASAPI handles.
  void Stop();

  // Format negotiated with WASAPI. Valid only after Start() returns true.
  PcmFormat Format() const { return format_; }

 private:
  void RunCaptureLoop();

  std::atomic<bool> running_{false};
  std::thread workerThread_;
  PcmCallback callback_;
  PcmFormat format_;

  Microsoft::WRL::ComPtr<IAudioClient> audioClient_;
  Microsoft::WRL::ComPtr<IAudioCaptureClient> captureClient_;
  HANDLE bufferEvent_ = nullptr;
};

}  // namespace cubbly

#endif  // _WIN32
