-- Migration : Table des jours fériés
-- Exécuter : psql -d gestion_dossiers -f database/migration_jour_ferier.sql

CREATE TABLE IF NOT EXISTS jour_ferier (
    id SERIAL PRIMARY KEY,
    date_ferie DATE NOT NULL UNIQUE,
    libelle VARCHAR(150) NOT NULL,
    created_by INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_jour_ferier_user FOREIGN KEY (created_by) REFERENCES utilisateur(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_jour_ferier_date ON jour_ferier(date_ferie);
