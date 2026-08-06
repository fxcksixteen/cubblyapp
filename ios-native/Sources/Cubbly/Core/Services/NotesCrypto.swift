import Foundation
import CryptoKit
import CommonCrypto

/// Cross-platform encryption format matching `src/lib/notesCrypto.ts`:
/// PBKDF2-SHA256 (250 000 iters) → 32-byte AES-GCM key; verifier plaintext
/// "cubbly-notes-v1"; all blobs base64-encoded; 12-byte IVs.
enum NotesCrypto {
    static let verifierPlaintext = "cubbly-notes-v1"
    static let defaultIterations = 250_000

    struct KeyMaterial {
        let salt: String
        let verifier_iv: String
        let verifier_ciphertext: String
        let iterations: Int
    }

    /// 32-byte raw AES key derived via PBKDF2-SHA256, matching Web Crypto.
    static func deriveKey(pin: String, salt: Data, iterations: Int) -> SymmetricKey? {
        var out = Data(count: 32)
        let pinData = Array(pin.utf8)
        let saltBytes = [UInt8](salt)
        let status = out.withUnsafeMutableBytes { rawBuf -> Int32 in
            guard let baseAddr = rawBuf.bindMemory(to: UInt8.self).baseAddress else { return -1 }
            return CCKeyDerivationPBKDF(
                CCPBKDFAlgorithm(kCCPBKDF2),
                pinData, pinData.count,
                saltBytes, saltBytes.count,
                CCPBKDFAlgorithm(kCCPRFHmacAlgSHA256),
                UInt32(iterations),
                baseAddr, 32
            )
        }
        guard status == kCCSuccess else { return nil }
        return SymmetricKey(data: out)
    }

    static func setupNewKey(pin: String) -> (key: SymmetricKey, material: KeyMaterial)? {
        var saltBytes = [UInt8](repeating: 0, count: 16)
        _ = SecRandomCopyBytes(kSecRandomDefault, 16, &saltBytes)
        let salt = Data(saltBytes)
        guard let key = deriveKey(pin: pin, salt: salt, iterations: defaultIterations) else { return nil }
        guard let plain = verifierPlaintext.data(using: .utf8),
              let sealed = try? AES.GCM.seal(plain, using: key) else { return nil }
        let iv = Data(sealed.nonce)
        let cipherWithTag = sealed.ciphertext + sealed.tag
        return (key, KeyMaterial(
            salt: salt.base64EncodedString(),
            verifier_iv: iv.base64EncodedString(),
            verifier_ciphertext: cipherWithTag.base64EncodedString(),
            iterations: defaultIterations
        ))
    }

    static func unlockKey(pin: String, material: KeyMaterial) -> SymmetricKey? {
        guard let saltData = Data(base64Encoded: material.salt),
              let ivData = Data(base64Encoded: material.verifier_iv),
              let cipherTagData = Data(base64Encoded: material.verifier_ciphertext),
              let key = deriveKey(pin: pin, salt: saltData, iterations: material.iterations) else { return nil }
        do {
            let plain = try decryptGCM(ivData: ivData, cipherWithTag: cipherTagData, key: key)
            guard let text = String(data: plain, encoding: .utf8), text == verifierPlaintext else { return nil }
            return key
        } catch {
            return nil
        }
    }

    static func encryptJSON<T: Encodable>(key: SymmetricKey, value: T) throws -> (iv: String, ciphertext: String) {
        let data = try JSONEncoder().encode(value)
        let nonce = AES.GCM.Nonce()
        let sealed = try AES.GCM.seal(data, using: key, nonce: nonce)
        let iv = Data(sealed.nonce)
        let cipherWithTag = sealed.ciphertext + sealed.tag
        return (iv.base64EncodedString(), cipherWithTag.base64EncodedString())
    }

    static func decryptJSON<T: Decodable>(_ type: T.Type, key: SymmetricKey, iv: String, ciphertext: String) throws -> T {
        guard let ivData = Data(base64Encoded: iv),
              let cipherTagData = Data(base64Encoded: ciphertext) else {
            throw NSError(domain: "NotesCrypto", code: -1)
        }
        let plain = try decryptGCM(ivData: ivData, cipherWithTag: cipherTagData, key: key)
        return try JSONDecoder().decode(T.self, from: plain)
    }

    private static func decryptGCM(ivData: Data, cipherWithTag: Data, key: SymmetricKey) throws -> Data {
        // Web Crypto AES-GCM appends the 16-byte auth tag to the ciphertext.
        guard cipherWithTag.count >= 16 else {
            throw NSError(domain: "NotesCrypto", code: -2)
        }
        let cipher = cipherWithTag.prefix(cipherWithTag.count - 16)
        let tag = cipherWithTag.suffix(16)
        let nonce = try AES.GCM.Nonce(data: ivData)
        let box = try AES.GCM.SealedBox(nonce: nonce, ciphertext: cipher, tag: tag)
        return try AES.GCM.open(box, using: key)
    }
}
