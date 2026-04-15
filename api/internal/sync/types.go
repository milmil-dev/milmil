package sync

// ProviderName identifies an external watch-state provider (tracker).
type ProviderName string

const (
	ProviderBangumi ProviderName = "bangumi"
	ProviderAniList ProviderName = "anilist"
)

// Kind distinguishes the flavour of a sync op.
type Kind string

const (
	KindProgress Kind = "progress"
	KindStatus   Kind = "status"
	KindImport   Kind = "import"
)

// WatchStatus is milmil's canonical watch-state vocabulary. Providers map
// their own vocabulary onto these values.
type WatchStatus string

const (
	StatusNone      WatchStatus = "none"
	StatusPlanning  WatchStatus = "planning"
	StatusWatching  WatchStatus = "watching"
	StatusCompleted WatchStatus = "completed"
	StatusRepeating WatchStatus = "repeating"
	StatusPaused    WatchStatus = "paused"
	StatusDropped   WatchStatus = "dropped"
)

// SyncOp is the payload of an outbox row, serialised as JSON. Provider-native
// IDs are looked up at dispatch time from the anime row so the payload stays
// resilient to metadata changes.
type SyncOp struct {
	Kind     Kind        `json:"kind"`
	AnimeID  string      `json:"anime_id"`
	Status   WatchStatus `json:"status,omitempty"`
	Progress int         `json:"progress,omitempty"`
}
