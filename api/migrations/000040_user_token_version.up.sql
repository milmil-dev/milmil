-- token_version invalidates already-issued Jellyfin JWTs.
--
-- Unlike the opaque API tokens, which are rows we can delete, a JWT is only a
-- signature: once handed out it stays valid until it expires. Embedding this
-- counter in the claims and bumping it on password change gives those tokens a
-- revocation path.
ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0;
