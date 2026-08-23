// swift-tools-version: 6.0
import PackageDescription

// Platform-neutral core of the milmil desktop client: API client, models,
// auth/keychain, realtime events. Kept free of AppKit/SwiftUI so an iOS
// target can share it.
let package = Package(
    name: "MilmilKit",
    defaultLocalization: "zh-Hant",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "MilmilAPI", targets: ["MilmilAPI"]),
        .library(name: "MilmilRealtime", targets: ["MilmilRealtime"]),
    ],
    targets: [
        .target(
            name: "MilmilAPI",
            swiftSettings: [
                .swiftLanguageMode(.v6),
                .enableUpcomingFeature("ExistentialAny"),
            ]
        ),
        .target(
            name: "MilmilRealtime",
            dependencies: ["MilmilAPI"],
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
        .testTarget(
            name: "MilmilRealtimeTests",
            dependencies: ["MilmilRealtime"],
            swiftSettings: [.swiftLanguageMode(.v6)]
        ),
    ]
)
