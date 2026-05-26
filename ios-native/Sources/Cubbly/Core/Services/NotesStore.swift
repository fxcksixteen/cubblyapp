import Foundation
import Combine
import CryptoKit
import Security
import Supabase

/// Encrypted personal notes — server only ever sees ciphertext, salts, and
/// the PIN verifier. Same wire format as `src/contexts/NotesContext.tsx` so
/// notes round-trip between iOS, web, and desktop transparently.
struct NoteAttachment: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var mime: String
    var size: Int
    var storagePath: String
    var iv: String
}

struct NotePlaintext: Codable, Equatable {
    var title: String
    var body: String
    var attachments: [NoteAttachment]?
}

struct NoteRow: Identifiable, Equatable {
    let id: UUID
    var iv: String
    var ciphertext: String
    var pinned: Bool
    var sortOrder: Int
    var byteSize: Int
    var createdAt: Date
    var updatedAt: Date
    var decrypted: NotePlaintext?
    var decryptError: Bool = false
}

@MainActor
final class NotesStore: ObservableObject {
    static let shared = NotesStore()
    private init() {}

    @Published private(set) var isInitializing = true
    @Published private(set) var hasExistingVault: Bool? = nil
    @Published private(set) var hasKey = false
    @Published private(set) var notes: [NoteRow] = []
    @Published private(set) var loading = false
    @Published private(set) var trustedHere = false

    private var key: SymmetricKey?
    private var currentUserId: UUID?

    private let keychainService = "app.cubbly.ios.notes-trust"

    private var client: SupabaseClient { SupabaseManager.shared.client }

    // MARK: - Lifecycle

    func start(userId: UUID) async {
        if currentUserId == userId { return }
        currentUserId = userId
        isInitializing = true
        hasKey = false
        notes = []
        key = nil

        // Check for existing vault material.
        struct KeyRow: Decodable { let salt: String }
        do {
            let rows: [KeyRow] = try await client.from("notes_keys")
                .select("salt")
                .eq("user_id", value: userId.uuidString)
                .limit(1)
                .execute()
                .value
            hasExistingVault = !rows.isEmpty
        } catch {
            hasExistingVault = nil
        }

        // Trusted-device unlock.
        trustedHere = readTrustedKey(userId: userId) != nil
        if (hasExistingVault ?? false), let k = readTrustedKey(userId: userId) {
            key = k
            hasKey = true
            await refresh()
        }
        isInitializing = false
    }

    func stop() {
        key = nil
        notes = []
        hasKey = false
        currentUserId = nil
        hasExistingVault = nil
    }

    // MARK: - Vault setup / unlock

    func setupVault(pin: String, trust: Bool) async throws {
        guard let uid = currentUserId else { throw NSError(domain: "Notes", code: 1) }
        guard let result = NotesCrypto.setupNewKey(pin: pin) else {
            throw NSError(domain: "Notes", code: 2, userInfo: [NSLocalizedDescriptionKey: "Could not derive key"])
        }
        struct Insert: Encodable {
            let user_id: String
            let salt: String
            let verifier_iv: String
            let verifier_ciphertext: String
            let iterations: Int
        }
        try await client.from("notes_keys").insert(Insert(
            user_id: uid.uuidString,
            salt: result.material.salt,
            verifier_iv: result.material.verifier_iv,
            verifier_ciphertext: result.material.verifier_ciphertext,
            iterations: result.material.iterations
        )).execute()
        key = result.key
        hasKey = true
        hasExistingVault = true
        if trust { writeTrustedKey(userId: uid, key: result.key); trustedHere = true }
        await refresh()
    }

    func unlock(pin: String, trust: Bool) async -> Bool {
        guard let uid = currentUserId else { return false }
        struct KeyRow: Decodable {
            let salt: String
            let verifier_iv: String
            let verifier_ciphertext: String
            let iterations: Int
        }
        do {
            let rows: [KeyRow] = try await client.from("notes_keys")
                .select("salt,verifier_iv,verifier_ciphertext,iterations")
                .eq("user_id", value: uid.uuidString)
                .limit(1)
                .execute()
                .value
            guard let row = rows.first else { return false }
            let mat = NotesCrypto.KeyMaterial(
                salt: row.salt, verifier_iv: row.verifier_iv,
                verifier_ciphertext: row.verifier_ciphertext, iterations: row.iterations
            )
            guard let k = NotesCrypto.unlockKey(pin: pin, material: mat) else { return false }
            key = k
            hasKey = true
            if trust { writeTrustedKey(userId: uid, key: k); trustedHere = true }
            await refresh()
            return true
        } catch {
            return false
        }
    }

    func lock() {
        key = nil
        hasKey = false
        notes = []
    }

    func forgetDevice() {
        guard let uid = currentUserId else { return }
        deleteTrustedKey(userId: uid)
        trustedHere = false
        lock()
    }

    // MARK: - CRUD

