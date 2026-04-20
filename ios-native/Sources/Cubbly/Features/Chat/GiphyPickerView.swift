import SwiftUI

/// GIPHY search via the existing `giphy-search` Supabase edge function.
struct GiphyPickerView: View {
    var onPick: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""
    @State private var results: [GiphyHit] = []
    @State private var loading = false

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                SVGIcon(name: "search", size: 14, tint: Theme.Colors.textMuted)
                TextField("Search GIPHY", text: $query)
                    .font(Theme.Fonts.bodySmall)
                    .foregroundStyle(Theme.Colors.textPrimary)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .onSubmit { Task { await search() } }
            }
            .padding(10)
            .background(Theme.Colors.bgTertiary)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .padding(12)

            if loading {
                ProgressView().tint(Theme.Colors.primary).padding()
            }

            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                    ForEach(results) { hit in
                        Button { onPick(hit.url) } label: {
                            AsyncImage(url: URL(string: hit.previewURL)) { img in
                                img.resizable().scaledToFill()
                            } placeholder: {
                                Rectangle().fill(Theme.Colors.bgSecondary)
                            }
                            .frame(height: 120)
                            .clipped()
                            .clipShape(RoundedRectangle(cornerRadius: 6))
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.bottom, 20)
            }
        }
        .background(Theme.Colors.bgPrimary)
        .task { await search() }
    }

    private func search() async {
        loading = true
        defer { loading = false }
        do {
            let q = query.isEmpty ? "trending" : query
            let url = CubblyConfig.functionsURL.appendingPathComponent("giphy-search")
            var req = URLRequest(url: url)
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.setValue("Bearer \(CubblyConfig.supabaseAnonKey)", forHTTPHeaderField: "Authorization")
            req.setValue(CubblyConfig.supabaseAnonKey, forHTTPHeaderField: "apikey")
            req.httpBody = try JSONSerialization.data(withJSONObject: ["query": q])
            let (data, _) = try await URLSession.shared.data(for: req)
            struct Resp: Decodable { let results: [GiphyHit] }
            results = (try? JSONDecoder().decode(Resp.self, from: data).results) ?? []
        } catch {
            print("[Giphy] search failed:", error)
            results = []
        }
    }
}

struct GiphyHit: Decodable, Identifiable {
    let id: String
    let url: String
    let previewURL: String
    let title: String?

    enum CodingKeys: String, CodingKey {
        case id, url, title
        case previewURL = "preview_url"
    }
}
