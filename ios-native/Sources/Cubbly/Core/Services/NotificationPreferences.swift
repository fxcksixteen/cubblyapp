import Foundation
import Combine

/// Mirrors `src/lib/notificationSettings.ts` from the web app, persisted in
/// UserDefaults so the user's notification choices survive app restarts.
@MainActor
final class NotificationPreferences: ObservableObject {
    static let shared = NotificationPreferences()

    @Published var bannersEnabled: Bool {
        didSet { defaults.set(bannersEnabled, forKey: Keys.banners) }
    }
    @Published var messageSoundEnabled: Bool {
        didSet { defaults.set(messageSoundEnabled, forKey: Keys.sound) }
    }
    @Published var showMessagePreview: Bool {
        didSet { defaults.set(showMessagePreview, forKey: Keys.preview) }
    }

    private let defaults = UserDefaults.standard
    private enum Keys {
        static let banners = "cubbly.notif.banners"
        static let sound = "cubbly.notif.sound"
        static let preview = "cubbly.notif.preview"
    }

    private init() {
        // Defaults are ON for everything, matching the desktop app.
        if defaults.object(forKey: Keys.banners) == nil { defaults.set(true, forKey: Keys.banners) }
        if defaults.object(forKey: Keys.sound) == nil { defaults.set(true, forKey: Keys.sound) }
        if defaults.object(forKey: Keys.preview) == nil { defaults.set(true, forKey: Keys.preview) }
        self.bannersEnabled = defaults.bool(forKey: Keys.banners)
        self.messageSoundEnabled = defaults.bool(forKey: Keys.sound)
        self.showMessagePreview = defaults.bool(forKey: Keys.preview)
    }
}
