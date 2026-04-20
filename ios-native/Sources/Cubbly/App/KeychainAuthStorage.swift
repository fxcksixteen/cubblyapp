import Foundation
import Security
import Supabase
import Auth

/// Persists the Supabase session in the iOS keychain so the user stays signed in
/// across app launches and reboots. Required by `SupabaseClient.auth`.
final class KeychainAuthStorage: AuthLocalStorage {
    private let service = "app.cubbly.ios.supabase-auth"

    func store(key: String, value: Data) throws {
        try delete(key: key)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecValueData as String: value,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
        ]
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else {
            throw NSError(domain: "KeychainAuthStorage", code: Int(status))
        }
    }

    func retrieve(key: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else {
            throw NSError(domain: "KeychainAuthStorage", code: Int(status))
        }
        return result as? Data
    }

    func remove(key: String) throws {
        try delete(key: key)
    }

    private func delete(key: String) throws {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: key
        ]
        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            throw NSError(domain: "KeychainAuthStorage", code: Int(status))
        }
    }
}
