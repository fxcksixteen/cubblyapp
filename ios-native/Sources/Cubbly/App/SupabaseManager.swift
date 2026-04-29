import Foundation
import Supabase

/// Single shared Supabase client for the whole app.
/// Mirrors the web project's `src/integrations/supabase/client.ts`.
@MainActor
final class SupabaseManager {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    private init() {
        client = SupabaseClient(
            supabaseURL: CubblyConfig.supabaseURL,
            supabaseKey: CubblyConfig.supabaseAnonKey,
            options: .init(
                auth: .init(
                    storage: KeychainAuthStorage(),
                    autoRefreshToken: true,
                    // Opt into the upcoming behavior so the locally stored
                    // session is emitted as the initial session — silences
                    // the "Initial session emitted after refresh" warning.
                    emitLocalSessionAsInitialSession: true
                )
            )
        )
    }
}
