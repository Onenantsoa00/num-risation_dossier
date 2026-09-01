-- Migration v2 : FIFO, deadlines, congés, présence, workflow dispatch
-- Exécuter : psql -d gestion_dossiers -f database/migration_v2.sql

-- Nouveau statut : en attente d'assignation vérificateur par admin
ALTER TABLE dossier DROP CONSTRAINT IF EXISTS chk_dossier_statut;
ALTER TABLE dossier ADD CONSTRAINT chk_dossier_statut CHECK (
    statut IN (
        'EN_ATTENTE_DISPATCH',
        'EN_ATTENTE_VERIFICATEUR',
        'EN_VERIFICATION',
        'EN_VALIDATION',
        'VALIDE',
        'REJETE',
        'RETOUR_DISPATCH',
        'ARCHIVE'
    )
);

-- Colonnes dossier
ALTER TABLE dossier ADD COLUMN IF NOT EXISTS comparaison_active BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dossier ADD COLUMN IF NOT EXISTS admin_modifie BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE dossier ADD COLUMN IF NOT EXISTS assigned_verification_at TIMESTAMPTZ;
ALTER TABLE dossier ADD COLUMN IF NOT EXISTS assigned_validation_at TIMESTAMPTZ;
ALTER TABLE dossier ADD COLUMN IF NOT EXISTS deadline_verif_elapsed_sec INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dossier ADD COLUMN IF NOT EXISTS deadline_valid_elapsed_sec INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dossier ADD COLUMN IF NOT EXISTS deadline_verif_paused_at TIMESTAMPTZ;
ALTER TABLE dossier ADD COLUMN IF NOT EXISTS deadline_valid_paused_at TIMESTAMPTZ;

-- Colonnes utilisateur : congé et présence
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS conge_debut DATE;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS conge_fin DATE;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS presence_status VARCHAR(20) DEFAULT 'offline';
ALTER TABLE utilisateur ADD COLUMN IF NOT EXISTS presence_dossier_id INTEGER;

-- Index FIFO
CREATE INDEX IF NOT EXISTS idx_dossier_fifo_verif ON dossier (id_verificateur, assigned_verification_at)
    WHERE statut = 'EN_VERIFICATION';
CREATE INDEX IF NOT EXISTS idx_dossier_fifo_valid ON dossier (id_validateur, assigned_validation_at)
    WHERE statut = 'EN_VALIDATION';
CREATE INDEX IF NOT EXISTS idx_dossier_attente_verif ON dossier (statut)
    WHERE statut = 'EN_ATTENTE_VERIFICATEUR';
