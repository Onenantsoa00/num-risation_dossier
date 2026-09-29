-- ============================================================
-- Historique des commentaires par version de dossier.
-- À chaque étape (commentaire, transmission, décision, retour
-- dispatch, réimport), le commentaire courant est figé sous le
-- numéro de version du dossier à ce moment-là.
-- ============================================================
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
