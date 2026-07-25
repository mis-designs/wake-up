-- Shared audio schema for Magicph and All Books.
-- Execute once in the shared Neon database. Existing audio rows are preserved.

CREATE TABLE IF NOT EXISTS quiz_audio_explanations (
  quiz_key TEXT PRIMARY KEY,
  audio_key TEXT NOT NULL,
  audio_mime_type TEXT NOT NULL DEFAULT 'audio/webm',
  audio_duration_ms INTEGER,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS magic_book_quiz_map (
  magic_quiz_id TEXT PRIMARY KEY,
  quiz_key TEXT NOT NULL UNIQUE,
  chapter TEXT,
  normalized_question TEXT NOT NULL,
  figure TEXT,
  match_status TEXT NOT NULL DEFAULT 'matched',
  catalog_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS magic_book_quiz_map_quiz_key_idx
  ON magic_book_quiz_map (quiz_key);
