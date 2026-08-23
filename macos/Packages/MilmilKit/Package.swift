// swift-tools-version: 6.0
import PackageDescription

// Platform-neutral core of the milmil desktop client: API client, models,
// auth/keychain. Kept free of AppKit/SwiftUI so an iOS target can share it.
let package = Package(
    name: "MilmilKit",
    defaultLocalization: "zh-Hant",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "MilmilAPI", targets: ["MilmilAPI"]),
    ],
    targets: [
        .target(
            name: "MilmilAPI",
            swiftSettings: [
                .swiftLanguageMode(.v6),
                .enableUpcomingFeature("ExistentialAny"),
            ]
        ),
        .testTarget(
            name: "MilmilAPITests",
            dependencies: ["MilmilAPI"],
            resources: [.copy("Fixtures")],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
