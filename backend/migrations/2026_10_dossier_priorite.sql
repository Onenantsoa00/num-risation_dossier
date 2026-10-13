-- Priorité de traitement d'un dossier.
--
-- Un dossier réimporté après un RETOUR DISPATCH ne repasse plus par la
-- vérification : il part directement en validation chez le validateur /
-- admin qui figure dans les « Acteurs » du dossier. Ce dossier est
-- PRIORITAIRE : il se place en tête de liste et double la file FIFO.
ALTER TABLE dossier
  ADD COLUMN IF NOT EXISTS priorite boolean NOT NULL DEFAULT FALSE;

-- Accélère la recherche des dossiers prioritaires en validation
-- (ordre de liste + contrôle FIFO).
CREATE INDEX IF NOT EXISTS idx_dossier_priorite_valid
  ON dossier (id_validateur, priorite)
  WHERE statut = 'EN_VALIDATION';
