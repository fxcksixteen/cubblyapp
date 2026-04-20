import SwiftUI
import Supabase

/// Email or username + password login. Uses the same `login-with-username`
/// edge function as the web app for username login.
struct LoginView: View {
    @State private var identifier = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var showRegister = false

    var body: some View {
        ScrollView {
            VStack(spacing: 24) {
                Spacer(minLength: 60)

                VStack(spacing: 8) {
                    if let img = UIImage(named: "cubbly-nobg") {
                        Image(uiImage: img)
                            .resizable()
                            .scaledToFit()
                            .frame(width: 96, height: 96)
                    }
                    Text("Welcome back")
                        .font(Theme.Fonts.title)
                        .foregroundStyle(Theme.Colors.textPrimary)
                    Text("Your cozy corner of the internet")
                        .font(Theme.Fonts.bodySmall)
                        .foregroundStyle(Theme.Colors.textSecondary)
                }

                VStack(spacing: 12) {
                    CubblyTextField(
                        placeholder: "Email or username",
                        text: $identifier,
                        keyboard: .emailAddress
                    )
                    CubblyTextField(
                        placeholder: "Password",
                        text: $password,
                        isSecure: true
                    )

                    if let errorMessage {
                        Text(errorMessage)
                            .font(Theme.Fonts.bodySmall)
                            .foregroundStyle(Theme.Colors.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    CubblyPrimaryButton(title: "Log In", isLoading: isLoading) {
                        Task { await login() }
                    }
                    .disabled(identifier.isEmpty || password.isEmpty || isLoading)

                    Button {
                        showRegister = true
                    } label: {
                        HStack(spacing: 4) {
                            Text("Need an account?")
                                .foregroundStyle(Theme.Colors.textSecondary)
                            Text("Register")
                                .foregroundStyle(Theme.Colors.primary)
                                .fontWeight(.semibold)
                        }
                        .font(Theme.Fonts.bodySmall)
                    }
                    .padding(.top, 4)
                }
                .padding(.horizontal, 20)

                Spacer()
            }
            .frame(maxWidth: 420)
            .frame(maxWidth: .infinity)
        }
        .background(Theme.Colors.bgTertiary)
        .sheet(isPresented: $showRegister) {
            RegisterView()
        }
    }

    private func login() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        let trimmed = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        let email: String
        if trimmed.contains("@") {
            email = trimmed
        } else {
            // Resolve username -> email via the same edge function the web app uses.
            do {
                email = try await resolveUsernameToEmail(username: trimmed)
            } catch {
                errorMessage = "We couldn't find that account."
                return
            }
        }

        do {
            try await SupabaseManager.shared.client.auth.signIn(email: email, password: password)
        } catch {
            errorMessage = "Invalid email or password."
        }
    }

    private func resolveUsernameToEmail(username: String) async throws -> String {
        struct Request: Encodable { let username: String }
        struct Response: Decodable { let email: String }
        let response: Response = try await SupabaseManager.shared.client.functions.invoke(
            "get-email-by-username",
            options: .init(body: Request(username: username))
        )
        return response.email
    }
}
