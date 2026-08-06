import SwiftUI
import PhotosUI
import Supabase

/// Uploads a single picked photo to the public `avatars` bucket and writes
/// the resulting URL to the user's profile under either `avatar_url` or
/// `banner_url`. Mirrors what `SettingsModal.handleAvatarUpload` does on web.
enum ProfilePhotoUploader {
    enum Kind { case avatar, banner }

    static func upload(item: PhotosPickerItem, kind: Kind, userID: UUID) async -> String? {
        do {
            guard let raw = try await item.loadTransferable(type: Data.self) else { return nil }
            let data = compress(raw, kind: kind)
            let prefix = kind == .avatar ? "avatar" : "banner"
            let path = "\(userID.uuidString)/\(prefix)-\(Int(Date().timeIntervalSince1970 * 1000)).jpg"
            let client = SupabaseManager.shared.client
            _ = try await client.storage
                .from("avatars")
                .upload(path, data: data, options: FileOptions(contentType: "image/jpeg", upsert: true))
            let url = try client.storage.from("avatars").getPublicURL(path: path).absoluteString
            let column = kind == .avatar ? "avatar_url" : "banner_url"
            try await client.from("profiles")
                .update([column: url])
                .eq("user_id", value: userID)
                .execute()
            return url
        } catch {
            print("[ProfilePhotoUploader] upload failed:", error)
            return nil
        }
    }

    /// Re-encode HEIC / large images down to a reasonable JPEG so we don't
    /// blow up bandwidth or the 50MB Supabase Storage limit. Avatars are
    /// rendered tiny (≤80pt) so 512px is plenty; banners get more room.
    private static func compress(_ data: Data, kind: Kind) -> Data {
        guard let img = UIImage(data: data) else { return data }
        let maxSide: CGFloat = kind == .avatar ? 512 : 1280
        let quality: CGFloat = kind == .avatar ? 0.8 : 0.82
        let scale = min(1, maxSide / max(img.size.width, img.size.height))
        let target = CGSize(width: img.size.width * scale, height: img.size.height * scale)
        let renderer = UIGraphicsImageRenderer(size: target)
        let resized = renderer.image { _ in img.draw(in: CGRect(origin: .zero, size: target)) }
        return resized.jpegData(compressionQuality: quality) ?? data
    }
}
