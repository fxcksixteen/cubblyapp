import SwiftUI

struct ActivityArtworkView: View {
    let name: String?
    let processName: String?
    var size: CGFloat = 32
    var cornerRadius: CGFloat = 7

    @State private var image: UIImage?
    @State private var failed = false

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius).fill(AvatarView.color(for: key).opacity(0.95))
            if let image {
                Image(uiImage: image).resizable().scaledToFill()
            } else {
                Text(String((name ?? processName ?? "?").prefix(1)).uppercased())
                    .font(.cubbly(size * 0.38, .heavy))
                    .foregroundStyle(.white)
            }
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius))
        .task(id: key) { await load() }
    }

    private var key: String { (name ?? processName ?? "activity").lowercased() }

    private func load() async {
        guard !failed, let url = Self.iconURL(name: name, processName: processName) else { return }
        do {
            let (data, _) = try await URLSession.shared.data(from: url)
            let img = UIImage(data: data) ?? SVGKImage(data: data)?.uiImage
            if let img { await MainActor.run { image = img } }
            else { failed = true }
        } catch { failed = true }
    }

    static func iconURL(name: String?, processName: String? = nil) -> URL? {
        let candidates = [name, processName].compactMap { $0?.lowercased().trimmingCharacters(in: .whitespacesAndNewlines) }
        for key in candidates {
            if let s = curated[key] ?? steamApps[key].map(steamHeaderUrl) { return URL(string: s) }
        }
        return nil
    }

    private static func steamHeaderUrl(_ appId: Int) -> String {
        "https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/\(appId)/capsule_184x69.jpg"
    }

    private static let curated: [String: String] = [
        "valorant": "https://cdn.simpleicons.org/valorant/FF4654",
        "valorant-win64-shipping": "https://cdn.simpleicons.org/valorant/FF4654",
        "league of legends": "https://cdn.simpleicons.org/leagueoflegends/C89B3C",
        "leagueclient": "https://cdn.simpleicons.org/leagueoflegends/C89B3C",
        "teamfight tactics": "https://cdn.simpleicons.org/riotgames/D32936",
        "tft": "https://cdn.simpleicons.org/riotgames/D32936",
        "steam": "https://cdn.simpleicons.org/steam/FFFFFF",
        "counter-strike 2": steamHeaderUrl(730), "cs2": steamHeaderUrl(730), "csgo": steamHeaderUrl(730),
        "dota 2": steamHeaderUrl(570), "dota2": steamHeaderUrl(570), "half-life 2": steamHeaderUrl(220), "hl2": steamHeaderUrl(220),
        "fortnite": "https://cdn.simpleicons.org/epicgames/313131",
        "fortniteclient-win64-shipping": "https://cdn.simpleicons.org/epicgames/313131",
        "rocket league": steamHeaderUrl(252950), "rocketleague": steamHeaderUrl(252950),
        "minecraft": "https://cdn.simpleicons.org/minecraft/62B47A", "minecraft launcher": "https://cdn.simpleicons.org/minecraft/62B47A", "javaw": "https://cdn.simpleicons.org/minecraft/62B47A",
        "roblox": "https://cdn.simpleicons.org/roblox/FFFFFF", "robloxplayerbeta": "https://cdn.simpleicons.org/roblox/FFFFFF",
        "battle.net": "https://cdn.simpleicons.org/battledotnet/00AEFF",
        "apex legends": steamHeaderUrl(1172470), "r5apex": steamHeaderUrl(1172470),
        "rainbow six siege": steamHeaderUrl(359550), "rainbow6": steamHeaderUrl(359550), "rainbowsix": steamHeaderUrl(359550),
        "among us": steamHeaderUrl(945360), "terraria": steamHeaderUrl(105600), "stardew valley": steamHeaderUrl(413150), "hollow knight": steamHeaderUrl(367520),
        "discord": "https://cdn.simpleicons.org/discord/5865F2", "spotify": "https://cdn.simpleicons.org/spotify/1DB954",
        "visual studio code": "https://cdn.simpleicons.org/visualstudiocode/007ACC", "vscode": "https://cdn.simpleicons.org/visualstudiocode/007ACC", "code": "https://cdn.simpleicons.org/visualstudiocode/007ACC",
        "obs": "https://cdn.simpleicons.org/obsstudio/302E31", "obs64": "https://cdn.simpleicons.org/obsstudio/302E31",
        "chrome": "https://cdn.simpleicons.org/googlechrome/4285F4", "firefox": "https://cdn.simpleicons.org/firefoxbrowser/FF7139"
    ]

    private static let steamApps: [String: Int] = [
        "team fortress 2": 440, "tf2": 440, "garry's mod": 4000, "gmod": 4000, "rust": 252490,
        "the witcher 3": 292030, "elden ring": 1245620, "cyberpunk 2077": 1091500
    ]
}