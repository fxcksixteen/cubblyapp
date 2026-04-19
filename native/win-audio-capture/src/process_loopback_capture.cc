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

  // Build candidate formats. Most-likely-to-work first: WAVEFORMATEXTENSIBLE
  // int16 stereo at common rates. Then mono, then float fallbacks. We've seen
  // machines reject 0x88890021 on every blind candidate, so we now also probe
  // IsFormatSupported() for each one and accept the client's suggested closest
  // match instead.
  struct Cand { uint32_t sr; uint16_t ch; uint16_t bits; bool floatPcm; };
  std::vector<Cand> candidates = {
    { mixSr, 2, 16, false },
    { 48000, 2, 16, false },
    { 44100, 2, 16, false },
    { mixSr, 1, 16, false },
    { 48000, 1, 16, false },
    { 44100, 1, 16, false },
    { 32000, 2, 16, false },
    { 16000, 1, 16, false },
    { 48000, 2, 32, true },
    { 44100, 2, 32, true },
    { mixSr, 2, 32, true },
  };

  // 200ms buffer, event-driven, loopback mode is implicit via PROCESS_LOOPBACK
  // activation type. AUTOCONVERTPCM lets WASAPI resample if needed.
  DWORD streamFlags = AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
                      AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
                      AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;
  REFERENCE_TIME bufferDuration = 200 * 10000; // 200ms in 100-ns units

  auto buildWfx = [](const Cand& c, WAVEFORMATEXTENSIBLE& wfx) {
    ZeroMemory(&wfx, sizeof(wfx));
    wfx.Format.wFormatTag = WAVE_FORMAT_EXTENSIBLE;
    wfx.Format.nChannels = c.ch;
    wfx.Format.nSamplesPerSec = c.sr;
    wfx.Format.wBitsPerSample = c.bits;
    wfx.Format.nBlockAlign = (c.ch * c.bits) / 8;
    wfx.Format.nAvgBytesPerSec = wfx.Format.nSamplesPerSec * wfx.Format.nBlockAlign;
    wfx.Format.cbSize = 22;
    wfx.Samples.wValidBitsPerSample = c.bits;
    wfx.dwChannelMask = (c.ch == 2) ? (SPEAKER_FRONT_LEFT | SPEAKER_FRONT_RIGHT) : SPEAKER_FRONT_CENTER;
    wfx.SubFormat = c.floatPcm ? KSDATAFORMAT_SUBTYPE_IEEE_FLOAT : KSDATAFORMAT_SUBTYPE_PCM;
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
  Cand chosen{};
  for (const auto& c : candidates) {
    WAVEFORMATEXTENSIBLE wfx{};
    buildWfx(c, wfx);

    // Probe IsFormatSupported first. If the client offers a "closest match"
    // we use that for Initialize() instead of our hand-rolled wfx — that's
    // the entire point of the negotiation API and is what unblocks machines
    // that respond AUDCLNT_E_UNSUPPORTED_FORMAT (0x88890021) to every blind
    // attempt.
    WAVEFORMATEX* suggested = nullptr;
    HRESULT supportedHr = audioClient_->IsFormatSupported(
        AUDCLNT_SHAREMODE_SHARED,
        reinterpret_cast<WAVEFORMATEX*>(&wfx),
        &suggested);

    WAVEFORMATEX* useFmt = reinterpret_cast<WAVEFORMATEX*>(&wfx);
    Cand effective = c;
    if (supportedHr == S_FALSE && suggested) {
      // Client suggested a closer format — adopt it.
      useFmt = suggested;
      effective.sr = suggested->nSamplesPerSec;
      effective.ch = suggested->nChannels;
      effective.bits = suggested->wBitsPerSample;
      effective.floatPcm = false;
      if (suggested->wFormatTag == WAVE_FORMAT_EXTENSIBLE && suggested->cbSize >= 22) {
        const WAVEFORMATEXTENSIBLE* sx = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(suggested);
        effective.floatPcm = (sx->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT);
      } else if (suggested->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) {
        effective.floatPcm = true;
      }
    } else if (supportedHr != S_OK) {
      // Not supported and no suggestion — skip cheap; record reason and try next.
      lastErr = "candidate sr=" + std::to_string(c.sr) + " ch=" + std::to_string(c.ch) +
                " bits=" + std::to_string(c.bits) + " float=" + (c.floatPcm ? "1" : "0") +
                " IsFormatSupported=" + HrToString(supportedHr);
      if (suggested) { ::CoTaskMemFree(suggested); suggested = nullptr; }
      continue;
    }

    hr = audioClient_->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags,
                                  bufferDuration, 0, useFmt, nullptr);
    if (SUCCEEDED(hr)) {
      chosen = effective;
      initialized = true;
      if (suggested) { ::CoTaskMemFree(suggested); suggested = nullptr; }
      break;
    }
    lastErr = "candidate sr=" + std::to_string(effective.sr) + " ch=" + std::to_string(effective.ch) +
              " bits=" + std::to_string(effective.bits) + " float=" + (effective.floatPcm ? "1" : "0") +
              " Initialize=" + HrToString(hr) + " (probe=" + HrToString(supportedHr) + ")";
    if (suggested) { ::CoTaskMemFree(suggested); suggested = nullptr; }

    // Initialize() can only be called once per IAudioClient. Re-activate
    // a fresh one for the next attempt.
    audioClient_.Reset();
    if (!reactivate(audioClient_, lastErr)) continue;
  }

  if (!initialized) {
    errorOut = "IAudioClient::Initialize failed for all candidate formats";
    if (FAILED(mixFormatHr)) {
      errorOut += " (GetMixFormat=" + HrToString(mixFormatHr) + ")";
    }
    if (!lastErr.empty()) {
      errorOut += ". Last: " + lastErr;
    }
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
