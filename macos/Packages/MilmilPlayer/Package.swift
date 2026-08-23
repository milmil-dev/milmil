// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MilmilPlayer",
    platforms: [.macOS(.v15)],
    products: [
        .library(name: "MilmilPlayer", targets: ["MilmilPlayer"]),
    ],
    dependencies: [
        // LGPL product: libmpv 0.41 + FFmpeg 8.1 + libplacebo, prebuilt xcframeworks.
        .package(url: "https://github.com/mpvkit/MPVKit.git", exact: "1.0.0"),
    ],
    targets: [
        .target(
            name: "MilmilPlayer",
            dependencies: [
                .product(name: "MPVKit", package: "MPVKit"),
            ],
            swiftSettings: [
                .enableUpcomingFeature("StrictConcurrency"),
            ]
        ),
        .testTarget(
            name: "MilmilPlayerTests",
            dependencies: ["MilmilPlayer"]
        ),
    ]
)
