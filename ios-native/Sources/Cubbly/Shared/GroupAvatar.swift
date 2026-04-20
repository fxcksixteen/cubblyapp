import SwiftUI

/// Mosaic group avatar — mirrors `GroupAvatar.tsx` from the web app. Renders
/// up to 3 member avatars in a circular tile when no explicit group picture
/// has been set.
struct GroupAvatar: View {
    let members: [Profile]
    var size: CGFloat = 48

    var body: some View {
        let shown = Array(members.prefix(3))
        ZStack {
            Circle().fill(Theme.Colors.bgTertiary)

            switch shown.count {
            case 0:
                Image(systemName: "person.2.fill")
                    .font(.system(size: size * 0.4))
                    .foregroundStyle(Theme.Colors.textSecondary)
            case 1:
                tile(for: shown[0], size: size)
            case 2:
                HStack(spacing: 0) {
                    tile(for: shown[0], size: size).frame(width: size / 2)
                    tile(for: shown[1], size: size).frame(width: size / 2)
                }
            default:
                VStack(spacing: 0) {
                    tile(for: shown[0], size: size).frame(height: size / 2)
                    HStack(spacing: 0) {
                        tile(for: shown[1], size: size).frame(width: size / 2)
                        tile(for: shown[2], size: size).frame(width: size / 2)
                    }
                    .frame(height: size / 2)
                }
            }
        }
        .frame(width: size, height: size)
        .clipShape(Circle())
        .overlay(Circle().stroke(Theme.Colors.bgPrimary, lineWidth: 1))
    }

    @ViewBuilder
    private func tile(for profile: Profile, size: CGFloat) -> some View {
        let url = profile.avatarURL.flatMap(URL.init(string:))
        ZStack {
            AvatarView.color(for: profile.displayName)
            if let url {
                AsyncImage(url: url) { phase in
                    if case .success(let image) = phase {
                        image.resizable().scaledToFill()
                    }
                }
            } else {
                Text(AvatarView.initials(from: profile.displayName))
                    .font(.system(size: size * 0.22, weight: .bold))
                    .foregroundStyle(.white)
            }
        }
        .clipped()
    }
}
