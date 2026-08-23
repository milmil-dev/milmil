import AppKit
import SwiftUI

/// The tilted cinema wall as a self-contained AppKit layer tree. SwiftUI's
/// `rotation3DEffect` with perspective ends up on a layer shared with the
/// rest of the window on macOS (everything skews), so the perspective is
/// applied here as the container's `sublayerTransform` and never leaks.
struct PosterWallLayerView: NSViewRepresentable {
    var covers: [URL]
    var fallbackSeeds: [String]
    var columns = 14
    var slots = 210

    func makeNSView(context: Context) -> PosterWallNSView {
        let view = PosterWallNSView()
        view.configure(columns: columns, slots: slots, seeds: fallbackSeeds)
        view.update(covers: covers)
        return view
    }

    func updateNSView(_ view: PosterWallNSView, context: Context) {
        view.update(covers: covers)
    }
}

final class PosterWallNSView: NSView {
    private let wall = CALayer()
    private var tiles: [CALayer] = []
    private var columns = 14
    private var seeds: [String] = []
    private var covers: [URL] = []
    private var loads: [Int: Task<Void, Never>] = [:]
    private var lastCoverSignature: [URL] = []

    override init(frame: CGRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.masksToBounds = true
        layer?.backgroundColor = NSColor(Theme.background).cgColor
        wall.anchorPoint = CGPoint(x: 0.5, y: 0.5)
        layer?.addSublayer(wall)
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { nil }

    override var isFlipped: Bool { true }

    func configure(columns: Int, slots: Int, seeds: [String]) {
        self.columns = columns
        self.seeds = seeds
        tiles.forEach { $0.removeFromSuperlayer() }
        tiles = (0..<slots).map { index in
            let tile = CALayer()
            tile.cornerRadius = 3
            tile.masksToBounds = true
            tile.contentsGravity = .resizeAspectFill
            tile.backgroundColor = Self.fallbackColor(for: seeds.isEmpty ? "milmil" : seeds[index % seeds.count] + String(index)).cgColor
            wall.addSublayer(tile)
            return tile
        }
        needsLayout = true
    }

    func update(covers: [URL]) {
        guard covers != lastCoverSignature else { return }
        lastCoverSignature = covers
        self.covers = covers
        loads.values.forEach { $0.cancel() }
        loads.removeAll()
        guard !covers.isEmpty else {
            tiles.forEach { $0.contents = nil }
            return
        }
        for (index, tile) in tiles.enumerated() {
            let url = covers[index % covers.count]
            loads[index] = Task { [weak tile] in
                guard let image = await ImageCache.shared.image(for: url, maxPixel: 240), !Task.isCancelled else { return }
                CATransaction.begin()
                CATransaction.setAnimationDuration(1.2)
                tile?.contents = image
                CATransaction.commit()
            }
        }
    }

    override func layout() {
        super.layout()
        let size = bounds.size
        guard size.width > 0, size.height > 0 else { return }

        // Web: the grid spans 180 % of the viewport, 14 columns, 5 px / 10 px gaps.
        let gridWidth = size.width * 1.8
        let gapX: CGFloat = 5, gapY: CGFloat = 10
        let tileWidth = (gridWidth - gapX * CGFloat(columns - 1)) / CGFloat(columns)
        let tileHeight = tileWidth * 1.5
        let rows = Int(ceil(Double(tiles.count) / Double(columns)))
        let gridHeight = CGFloat(rows) * tileHeight + CGFloat(rows - 1) * gapY

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        wall.bounds = CGRect(x: 0, y: 0, width: gridWidth, height: gridHeight)
        wall.position = CGPoint(x: size.width / 2, y: size.height * 0.4)
        for (index, tile) in tiles.enumerated() {
            let col = index % columns, row = index / columns
            tile.frame = CGRect(x: CGFloat(col) * (tileWidth + gapX), y: CGFloat(row) * (tileHeight + gapY), width: tileWidth, height: tileHeight)
        }
        // perspective(1400px) rotateY(-22deg) rotateZ(2deg), as on the web.
        var transform = CATransform3DIdentity
        transform.m34 = -1 / 1400
        transform = CATransform3DRotate(transform, -22 * .pi / 180, 0, 1, 0)
        transform = CATransform3DRotate(transform, 2 * .pi / 180, 0, 0, 1)
        wall.sublayerTransform = CATransform3DIdentity
        wall.transform = transform
        CATransaction.commit()
    }

    override func viewDidChangeBackingProperties() {
        super.viewDidChangeBackingProperties()
        let scale = window?.backingScaleFactor ?? 2
        wall.contentsScale = scale
        tiles.forEach { $0.contentsScale = scale }
    }

    private static func fallbackColor(for seed: String) -> NSColor {
        var hash: UInt32 = 5381
        for scalar in seed.unicodeScalars { hash = ((hash << 5) &+ hash) ^ UInt32(truncatingIfNeeded: scalar.value) }
        return NSColor(hue: CGFloat(hash % 360) / 360, saturation: 0.7, brightness: 0.32, alpha: 1)
    }
}
