package storage

import (
	"github.com/milmil/api/internal/crypto"
	"github.com/milmil/api/internal/store"
)

// ProviderForLibrary builds a storage.Provider from a library row, decrypting
// the source config when present. Shared between the REST handler layer and
// the resolver auto-rename hook so both call sites stay in lockstep with how
// scan/duplicates construct providers.
func ProviderForLibrary(lib store.Library, encryptionKey []byte) (Provider, error) {
	var configJSON string
	if lib.SourceConfigEncrypted.Valid && lib.SourceConfigEncrypted.String != "" {
		decrypted, err := crypto.Decrypt(encryptionKey, lib.SourceConfigEncrypted.String)
		if err != nil {
			return nil, err
		}
		configJSON = decrypted
	}
	return NewProvider(lib.SourceType, configJSON)
}
