#ifdef _WIN32

#include "process_loopback_capture.h"

#include <combaseapi.h>
#include <propvarutil.h>
#include <avrt.h>

#include <cstring>
#include <sstream>

using Microsoft::WRL::ComPtr;

namespace cubbly {

namespace {

std::string HrToString(HRESULT hr) {
  std::ostringstream oss;
  oss << "HRESULT 0x" << std::hex << static_cast<uint32_t>(hr);
  return oss.str();
}

}  // namespace

// ----- ActivationHandler -----------------------------------------------------

ActivationHandler::ActivationHandler() {
  doneEvent_ = ::CreateEventW(nullptr, TRUE, FALSE, nullptr);
}

ActivationHandler::~ActivationHandler() {
  if (doneEvent_) {
    ::CloseHandle(doneEvent_);
    doneEvent_ = nullptr;
  }
}

HRESULT STDMETHODCALLTYPE
ActivationHandler::ActivateCompleted(IActivateAudioInterfaceAsyncOperation* op) {
  HRESULT activateHr = E_FAIL;
  ComPtr<IUnknown> punk;
  HRESULT hr = op->GetActivateResult(&activateHr, &punk);
  if (SUCCEEDED(hr)) {
    activateResult_ = activateHr;
    activatedInterface_ = punk;
  } else {
    activateResult_ = hr;
  }
  ::SetEvent(doneEvent_);
  return S_OK;
}

HRESULT ActivationHandler::Wait(IAudioClient** outClient, DWORD timeoutMs) {
  if (!doneEvent_) return E_FAIL;
  DWORD wait = ::WaitForSingleObject(doneEvent_, timeoutMs);
  if (wait != WAIT_OBJECT_0) return HRESULT_FROM_WIN32(ERROR_TIMEOUT);
  if (FAILED(activateResult_)) return activateResult_;
  if (!activatedInterface_) return E_POINTER;
  return activatedInterface_->QueryInterface(IID_PPV_ARGS(outClient));
}

// ----- ProcessLoopbackCapture ------------------------------------------------

ProcessLoopbackCapture::ProcessLoopbackCapture() = default;

ProcessLoopbackCapture::~ProcessLoopbackCapture() {
  Stop();
}

bool ProcessLoopbackCapture::Start(DWORD pid, PcmCallback cb, std::string& errorOut) {
  if (running_.load()) {
    errorOut = "capture already running";
    return false;
  }
  callback_ = std::move(cb);

  HRESULT hr = ::CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  bool comInitedHere = SUCCEEDED(hr);
  // RPC_E_CHANGED_MODE just means COM was already inited differently — fine.

  AUDIOCLIENT_ACTIVATION_PARAMS params{};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = pid;
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activateParams{};
  activateParams.vt = VT_BLOB;
  activateParams.blob.cbSize = sizeof(params);
  activateParams.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  auto handler = Microsoft::WRL::Make<ActivationHandler>();
  if (!handler) {
    errorOut = "failed to allocate ActivationHandler";
    if (comInitedHere) ::CoUninitialize();
    return false;
  }

  ComPtr<IActivateAudioInterfaceAsyncOperation> asyncOp;
  hr = ::ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
      __uuidof(IAudioClient),
      &activateParams,
      handler.Get(),
      &asyncOp);
  if (FAILED(hr)) {
    errorOut = "ActivateAudioInterfaceAsync failed: " + HrToString(hr);
    if (comInitedHere) ::CoUninitialize();
    return false;
  }

  ComPtr<IAudioClient> client;
  hr = handler->Wait(&client);
  if (FAILED(hr) || !client) {
    errorOut = "Activation wait failed: " + HrToString(hr);
    if (comInitedHere) ::CoUninitialize();
    return false;
  }
  audioClient_ = client;

  // Format: 32-bit float PCM, stereo, 44.1 kHz.
  // Microsoft's official ApplicationLoopback sample uses exactly this format,
  // and it is the ONLY combo PROCESS_LOOPBACK reliably accepts on retail Win10/11.
  // PCM-16 + AUTOCONVERTPCM gets rejected with AUDCLNT_E_UNSUPPORTED_FORMAT
  // (0x88890021) on most builds — which is the error the user kept hitting.
  WAVEFORMATEX wfx{};
  wfx.wFormatTag = WAVE_FORMAT_IEEE_FLOAT;
  wfx.nChannels = 2;
  wfx.nSamplesPerSec = 44100;
  wfx.wBitsPerSample = 32;
  wfx.nBlockAlign = (wfx.nChannels * wfx.wBitsPerSample) / 8;
  wfx.nAvgBytesPerSec = wfx.nSamplesPerSec * wfx.nBlockAlign;
  wfx.cbSize = 0;

