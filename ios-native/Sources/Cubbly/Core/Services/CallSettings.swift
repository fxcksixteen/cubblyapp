import Foundation
import AVFoundation
import Combine

/// Persisted voice/video preferences. Mirrors the iOS-relevant subset of
/// `VoiceSettings` from the web `VoiceContext.tsx` so settings sync visually
/// even though some controls (device enumeration, push-to-talk) only apply
/// on desktop. Stored under the same key shape as web (`cubbly-voice-*`).
@MainActor
final class CallSettings: ObservableObject {
    static let shared = CallSettings()

    @Published var inputVolume: Double {
        didSet { UserDefaults.standard.set(inputVolume, forKey: "cubbly.voice.inputVolume") }
    }
    @Published var outputVolume: Double {
        didSet {
            UserDefaults.standard.set(outputVolume, forKey: "cubbly.voice.outputVolume")
            applyOutputVolume()
        }
    }
    /// AVAudioSession voiceChat mode automatically applies AEC; toggle exists
    /// for parity with the web checkbox. Disabling switches to `default` mode.
    @Published var echoCancellation: Bool {
        didSet {
            UserDefaults.standard.set(echoCancellation, forKey: "cubbly.voice.echoCancel")
            CallStore.shared.reapplyAudioSession()
        }
    }
    /// On iOS this maps to the WebRTC native noise-suppressor (built into the
    /// audio unit). Disabling has no effect inside an active call (you must
    /// rejoin); we still persist it.
    @Published var noiseSuppression: Bool {
        didSet { UserDefaults.standard.set(noiseSuppression, forKey: "cubbly.voice.noiseSuppression") }
    }
    /// Forces speaker route. When false, iOS picks the natural route
    /// (AirPods → AirPods, otherwise earpiece during a call).
    @Published var speakerOutput: Bool {
        didSet {
            UserDefaults.standard.set(speakerOutput, forKey: "cubbly.voice.speaker")
            CallStore.shared.reapplyAudioSession()
        }
    }

    private init() {
        let d = UserDefaults.standard
        inputVolume     = (d.object(forKey: "cubbly.voice.inputVolume") as? Double) ?? 100
        outputVolume    = (d.object(forKey: "cubbly.voice.outputVolume") as? Double) ?? 100
        echoCancellation = (d.object(forKey: "cubbly.voice.echoCancel") as? Bool) ?? true
        noiseSuppression = (d.object(forKey: "cubbly.voice.noiseSuppression") as? Bool) ?? true
        speakerOutput    = (d.object(forKey: "cubbly.voice.speaker") as? Bool) ?? true
    }

    private func applyOutputVolume() {
        // iOS doesn't expose a per-app output gain; we approximate by
        // adjusting the WebRTC audio engine's playback gain via CallStore.
        CallStore.shared.applyOutputGain(outputVolume / 100.0)
    }
}
