-- ============================================================
-- MISE À NIVEAU PRODUCTION — Octobre 2026
--
-- À exécuter sur la base de PRODUCTION avant (ou avec) le
-- déploiement du code actuel.
--
-- SCRIPT 100 % NON DESTRUCTIF :
--   * ALTER TABLE ... ADD COLUMN IF NOT EXISTS  (aucune donnée perdue)
--   * CREATE TABLE IF NOT EXISTS                (aucune table écrasée)
--   * CREATE INDEX IF NOT EXISTS                (aucune ligne modifiée)
--   Aucun UPDATE / DELETE / DROP : les dossiers déjà en production
--   restent intacts.
--
-- Commande :
--   psql -h <hôte> -U <user> -d <base> -f 2026_10_prod_upgrade.sql
--
-- Les 4 migrations ci-dessous sont idempotentes : on peut les
-- relancer sans risque si elles ont déjà été appliquées.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Deadline par « pile » (FIFO vérificateur / validateur)
--    (migrations/2026_09_deadline_pile.sql)
-- ------------------------------------------------------------
ALTER TABLE dossier
  ADD COLUMN IF NOT EXISTS deadline_verif_pile_start timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_verif_pile_budget_sec integer,
  ADD COLUMN IF NOT EXISTS deadline_valid_pile_start timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_valid_pile_budget_sec integer;

-- ------------------------------------------------------------
-- 2) Budget cumulatif propre à chaque dossier (slot dans la pile)
--    (migrations/2026_09_deadline_own_budget.sql)
-- ------------------------------------------------------------
ALTER TABLE dossier
  ADD COLUMN IF NOT EXISTS deadline_verif_own_budget_sec integer,
  ADD COLUMN IF NOT EXISTS deadline_valid_own_budget_sec integer;

-- ------------------------------------------------------------
-- 3) Historique des commentaires par version de dossier
--    (migrations/2026_09_commentaire_historique.sql)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS dossier_commentaire_historique (
  id         serial PRIMARY KEY,
  id_dossier integer NOT NULL REFERENCES dossier(id) ON DELETE CASCADE,
  version    integer NOT NULL,
  commentaire text NOT NULL,
  created_by integer REFERENCES utilisateur(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id_dossier, version)
);

CREATE INDEX IF NOT EXISTS idx_dossier_commentaire_hist
  ON dossier_commentaire_historique (id_dossier, version);

-- ------------------------------------------------------------
-- 4) Dossier PRIORITAIRE (réimport après retour dispatch →
--    validation directe, passe devant la file FIFO)
--    (migrations/2026_10_dossier_priorite.sql)
-- ------------------------------------------------------------
ALTER TABLE dossier
  ADD COLUMN IF NOT EXISTS priorite boolean NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_dossier_priorite_valid
  ON dossier (id_validateur, priorite)
  WHERE statut = 'EN_VALIDATION';

-- ============================================================
-- VÉRIFICATION (doit renvoyer 4 lignes « OK ») :
--
--   SELECT 'priorite' AS objet,
--          EXISTS (SELECT 1 FROM information_schema.columns
--                   WHERE table_name='dossier' AND column_name='priorite') AS ok
--   UNION ALL SELECT 'pile_verif',
--          EXISTS (SELECT 1 FROM information_schema.columns
--                   WHERE table_name='dossier' AND column_name='deadline_verif_pile_start')
--   UNION ALL SELECT 'own_budget',
--          EXISTS (SELECT 1 FROM information_schema.columns
--                   WHERE table_name='dossier' AND column_name='deadline_valid_own_budget_sec')
--   UNION ALL SELECT 'historique',
--          EXISTS (SELECT 1 FROM information_schema.tables
--                   WHERE table_name='dossier_commentaire_historique');
-- ============================================================
