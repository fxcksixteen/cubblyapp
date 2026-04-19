#ifdef _WIN32

#include "process_loopback_capture.h"

#include <combaseapi.h>
#include <propvarutil.h>
#include <avrt.h>
#include <ks.h>
#include <ksmedia.h>
#include <mmreg.h>

#include <cstring>
#include <sstream>
#include <string>

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

  // PROCESS_LOOPBACK is finicky. Some Windows builds even return E_NOTIMPL
  // from GetMixFormat(). Strategy: try a list of sane candidate formats but
  // FIRST consult IsFormatSupported() in shared mode and use its suggested
  // "closest match" format when the client offers one. We always tear down
  // and re-create the IAudioClient between attempts because Initialize()
  // can only succeed ONCE per client instance.
  uint32_t mixSr = 48000;
  HRESULT mixFormatHr = E_NOTIMPL;
  WAVEFORMATEX* mixFormat = nullptr;
  hr = audioClient_->GetMixFormat(&mixFormat);
  mixFormatHr = hr;
  if (SUCCEEDED(hr) && mixFormat) {
    if (mixFormat->nSamplesPerSec) {
      mixSr = mixFormat->nSamplesPerSec;
    }
    ::CoTaskMemFree(mixFormat);
    mixFormat = nullptr;
  } else {
    if (mixFormat) {
      ::CoTaskMemFree(mixFormat);
      mixFormat = nullptr;
    }
  }

  // Build candidate formats. IMPORTANT: some machines reject every
  // WAVEFORMATEXTENSIBLE blind guess with AUDCLNT_E_UNSUPPORTED_FORMAT even for
  // banal stereo PCM, so we now try BOTH classic WAVEFORMATEX (PCM / IEEE_FLOAT)
  // and WAVEFORMATEXTENSIBLE representations. We also try a direct shared-mode
  // init path before the AUTOCONVERTPCM path because some process-loopback
  // drivers appear to reject the conversion flags entirely.
  enum class FormatShape {
    Classic,
    Extensible,
  };
  struct Cand {
    uint32_t sr;
    uint16_t ch;
    uint16_t bits;
    bool floatPcm;
    FormatShape shape;
  };
  std::vector<Cand> candidates = {
    { mixSr, 2, 16, false, FormatShape::Classic },
    { mixSr, 2, 16, false, FormatShape::Extensible },
    { 48000, 2, 16, false, FormatShape::Classic },
    { 48000, 2, 16, false, FormatShape::Extensible },
    { 44100, 2, 16, false, FormatShape::Classic },
    { 44100, 2, 16, false, FormatShape::Extensible },
    { mixSr, 1, 16, false, FormatShape::Classic },
    { mixSr, 1, 16, false, FormatShape::Extensible },
    { 48000, 1, 16, false, FormatShape::Classic },
    { 48000, 1, 16, false, FormatShape::Extensible },
    { 44100, 1, 16, false, FormatShape::Classic },
    { 44100, 1, 16, false, FormatShape::Extensible },
    { 32000, 2, 16, false, FormatShape::Classic },
    { 32000, 2, 16, false, FormatShape::Extensible },
    { 16000, 1, 16, false, FormatShape::Classic },
    { 16000, 1, 16, false, FormatShape::Extensible },
    { 48000, 2, 32, true, FormatShape::Classic },
    { 48000, 2, 32, true, FormatShape::Extensible },
    { 44100, 2, 32, true, FormatShape::Classic },
    { 44100, 2, 32, true, FormatShape::Extensible },
    { mixSr, 2, 32, true, FormatShape::Classic },
    { mixSr, 2, 32, true, FormatShape::Extensible },
  };

  struct StreamFlagsVariant {
    DWORD flags;
    const char* label;
  };
  const std::vector<StreamFlagsVariant> streamFlagVariants = {
    // IMPORTANT: even with PROCESS_LOOPBACK activation, the official Microsoft
    // sample still sets AUDCLNT_STREAMFLAGS_LOOPBACK on Initialize(). Omitting
    // it appears to make some drivers reject EVERY candidate with
    // AUDCLNT_E_UNSUPPORTED_FORMAT.
    { AUDCLNT_STREAMFLAGS_LOOPBACK |
          AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
      "loopback-direct" },
    { AUDCLNT_STREAMFLAGS_LOOPBACK |
          AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
          AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
          AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY,
      "loopback-convert" },
  };

  // 200ms buffer, event-driven, loopback mode is implicit via PROCESS_LOOPBACK
  // activation type.
  REFERENCE_TIME bufferDuration = 200 * 10000; // 200ms in 100-ns units

  auto buildWfx = [](const Cand& c, WAVEFORMATEXTENSIBLE& ext, WAVEFORMATEX& classic) -> WAVEFORMATEX* {
    if (c.shape == FormatShape::Extensible) {
      ZeroMemory(&ext, sizeof(ext));
      ext.Format.wFormatTag = WAVE_FORMAT_EXTENSIBLE;
      ext.Format.nChannels = c.ch;
      ext.Format.nSamplesPerSec = c.sr;
      ext.Format.wBitsPerSample = c.bits;
      ext.Format.nBlockAlign = (c.ch * c.bits) / 8;
      ext.Format.nAvgBytesPerSec = ext.Format.nSamplesPerSec * ext.Format.nBlockAlign;
      ext.Format.cbSize = 22;
      ext.Samples.wValidBitsPerSample = c.bits;
      ext.dwChannelMask = (c.ch == 2) ? (SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT) : SPEAKER_FRONT_CENTER;
      ext.SubFormat = c.floatPcm ? KSDATAFORMAT_SUBTYPE_IEEE_FLOAT : KSDATAFORMAT_SUBTYPE_PCM;
      return reinterpret_cast<WAVEFORMATEX*>(&ext);
    }

    ZeroMemory(&classic, sizeof(classic));
    classic.wFormatTag = c.floatPcm ? WAVE_FORMAT_IEEE_FLOAT : WAVE_FORMAT_PCM;
    classic.nChannels = c.ch;
    classic.nSamplesPerSec = c.sr;
    classic.wBitsPerSample = c.bits;
    classic.nBlockAlign = (c.ch * c.bits) / 8;
    classic.nAvgBytesPerSec = classic.nSamplesPerSec * classic.nBlockAlign;
    classic.cbSize = 0;
    return &classic;
  };

  auto reactivate = [&](Microsoft::WRL::ComPtr<IAudioClient>& outClient, std::string& errAccum) -> bool {
    auto handler2 = Microsoft::WRL::Make<ActivationHandler>();
    if (!handler2) { errAccum += " | re-activate alloc failed"; return false; }
    Microsoft::WRL::ComPtr<IActivateAudioInterfaceAsyncOperation> asyncOp2;
    HRESULT hra = ::ActivateAudioInterfaceAsync(
        VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
        __uuidof(IAudioClient),
        &activateParams,
        handler2.Get(),
        &asyncOp2);
    if (FAILED(hra)) { errAccum += " | re-activate failed " + HrToString(hra); return false; }
    Microsoft::WRL::ComPtr<IAudioClient> client2;
    HRESULT hrw = handler2->Wait(&client2);
    if (FAILED(hrw) || !client2) { errAccum += " | re-activate wait failed " + HrToString(hrw); return false; }
    outClient = client2;
    return true;
  };

  bool initialized = false;
  std::string lastErr;
  std::string allAttempts;  // Verbose log of EVERY candidate attempt for debug surfacing.
  Cand chosen{};
  allAttempts += "pid=" + std::to_string(pid) + " mixSr=" + std::to_string(mixSr) +
                 " mixFmtHr=" + HrToString(mixFormatHr) + " | ";
  int candIdx = 0;
  for (const auto& c : candidates) {
    candIdx++;
    Cand effective = c;
    for (const auto& flagVariant : streamFlagVariants) {
      WAVEFORMATEXTENSIBLE ext{};
      WAVEFORMATEX classic{};
      WAVEFORMATEX* builtFmt = buildWfx(c, ext, classic);

      // Probe IsFormatSupported first. If the client offers a "closest match"
      // we use that for Initialize() instead of our hand-rolled format.
      WAVEFORMATEX* suggested = nullptr;
      HRESULT supportedHr = audioClient_->IsFormatSupported(
          AUDCLNT_SHAREMODE_SHARED,
          builtFmt,
          &suggested);

      WAVEFORMATEX* useFmt = builtFmt;
      effective = c;
      if (supportedHr == S_FALSE && suggested) {
        useFmt = suggested;
        effective.sr = suggested->nSamplesPerSec;
        effective.ch = suggested->nChannels;
        effective.bits = suggested->wBitsPerSample;
        effective.shape = (suggested->wFormatTag == WAVE_FORMAT_EXTENSIBLE)
            ? FormatShape::Extensible
            : FormatShape::Classic;
        effective.floatPcm = false;
        if (suggested->wFormatTag == WAVE_FORMAT_EXTENSIBLE && suggested->cbSize >= 22) {
          const WAVEFORMATEXTENSIBLE* sx = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(suggested);
          effective.floatPcm = (sx->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
        } else if (suggested->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) {
          effective.floatPcm = true;
        }
      }

      std::string candLine = "[#" + std::to_string(candIdx) + " sr=" + std::to_string(effective.sr) +
                             " ch=" + std::to_string(effective.ch) +
                             " bits=" + std::to_string(effective.bits) +
                             " float=" + (effective.floatPcm ? "1" : "0") +
                             " shape=" + (effective.shape == FormatShape::Extensible ? "ext" : "classic") +
                             " flags=" + flagVariant.label +
                             " probe=" + HrToString(supportedHr) + " adopted=" +
                             (supportedHr == S_FALSE && useFmt != builtFmt ? "yes" : "no") + "]";

      hr = audioClient_->Initialize(AUDCLNT_SHAREMODE_SHARED, flagVariant.flags,
                                    bufferDuration, 0, useFmt, nullptr);
      candLine += " Init=" + HrToString(hr);
      allAttempts += candLine + " | ";

      if (SUCCEEDED(hr)) {
        chosen = effective;
        initialized = true;
        if (suggested) { ::CoTaskMemFree(suggested); suggested = nullptr; }
        break;
      }

      lastErr = candLine;
      if (suggested) { ::CoTaskMemFree(suggested); suggested = nullptr; }

      // Initialize() can only be called once per IAudioClient. Re-activate
      // a fresh one for the next attempt.
      audioClient_.Reset();
      if (!reactivate(audioClient_, lastErr)) break;
    }
    if (initialized) break;
  }

  if (!initialized) {
    errorOut = "IAudioClient::Initialize failed for ALL candidates. Trace: " + allAttempts;
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

  format_.sampleRate = chosen.sr;
  format_.channels = chosen.ch;
  format_.bitsPerSample = chosen.bits;
  format_.floatPcm = chosen.floatPcm;

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
