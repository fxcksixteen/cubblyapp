import Foundation
import AVFoundation
import UIKit

/// Plays the same notification sounds as the desktop / web Cubbly app
/// (message, incomingCall, outgoingRing, leaveCall). Mirrors `src/lib/sounds.ts`.
///
/// Behaviour:
/// - One-shots use a small AVAudioPlayer pool so rapid fires don't cut each other off.
/// - Looping sounds (incoming/outgoing call rings) use a dedicated player.
/// - Respects DND (matches the web `setDndActive` flag).
/// - Configures the audio session so sounds play even when the device is on silent
///   for **call rings** (playback category), but stays polite (ambient) for message dings.
@MainActor
final class SoundService {
    static let shared = SoundService()

    enum Sound: String {
        case message       = "message"
        case incomingCall  = "incoming-call"
        case outgoingRing  = "outgoing-ring"
        case leaveCall     = "leave-call"
    }

    private var dndActive = false
    private var oneShotPool: [AVAudioPlayer] = []
    private var loopingPlayers: [Sound: AVAudioPlayer] = [:]
    private var preparedURLs: [Sound: URL] = [:]

    private init() {
        configureAudioSession()
        preloadAll()
    }

    // MARK: - Public API

    func setDndActive(_ active: Bool) {
        dndActive = active
        if active {
            stopLooping(.incomingCall)
            stopLooping(.outgoingRing)
        }
    }

    func play(_ sound: Sound, force: Bool = false, volume: Float = 0.55) {
        if dndActive && !force { return }
        // Honour the "In-app sounds" toggle in Settings → Chat. Call rings and
        // other forced sounds always play so you can't miss a call.
        if !force, UserDefaults.standard.object(forKey: "settings.inAppSounds") != nil,
           !UserDefaults.standard.bool(forKey: "settings.inAppSounds") { return }
        guard let url = url(for: sound) else { return }
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.volume = volume
            player.prepareToPlay()
            player.play()
            // Hold a strong reference until it finishes — simple pool, capped.
            oneShotPool.append(player)
            if oneShotPool.count > 8 {
                oneShotPool.removeFirst(oneShotPool.count - 8)
            }
        } catch {
            print("[SoundService] play failed for \(sound.rawValue):", error)
        }
    }

    func playLooping(_ sound: Sound, force: Bool = false, volume: Float = 0.45) {
        if dndActive && !force { return }
        stopLooping(sound)
        guard let url = url(for: sound) else { return }
        // Call rings play on top of the live call session (playAndRecord /
        // voiceChat). That session routes to the earpiece at a very low level,
        // which is why the outgoing ring used to sound like it faded out after
        // a second — it was still looping, just inaudible. Push it to the
        // speaker and keep the session hot for as long as we're ringing.
        let isRing = (sound == .incomingCall || sound == .outgoingRing)
        if isRing { activateRingRoute() }
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = -1
            player.volume = isRing ? max(volume, 0.8) : volume
            player.prepareToPlay()
            player.play()
            loopingPlayers[sound] = player
            if isRing { startRingWatchdog(sound) }
        } catch {
            print("[SoundService] loop failed for \(sound.rawValue):", error)
        }
    }

    func stopLooping(_ sound: Sound) {
        ringWatchdogs[sound]?.cancel()
        ringWatchdogs.removeValue(forKey: sound)
        loopingPlayers[sound]?.stop()
        loopingPlayers.removeValue(forKey: sound)
    }

    // MARK: - Internals

    private var ringWatchdogs: [Sound: Task<Void, Never>] = [:]

    /// Keeps the ring audible for its whole duration. An audio-session
    /// interruption (WebRTC activating its own session, a route change when
    /// AirPods connect, CallKit taking the session) silently stops an
    /// AVAudioPlayer — it never resumes on its own, which read as the ring
    /// "fading out" while the call was still ringing.
    private func startRingWatchdog(_ sound: Sound) {
        ringWatchdogs[sound]?.cancel()
        ringWatchdogs[sound] = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 700_000_000)
                if Task.isCancelled { return }
                guard let self = self else { return }
                guard let player = self.loopingPlayers[sound] else { return }
                if !player.isPlaying {
                    self.activateRingRoute()
                    player.currentTime = 0
                    player.play()
                }
            }
        }
    }

    private func activateRingRoute() {
        let session = AVAudioSession.sharedInstance()
        do {
            if session.category != .playAndRecord {
                try session.setCategory(.playAndRecord, mode: .voiceChat,
                                        options: [.defaultToSpeaker, .allowBluetooth, .allowBluetoothA2DP])
            }
            try session.setActive(true, options: [])
            try? session.overrideOutputAudioPort(.speaker)
        } catch {
            print("[SoundService] ring route failed:", error)
        }
    }

    private func configureAudioSession() {
        do {
            // .ambient = mixes with other audio, respects silent switch — right for chat dings.
            // We bump to .playback only when ringing for an incoming/outgoing call.
            try AVAudioSession.sharedInstance().setCategory(.ambient, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
        } catch {
            print("[SoundService] audio session setup failed:", error)
        }
    }

    private func preloadAll() {
        for s in [Sound.message, .incomingCall, .outgoingRing, .leaveCall] {
            _ = url(for: s)
        }
    }

    private func url(for sound: Sound) -> URL? {
        if let cached = preparedURLs[sound] { return cached }
        // Sounds ship inside Resources/Sounds (folder ref) — they end up at
        // bundle root or under a `Sounds/` subdirectory depending on Xcode's
        // copy mode. Try both.
        if let url = Bundle.main.url(forResource: sound.rawValue, withExtension: "wav", subdirectory: "Sounds")
            ?? Bundle.main.url(forResource: sound.rawValue, withExtension: "wav") {
            preparedURLs[sound] = url
            return url
        }
        print("[SoundService] sound file missing:", sound.rawValue)
        return nil
    }
}
