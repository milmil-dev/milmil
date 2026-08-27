import MilmilPlayer

extension StreamStage {
    /// User-facing name of the rung. `MilmilPlayer` is platform-neutral and
    /// carries no string catalog, so its `label` is the raw zh-Hant literal;
    /// every badge / row / meta line in the app goes through this instead.
    var localizedLabel: String {
        switch self {
        case .offlineCopy: String(localized: "本機副本")
        case .localFile: String(localized: "本機檔案")
        case .direct: String(localized: "直接串流")
        case .remux: "Remux"
        case .hls: String(localized: "轉碼 (HLS)")
        }
    }

    /// Where the bytes come from, at a glance: local disk, mapped mount, the
    /// network, or the server working on them.
    var symbol: String {
        switch self {
        case .offlineCopy: "internaldrive"
        case .localFile: "externaldrive"
        case .direct: "antenna.radiowaves.left.and.right"
        case .remux: "shippingbox"
        case .hls: "arrow.triangle.2.circlepath"
        }
    }
}
