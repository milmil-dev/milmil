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
        .library(name: "MilmilDanmaku", targets: ["MilmilDanmaku"]),
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
        // Danmaku model, parsers, pipeline and lane scheduler — pure logic,
        // no MilmilAPI dependency so it can be tested and reused anywhere.
        .target(
            name: "MilmilDanmaku",
            swiftSettings: [
                .swiftLanguageMode(.v6),
                .enableUpcomingFeature("ExistentialAny"),
            ]
        ),
        .testTarget(
            name: "MilmilDanmakuTests",
            dependencies: ["MilmilDanmaku"],
            swiftSettings: [.swiftLanguageMode(.v6)]
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
