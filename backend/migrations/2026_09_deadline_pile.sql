-- ============================================================
-- Deadline par "pile" (cumul per user + role)
--   Une pile = tous les dossiers EN_VERIFICATION (resp.
--   EN_VALIDATION) d'un même utilisateur. Chaque dossier qui
--   entre allonge le budget total de la pile :
--     * 1er dossier de la pile  → +12h
--     * dossier suivant         → +3h (n° compte rapide)
--                               → +12h (sinon)
--   Le chrono ne tourne que pendant les heures ouvrées
--   (08h-12h / 14h-16h, hors week-end, jours fériés et congé).
--   deadline_*_pile_start = moment où la pile est devenue non vide
--   deadline_*_pile_budget_sec = budget TOTAL de travail (s)
--   (identiques pour tous les dossiers de la pile)
-- ============================================================
ALTER TABLE dossier
  ADD COLUMN IF NOT EXISTS deadline_verif_pile_start timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_verif_pile_budget_sec integer,
  ADD COLUMN IF NOT EXISTS deadline_valid_pile_start timestamptz,
  ADD COLUMN IF NOT EXISTS deadline_valid_pile_budget_sec integer;
