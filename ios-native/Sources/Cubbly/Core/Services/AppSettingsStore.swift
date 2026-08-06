import Foundation
import Combine
import SwiftUI

/// Local device preferences for the iOS app. These are the settings that only
/// make sense per-device (sounds, haptics, motion, chat density) and therefore
/// live in `UserDefaults` rather than the database — the same split web/desktop
/// use for their local settings.
@MainActor
final class AppSettingsStore: ObservableObject {
    static let shared = AppSettingsStore()

    private let defaults = UserDefaults.standard

    private func bool(_ key: String, default def: Bool) -> Bool {
        defaults.object(forKey: key) == nil ? def : defaults.bool(forKey: key)
    }

    // MARK: - Accessibility
    @Published var reduceMotion: Bool { didSet { defaults.set(reduceMotion, forKey: "settings.reduceMotion") } }
    @Published var reduceTransparency: Bool { didSet { defaults.set(reduceTransparency, forKey: "settings.reduceTransparency") } }
    /// 0.85 – 1.3 multiplier applied to chat message text.
    @Published var textScale: Double { didSet { defaults.set(textScale, forKey: "settings.textScale") } }

    // MARK: - Chat
    @Published var showTimestamps: Bool { didSet { defaults.set(showTimestamps, forKey: "settings.showTimestamps") } }
    @Published var compactMode: Bool { didSet { defaults.set(compactMode, forKey: "settings.compactMode") } }
    @Published var autoplayGifs: Bool { didSet { defaults.set(autoplayGifs, forKey: "settings.autoplayGifs") } }
    @Published var showLinkPreviews: Bool { didSet { defaults.set(showLinkPreviews, forKey: "settings.showLinkPreviews") } }
    @Published var sendTypingIndicator: Bool { didSet { defaults.set(sendTypingIndicator, forKey: "settings.sendTypingIndicator") } }

    // MARK: - Feedback
    @Published var inAppSounds: Bool { didSet { defaults.set(inAppSounds, forKey: "settings.inAppSounds") } }
    @Published var haptics: Bool { didSet { defaults.set(haptics, forKey: "settings.haptics") } }

    // MARK: - Language & time
    @Published var use24HourTime: Bool { didSet { defaults.set(use24HourTime, forKey: "settings.use24HourTime") } }

    private init() {
        reduceMotion = defaults.object(forKey: "settings.reduceMotion") == nil ? false : defaults.bool(forKey: "settings.reduceMotion")
        reduceTransparency = defaults.object(forKey: "settings.reduceTransparency") == nil ? false : defaults.bool(forKey: "settings.reduceTransparency")
        textScale = defaults.object(forKey: "settings.textScale") == nil ? 1.0 : defaults.double(forKey: "settings.textScale")
        showTimestamps = defaults.object(forKey: "settings.showTimestamps") == nil ? true : defaults.bool(forKey: "settings.showTimestamps")
        compactMode = defaults.object(forKey: "settings.compactMode") == nil ? false : defaults.bool(forKey: "settings.compactMode")
        autoplayGifs = defaults.object(forKey: "settings.autoplayGifs") == nil ? true : defaults.bool(forKey: "settings.autoplayGifs")
        showLinkPreviews = defaults.object(forKey: "settings.showLinkPreviews") == nil ? true : defaults.bool(forKey: "settings.showLinkPreviews")
        sendTypingIndicator = defaults.object(forKey: "settings.sendTypingIndicator") == nil ? true : defaults.bool(forKey: "settings.sendTypingIndicator")
        inAppSounds = defaults.object(forKey: "settings.inAppSounds") == nil ? true : defaults.bool(forKey: "settings.inAppSounds")
        haptics = defaults.object(forKey: "settings.haptics") == nil ? true : defaults.bool(forKey: "settings.haptics")
        use24HourTime = defaults.object(forKey: "settings.use24HourTime") == nil ? false : defaults.bool(forKey: "settings.use24HourTime")
    }

    /// Fires a haptic only when the user has them enabled.
    func haptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle = .medium) {
        guard haptics else { return }
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    func resetLocalSettings() {
        for key in [
            "settings.reduceMotion", "settings.reduceTransparency", "settings.textScale",
            "settings.showTimestamps", "settings.compactMode", "settings.autoplayGifs",
            "settings.showLinkPreviews", "settings.sendTypingIndicator",
            "settings.inAppSounds", "settings.haptics", "settings.use24HourTime",
        ] {
            defaults.removeObject(forKey: key)
        }
        reduceMotion = false
        reduceTransparency = false
        textScale = 1.0
        showTimestamps = true
        compactMode = false
        autoplayGifs = true
        showLinkPreviews = true
        sendTypingIndicator = true
        inAppSounds = true
        haptics = true
        use24HourTime = false
    }
}
