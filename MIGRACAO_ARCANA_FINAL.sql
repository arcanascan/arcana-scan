-- ARCANA SCAN • Migração incremental, executar uma vez antes do deploy.
-- Não apaga obras, capítulos, usuários ou sessões existentes.
CREATE TABLE IF NOT EXISTS reader_profiles (
 reader_id TEXT PRIMARY KEY REFERENCES reader_users(id) ON DELETE CASCADE,
 avatar TEXT NOT NULL DEFAULT 'nyx' CHECK(avatar IN ('lucien','nyx','elara','coby')),
 photo_key TEXT,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS reader_shelves (
 reader_id TEXT NOT NULL REFERENCES reader_users(id) ON DELETE CASCADE,
 work_id TEXT NOT NULL REFERENCES forja_works(id) ON DELETE CASCADE,
 shelf TEXT NOT NULL CHECK(shelf IN ('favoritos','amorzinho','casei-com-a-putaria','vou-sofrer','ler-de-madrugada','meus-xodos')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY(reader_id,work_id,shelf)
);
CREATE INDEX IF NOT EXISTS idx_reader_shelves_reader ON reader_shelves(reader_id,shelf);
CREATE TABLE IF NOT EXISTS arcana_applications (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 email TEXT NOT NULL,
 role TEXT NOT NULL,
 experience TEXT NOT NULL DEFAULT '',
 message TEXT NOT NULL DEFAULT '',
 birth_date TEXT,
 nickname TEXT,
 phone TEXT,
 language TEXT,
 ip_hash TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','reviewing','accepted','rejected')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_arcana_applications_ip ON arcana_applications(ip_hash,created_at);

-- Para bancos que já possuem arcana_applications, o Worker adiciona automaticamente
-- as quatro novas colunas com PRAGMA table_info e ALTER TABLE quando necessário.