    private struct NoteDBRow: Decodable {
        let id: UUID
        let iv: String
        let ciphertext: String
        let pinned: Bool
        let sort_order: Int
        let byte_size: Int
        let created_at: Date
        let updated_at: Date
    }

    func refresh() async {
        guard let key = key, let uid = currentUserId else { return }
        loading = true
        defer { loading = false }
        do {
            let rows: [NoteDBRow] = try await client.from("notes")
                .select("*")
                .eq("user_id", value: uid.uuidString)
                .order("pinned", ascending: false)
                .order("updated_at", ascending: false)
                .execute()
                .value
            notes = rows.map { r in
                var n = NoteRow(
                    id: r.id, iv: r.iv, ciphertext: r.ciphertext,
                    pinned: r.pinned, sortOrder: r.sort_order, byteSize: r.byte_size,
                    createdAt: r.created_at, updatedAt: r.updated_at
                )
                if let dec = try? NotesCrypto.decryptJSON(NotePlaintext.self, key: key, iv: r.iv, ciphertext: r.ciphertext) {
                    n.decrypted = dec
                } else {
                    n.decryptError = true
                }
                return n
            }
        } catch {
            print("[Notes] refresh failed:", error)
        }
    }

    @discardableResult
    func createNote(plain: NotePlaintext = .init(title: "Untitled", body: "")) async -> NoteRow? {
        guard let key = key, let uid = currentUserId else { return nil }
        do {
            let pair = try NotesCrypto.encryptJSON(key: key, value: plain)
            struct Insert: Encodable {
                let user_id: String
                let iv: String
                let ciphertext: String
                let byte_size: Int
            }
            let inserted: NoteDBRow = try await client.from("notes")
                .insert(Insert(user_id: uid.uuidString, iv: pair.iv, ciphertext: pair.ciphertext, byte_size: pair.ciphertext.count))
                .select("*")
                .single()
                .execute()
                .value
            var row = NoteRow(
                id: inserted.id, iv: inserted.iv, ciphertext: inserted.ciphertext,
                pinned: inserted.pinned, sortOrder: inserted.sort_order, byteSize: inserted.byte_size,
                createdAt: inserted.created_at, updatedAt: inserted.updated_at
            )
            row.decrypted = plain
            notes.insert(row, at: 0)
            return row
        } catch {
            print("[Notes] createNote failed:", error)
            return nil
        }
    }

    func updateNote(id: UUID, plain: NotePlaintext) async {
        guard let key = key else { return }
        do {
            let pair = try NotesCrypto.encryptJSON(key: key, value: plain)
            struct Update: Encodable {
                let iv: String
                let ciphertext: String
                let byte_size: Int
                let updated_at: String
            }
            let now = ISO8601DateFormatter().string(from: Date())
            try await client.from("notes")
                .update(Update(iv: pair.iv, ciphertext: pair.ciphertext, byte_size: pair.ciphertext.count, updated_at: now))
                .eq("id", value: id.uuidString)
                .execute()
            if let idx = notes.firstIndex(where: { $0.id == id }) {
                var r = notes[idx]
                r.iv = pair.iv
                r.ciphertext = pair.ciphertext
                r.byteSize = pair.ciphertext.count
                r.decrypted = plain
                r.updatedAt = Date()
                notes[idx] = r
            }
        } catch {
            print("[Notes] updateNote failed:", error)
        }
    }

    func deleteNote(id: UUID) async {
        do {
            try await client.from("notes").delete().eq("id", value: id.uuidString).execute()
            notes.removeAll { $0.id == id }
        } catch {
            print("[Notes] deleteNote failed:", error)
        }
    }

    func togglePin(id: UUID, pinned: Bool) async {
        do {
            struct U: Encodable { let pinned: Bool }
            try await client.from("notes").update(U(pinned: pinned)).eq("id", value: id.uuidString).execute()
            if let idx = notes.firstIndex(where: { $0.id == id }) {
                notes[idx].pinned = pinned
            }
            notes.sort { (a, b) in
                if a.pinned != b.pinned { return a.pinned && !b.pinned }
                return a.updatedAt > b.updatedAt
            }
        } catch {
            print("[Notes] togglePin failed:", error)
        }
    }

    // MARK: - Keychain trusted-device storage

    private func keychainAccount(_ userId: UUID) -> String { "notes-key:\(userId.uuidString)" }

    private func writeTrustedKey(userId: UUID, key: SymmetricKey) {
        let raw = key.withUnsafeBytes { Data($0) }
        let account = keychainAccount(userId)
        deleteTrustedKey(userId: userId)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecValueData as String: raw,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        ]
        SecItemAdd(query as CFDictionary, nil)
    }

    private func readTrustedKey(userId: UUID) -> SymmetricKey? {
        let account = keychainAccount(userId)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        guard status == errSecSuccess, let data = result as? Data, data.count == 32 else { return nil }
        return SymmetricKey(data: data)
    }

    private func deleteTrustedKey(userId: UUID) {
        let account = keychainAccount(userId)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: keychainService,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(query as CFDictionary)
    }
}
