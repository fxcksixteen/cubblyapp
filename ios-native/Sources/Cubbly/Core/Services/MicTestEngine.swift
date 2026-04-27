import Foundation
import AVFoundation
import Combine

/// Discord-style "Let's Check" mic test. Records up to 10 seconds from the
/// device microphone, exposes a live RMS level (0...1) for an animated meter,
/// then plays the recording back so the user can hear themselves.
///
/// Uses a private AVAudioSession activation so it doesn't interfere with an
/// active call. We deactivate when the test ends or the view disappears.
@MainActor
final class MicTestEngine: ObservableObject {
    enum Phase { case idle, recording, recorded, playing }

    @Published private(set) var phase: Phase = .idle
    @Published private(set) var level: Double = 0      // 0...1 input RMS
    @Published private(set) var elapsed: TimeInterval = 0

    private var engine: AVAudioEngine?
    private var recordedFile: AVAudioFile?
    private var recordingURL: URL?
    private var player: AVAudioPlayer?
    private var meterTimer: Timer?
    private var startedAt: Date?
    private let maxDuration: TimeInterval = 10

    func startRecording() {
        guard phase == .idle || phase == .recorded else { return }
        do {
            try configureSession()

            let url = FileManager.default.temporaryDirectory
                .appendingPathComponent("cubbly-mictest-\(UUID().uuidString).caf")
            recordingURL = url

            let eng = AVAudioEngine()
            let input = eng.inputNode
            let format = input.outputFormat(forBus: 0)
            let file = try AVAudioFile(forWriting: url, settings: format.settings)
            recordedFile = file

            input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
                // Write to file
                try? self?.recordedFile?.write(from: buffer)
                // Compute RMS for meter
                let level = MicTestEngine.rmsLevel(buffer: buffer)
                Task { @MainActor in self?.level = level }
            }

            try eng.start()
            engine = eng
            startedAt = Date()
            phase = .recording

            meterTimer?.invalidate()
            meterTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
                Task { @MainActor in
                    guard let self, let started = self.startedAt else { return }
                    self.elapsed = Date().timeIntervalSince(started)
                    if self.elapsed >= self.maxDuration { self.stopRecording() }
                }
            }
        } catch {
            print("[MicTest] startRecording failed:", error)
            stopAll()
        }
    }

    func stopRecording() {
        guard phase == .recording else { return }
        engine?.inputNode.removeTap(onBus: 0)
        engine?.stop()
        engine = nil
        recordedFile = nil
        meterTimer?.invalidate(); meterTimer = nil
        level = 0
        phase = .recorded
    }

    func playRecording() {
        guard let url = recordingURL, phase == .recorded || phase == .idle else { return }
        do {
            try configureSession()
            let p = try AVAudioPlayer(contentsOf: url)
            p.delegate = AudioPlayerObserver.shared
            AudioPlayerObserver.shared.onFinish = { [weak self] in
                Task { @MainActor in self?.phase = .recorded }
            }
            p.prepareToPlay()
            p.play()
            player = p
            phase = .playing
        } catch {
            print("[MicTest] playRecording failed:", error)
            phase = .recorded
        }
    }

    func stopPlayback() {
        player?.stop(); player = nil
        if phase == .playing { phase = .recorded }
    }

    /// Tear everything down and release the audio session. Call when the
    /// settings sheet closes so we don't hold the mic.
    func stopAll() {
        stopPlayback()
        if phase == .recording { stopRecording() }
        try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
        // If a real call is active, restore its session.
        if CallStore.shared.state != .idle {
            CallStore.shared.reapplyAudioSession()
        }
        phase = .idle
        elapsed = 0
        level = 0
    }

    private func configureSession() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord,
                                mode: .measurement,
                                options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
        try session.setActive(true, options: [])
    }

    private static func rmsLevel(buffer: AVAudioPCMBuffer) -> Double {
        guard let channel = buffer.floatChannelData?[0] else { return 0 }
        let n = Int(buffer.frameLength)
        if n == 0 { return 0 }
        var sum: Float = 0
        for i in 0..<n { sum += channel[i] * channel[i] }
        let rms = sqrt(sum / Float(n))
        // Normalize: typical speech RMS is ~0.05–0.3. Scale so 0.3 ≈ full meter.
        return min(1.0, Double(rms) / 0.3)
    }
}

/// Lightweight delegate so AVAudioPlayer callbacks can flip our published state.
private final class AudioPlayerObserver: NSObject, AVAudioPlayerDelegate {
    static let shared = AudioPlayerObserver()
    var onFinish: (() -> Void)?
    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        onFinish?()
    }
}
