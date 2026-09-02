-- Migration : Colonne dossier_lie_id pour lier ancien/nouveau dossier
-- Exécuter : psql -d gestion_dossiers -f database/migration_dossier_lie.sql

ALTER TABLE dossier ADD COLUMN IF NOT EXISTS dossier_lie_id INTEGER;
ALTER TABLE dossier ADD CONSTRAINT fk_dossier_lie
  FOREIGN KEY (dossier_lie_id) REFERENCES dossier(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dossier_lie ON dossier(dossier_lie_id)
  WHERE dossier_lie_id IS NOT NULL;
