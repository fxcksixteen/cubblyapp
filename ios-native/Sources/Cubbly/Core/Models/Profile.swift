import Foundation

/// Mirrors `public.profiles` row in the database.
struct Profile: Codable, Identifiable, Hashable {
    let id: UUID
    let userID: UUID
    var username: String
    var displayName: String
    var avatarURL: String?
    var bannerURL: String?
    var bio: String?
    var status: String
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userID = "user_id"
        case username
        case displayName = "display_name"
        case avatarURL = "avatar_url"
        case bannerURL = "banner_url"
        case bio
        case status
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}
