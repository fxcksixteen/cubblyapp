import Foundation

/// Shared configuration — mirrors the web app's `.env`.
/// The anon key is safe to ship in client binaries; RLS policies enforce access.
enum CubblyConfig {
    static let supabaseURL = URL(string: "https://rubalrtmsxmdrpcknprz.supabase.co")!
    static let supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1YmFscnRtc3htZHJwY2tucHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxOTIxNjgsImV4cCI6MjA5MTc2ODE2OH0.xIiNVGM7mT-hKcBpyoL51Mo8IC1WeHQH5q96FaSgiM0"

    /// Edge functions base URL.
    static var functionsURL: URL {
        supabaseURL.appendingPathComponent("functions/v1")
    }

    /// Display version, shown in Settings.
    static let appVersion = "0.1.2"
}
