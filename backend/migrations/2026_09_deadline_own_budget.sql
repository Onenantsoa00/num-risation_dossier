-- Budget cumulatif propre à chaque dossier (slot dans la pile FIFO).
-- Sert à afficher la deadline individuelle (ex. 1er = 12h, 2e = 15h, …)
-- tandis que *_pile_budget_sec reste le budget TOTAL partagé (chrono commun).

ALTER TABLE dossier
  ADD COLUMN IF NOT EXISTS deadline_verif_own_budget_sec integer,
  ADD COLUMN IF NOT EXISTS deadline_valid_own_budget_sec integer;
