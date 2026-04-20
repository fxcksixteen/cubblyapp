// swift-tools-version: 5.9
// SwiftPM manifest used for CLI test runs and IDE indexing.
// The actual app target is built via the Xcode project (generated from project.yml).

import PackageDescription

let package = Package(
    name: "Cubbly",
    platforms: [.iOS(.v17)],
    products: [
        .library(name: "CubblyKit", targets: ["CubblyKit"])
    ],
    dependencies: [
        .package(url: "https://github.com/supabase/supabase-swift", from: "2.24.0")
    ],
    targets: [
        // Headless library mirror of the app's logic so we can unit-test models /
        // repositories from `swift test`. The SwiftUI views live in the Xcode
        // target only (they need UIKit + Resources).
        .target(
            name: "CubblyKit",
            dependencies: [
                .product(name: "Supabase", package: "supabase-swift")
            ],
            path: "Sources/CubblyKit"
        ),
        .testTarget(
            name: "CubblyKitTests",
            dependencies: ["CubblyKit"],
            path: "Tests/CubblyKitTests"
        )
    ]
)