  // 200ms buffer, event-driven, loopback mode is implicit via PROCESS_LOOPBACK
  // activation type (passing AUDCLNT_STREAMFLAGS_LOOPBACK is invalid here).
  DWORD streamFlags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
                      AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                      AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
  REFERENCE_TIME bufferDuration = 200 * 10000; // 200ms in 100-ns units

  hr = audioClient_->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags,
                                bufferDuration, 0, &wfx, nullptr);
  if (FAILED(hr)) {
    errorOut = "IAudioClient::Initialize failed: " + HrToString(hr);
    audioClient_.Reset();
    if (comInitedHere) ::CoUninitialize();
    return false;
  }

  bufferEvent_ = ::CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (!bufferEvent_) {
    errorOut = "CreateEvent failed";
    audioClient_.Reset();
    if (comInitedHere) ::CoUninitialize();
    return false;
  }

  hr = audioClient_->SetEventHandle(bufferEvent_);
  if (FAILED(hr)) {
    errorOut = "SetEventHandle failed: " + HrToString(hr);
    ::CloseHandle(bufferEvent_); bufferEvent_ = nullptr;
    audioClient_.Reset();
    if (comInitedHere) ::CoUninitialize();
    return false;
  }

  hr = audioClient_->GetService(IID_PPV_ARGS(&captureClient_));
  if (FAILED(hr)) {
    errorOut = "GetService(IAudioCaptureClient) failed: " + HrToString(hr);
    ::CloseHandle(bufferEvent_); bufferEvent_ = nullptr;
    audioClient_.Reset();
    if (comInitedHere) ::CoUninitialize();
    return false;
  }

  hr = audioClient_->Start();
  if (FAILED(hr)) {
    errorOut = "IAudioClient::Start failed: " + HrToString(hr);
    captureClient_.Reset();
    ::CloseHandle(bufferEvent_); bufferEvent_ = nullptr;
    audioClient_.Reset();
    if (comInitedHere) ::CoUninitialize();
    return false;
  }

  format_.sampleRate = wfx.nSamplesPerSec;
  format_.channels = wfx.nChannels;
  format_.bitsPerSample = wfx.wBitsPerSample;
  format_.floatPcm = true;

  running_ = true;
  workerThread_ = std::thread([this]() { RunCaptureLoop(); });

  // We intentionally don't CoUninitialize here — the worker thread owns the
  // capture interfaces and will call CoUninitialize on Stop().
  return true;
}

void ProcessLoopbackCapture::RunCaptureLoop() {
  // Boost thread priority for stable audio capture
  DWORD taskIndex = 0;
  HANDLE mmcss = ::AvSetMmThreadCharacteristicsW(L"Audio", &taskIndex);

  while (running_.load()) {
    DWORD wait = ::WaitForSingleObject(bufferEvent_, 200);
    if (!running_.load()) break;
    if (wait != WAIT_OBJECT_0) continue;

    // Drain all available packets
    UINT32 packetSize = 0;
    while (running_.load()) {
      HRESULT hr = captureClient_->GetNextPacketSize(&packetSize);
      if (FAILED(hr) || packetSize == 0) break;

      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      hr = captureClient_->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) break;

      const size_t bytes = static_cast<size_t>(frames) *
                           (format_.channels * (format_.bitsPerSample / 8));

      // AUDCLNT_BUFFERFLAGS_SILENT means "ignore buffer, treat as silence".
      // We still emit a silent block so JS-side timing stays correct.
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) {
        std::vector<uint8_t> silence(bytes, 0);
        if (callback_) callback_(silence.data(), silence.size(), format_);
      } else if (data && bytes > 0) {
        if (callback_) callback_(data, bytes, format_);
      }

      captureClient_->ReleaseBuffer(frames);
    }
  }

  if (mmcss) ::AvRevertMmThreadCharacteristics(mmcss);
}

void ProcessLoopbackCapture::Stop() {
  if (!running_.exchange(false)) return;

  if (bufferEvent_) ::SetEvent(bufferEvent_);
  if (workerThread_.joinable()) workerThread_.join();

  if (audioClient_) {
    audioClient_->Stop();
  }
  captureClient_.Reset();
  audioClient_.Reset();
  if (bufferEvent_) {
    ::CloseHandle(bufferEvent_);
    bufferEvent_ = nullptr;
  }
  callback_ = nullptr;
}

}  // namespace cubbly

#endif  // _WIN32
