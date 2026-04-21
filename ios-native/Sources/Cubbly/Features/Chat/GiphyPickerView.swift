import SwiftUI
import Supabase

/// GIPHY picker — three tabs (Trending, Search, Favorites). Calls the
/// existing `giphy-search` Supabase edge function. Decoder matches the real
/// GIPHY API shape (`data: [...]` with `images.fixed_height.url`).
struct GiphyPickerView: View {
    var onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var session: SessionStore

    enum Mode: String, CaseIterable, Identifiable {
        case trending = "Trending", search = "Search", favorites = "Favorites"
        var id: String { rawValue }
    }

    @State private var mode: Mode = .trending
    @State private var query = ""
    @State private var results: [GifItem] = []
    @State private var favorites: [GifItem] = []
    @State private var loading = false

    var body: some View {
        VStack(spacing: 0) {
            // Tabs
            HStack(spacing: 4) {
                ForEach(Mode.allCases) { m in
                    Button { mode = m } label: {
                        Text(m.rawValue)
                            .font(Theme.Fonts.bodyMedium)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 6)
                            .background(mode == m ? Theme.Colors.bgTertiary : .clear)
                            .foregroundStyle(mode == m ? Theme.Colors.textPrimary : Theme.Colors.textSecondary)
                            .clipShape(Capsule())
                    }
                    .buttonStyle(.plain)
                }
                Spacer()
            }
            .padding(.horizontal, 12)
            .padding(.top, 12)

            if mode == .search {
                HStack {
                    SVGIcon(name: "search", size: 14, tint: Theme.Colors.textMuted)
                    TextField("Search GIPHY", text: $query)
                        .font(Theme.Fonts.bodySmall)
                        .foregroundStyle(Theme.Colors.textPrimary)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .onSubmit { Task { await fetch() } }
                }
                .padding(10)
                .background(Theme.Colors.bgTertiary)
                .clipShape(RoundedRectangle(cornerRadius: 8))
                .padding(12)
            }

            if loading {
                ProgressView().tint(Theme.Colors.primary).padding()
            }

            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 6),
                                    GridItem(.flexible(), spacing: 6)], spacing: 6) {
                    ForEach(displayed) { hit in
                        GifThumb(item: hit, isFavorited: favorites.contains(where: { $0.gifID == hit.gifID }))
                            .onTapGesture {
                                onPick(hit.url)
                                dismiss()
                            }
                            .onLongPressGesture {
                                Task { await toggleFavorite(hit) }
                            }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 24)
            }
        }
        .background(Theme.Colors.bgPrimary)
        .onChange(of: mode) { _, _ in Task { await fetch() } }
        .task {
            await loadFavorites()
            await fetch()
        }
    }

    private var displayed: [GifItem] {
        mode == .favorites ? favorites : results
    }

    // MARK: - Networking

    private func fetch() async {
        loading = true
        defer { loading = false }
        if mode == .favorites { await loadFavorites(); return }
        let q = mode == .search && !query.trimmingCharacters(in: .whitespaces).isEmpty
            ? query
            : "trending"
        do {
            let url = CubblyConfig.functionsURL.appendingPathComponent("giphy-search")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(CubblyConfig.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
            req.setValue(CubblyConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
            req.httpBody = try JSONSerialization.data(withJSONObject: [
                "query": q,
                "type": mode == .trending ? "trending" : "search",
                "limit": 30
            ])
            let (data, _) = try await URLSession.shared.data(for: req)
            results = try GiphyResponse.decode(data)
        } catch {
            print("[Giphy] fetch failed:", error)
            results = []
        }
    }

    private func loadFavorites() async {
        guard let me = session.currentUserID else { return }
        do {
            struct FavRow: Decodable {
                let gif_id: String
                let gif_url: String
                let gif_preview_url: String
                let title: String?
            }
            let rows: [FavRow] = try await SupabaseManager.shared.client
                .from("gif_favorites")
                .select("gif_id,gif_url,gif_preview_url,title")
                .eq("user_id", value: me)
                .order("created_at", ascending: false)
                .execute()
                .value
            favorites = rows.map {
                GifItem(gifID: $0.gif_id, url: $0.gif_url, previewURL: $0.gif_preview_url, title: $0.title)
            }
        } catch {
            print("[Giphy] favorites failed:", error)
        }
    }

    private func toggleFavorite(_ hit: GifItem) async {
        guard let me = session.currentUserID else { return }
        let client = SupabaseManager.shared.client
        do {
            if favorites.contains(where: { $0.gifID == hit.gifID }) {
                _ = try await client.from("gif_favorites").delete()
                    .eq("user_id", value: me).eq("gif_id", value: hit.gifID).execute()
            } else {
                struct NewFav: Encodable {
                    let user_id: UUID; let gif_id: String
                    let gif_url: String; let gif_preview_url: String; let title: String?
                }
                _ = try await client.from("gif_favorites").insert(NewFav(
                    user_id: me, gif_id: hit.gifID,
                    gif_url: hit.url, gif_preview_url: hit.previewURL, title: hit.title
                )).execute()
            }
        } catch {
            print("[Giphy] toggleFavorite failed:", error)
        }
        await loadFavorites()
    }
}

private struct GifThumb: View {
    let item: GifItem
    let isFavorited: Bool
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let url = URL(string: item.previewURL) {
                    AnimatedImageView(url: url, contentMode: .scaleAspectFill)
                } else {
                    Rectangle().fill(Theme.Colors.bgSecondary)
                }
            }
            .frame(height: 120)
            .clipped()
            .clipShape(RoundedRectangle(cornerRadius: 8))

            if isFavorited {
                Image(systemName: "star.fill")
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(.yellow)
                    .padding(5)
            }
        }
    }
}

struct GifItem: Identifiable, Hashable {
    var id: String { gifID }
    let gifID: String
    let url: String          // animated gif URL (sendable)
    let previewURL: String   // thumbnail URL (often same)
    let title: String?
}

/// Decodes the real GIPHY API response shape returned by our edge function.
enum GiphyResponse {
    static func decode(_ data: Data) throws -> [GifItem] {
        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let items = (json?["data"] as? [[String: Any]]) ?? []
        return items.compactMap { obj -> GifItem? in
            guard let id = obj["id"] as? String else { return nil }
            let images = obj["images"] as? [String: Any] ?? [:]
            // Animated MP4-fallback-safe URL
            let fixedH = images["fixed_height"] as? [String: Any]
            let downsized = images["downsized"] as? [String: Any]
            let original = images["original"] as? [String: Any]
            let url = (fixedH?["url"] as? String)
                   ?? (downsized?["url"] as? String)
                   ?? (original?["url"] as? String)
                   ?? ""
            let preview = (images["fixed_height_small"] as? [String: Any])?["url"] as? String
                       ?? (fixedH?["url"] as? String)
                       ?? url
            let title = obj["title"] as? String
            guard !url.isEmpty else { return nil }
            return GifItem(gifID: id, url: url, previewURL: preview, title: title)
        }
    }
}
