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
}
