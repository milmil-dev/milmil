import MilmilAPI

// `Segmented` needs Identifiable; the API package keeps its enums plain.
extension HistoryFilter: Identifiable {
    public var id: String { rawValue }
}

extension MilmilNotification.Category: Identifiable {
    public var id: String { rawValue }
}

extension MediaFileFilter: Identifiable {
    public var id: String { rawValue }
}
