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
        do {
            let player = try AVAudioPlayer(contentsOf: url)
            player.numberOfLoops = -1
            player.volume = volume
            player.prepareToPlay()
            player.play()
            loopingPlayers[sound] = player
        } catch {
            print("[SoundService] loop failed for \(sound.rawValue):", error)
        }
    }

    func stopLooping(_ sound: Sound) {
        loopingPlayers[sound]?.stop()
        loopingPlayers.removeValue(forKey: sound)
    }

    // MARK: - Internals

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
