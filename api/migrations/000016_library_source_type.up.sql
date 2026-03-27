ALTER TABLE libraries ADD COLUMN source_type TEXT NOT NULL DEFAULT 'local';
ALTER TABLE libraries ADD COLUMN source_config_encrypted TEXT;
