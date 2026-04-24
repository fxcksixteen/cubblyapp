import SwiftUI
import CoreText

@main
struct CubblyApp: App {
    @StateObject private var session = SessionStore()
    // Bridges UIKit APNs callbacks → APNsRegistrar.
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate

    init() {
        Self.registerBundledFonts()
        // Warm up the sound + notification services on launch so their
        // permission state is ready before the first message arrives.
        _ = SoundService.shared
        _ = NotificationService.shared
        _ = CallKitService.shared
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(session)
                .preferredColorScheme(.dark)
                .tint(Theme.Colors.primary)
        }
    }

    /// Registers any .ttf/.otf files bundled in Resources/Fonts at launch.
    /// Drop Nunito files into that folder and they'll auto-register on next build.
    private static func registerBundledFonts() {
        guard let urls = Bundle.main.urls(forResourcesWithExtension: "ttf", subdirectory: nil) else { return }
        for url in urls {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        if let otfs = Bundle.main.urls(forResourcesWithExtension: "otf", subdirectory: nil) {
            for url in otfs {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
        }
    }
}
