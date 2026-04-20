import SwiftUI
import Supabase

struct RegisterView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var username = ""
    @State private var displayName = ""
    @State private var password = ""
    @State private var isLoading = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    CubblyTextField(placeholder: "Email", text: $email, keyboard: .emailAddress)
                    CubblyTextField(placeholder: "Username", text: $username)
                    CubblyTextField(placeholder: "Display name", text: $displayName)
                    CubblyTextField(placeholder: "Password (8+ characters)", text: $password, isSecure: true)

                    if let errorMessage {
                        Text(errorMessage)
                            .font(Theme.Fonts.bodySmall)
                            .foregroundStyle(Theme.Colors.danger)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    CubblyPrimaryButton(title: "Create account", isLoading: isLoading) {
                        Task { await register() }
                    }
                    .disabled(!canSubmit || isLoading)
                }
                .padding(20)
            }
            .background(Theme.Colors.bgTertiary)
            .navigationTitle("Join Cubbly")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .foregroundStyle(Theme.Colors.textSecondary)
                }
            }
        }
    }

    private var canSubmit: Bool {
        email.contains("@") && username.count >= 2 && displayName.count >= 1 && password.count >= 8
    }

    private func register() async {
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }

        do {
            _ = try await SupabaseManager.shared.client.auth.signUp(
                email: email,
                password: password,
                data: [
                    "username": .string(username),
                    "display_name": .string(displayName)
                ]
            )
            dismiss()
        } catch {
            errorMessage = "Couldn't create account: \(error.localizedDescription)"
        }
    }
}
