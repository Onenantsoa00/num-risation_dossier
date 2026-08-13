-- ============================================================
-- BASE DE DONNÉES : gestion_dossiers
-- PostgreSQL
-- ============================================================

CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(25) NOT NULL UNIQUE
);

CREATE TABLE utilisateur (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(50) NOT NULL,
    prenoms VARCHAR(100) NOT NULL,
    date_naissance DATE,
    tel VARCHAR(20),
    email VARCHAR(100) NOT NULL UNIQUE,
    image VARCHAR(255),
    mdp VARCHAR(255) NOT NULL,
    id_roles INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_utilisateur_role
        FOREIGN KEY (id_roles) REFERENCES roles(id)
        ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE dossier (
    id SERIAL PRIMARY KEY,
    nom VARCHAR(255) NOT NULL,
    n_compte VARCHAR(25),
    n_be VARCHAR(25),
    n_soa VARCHAR(25),
    exo_budgetaire VARCHAR(25),
    commentaire TEXT,
    fichier_original VARCHAR(255),
    statut VARCHAR(30) NOT NULL DEFAULT 'EN_ATTENTE_DISPATCH',
    validation BOOLEAN NOT NULL DEFAULT FALSE,
    rejet BOOLEAN NOT NULL DEFAULT FALSE,
    id_dispatch INTEGER,
    id_verificateur INTEGER,
    id_validateur INTEGER,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_dossier_statut CHECK (
        statut IN (
            'EN_ATTENTE_DISPATCH',
            'EN_VERIFICATION',
            'EN_VALIDATION',
            'VALIDE',
            'REJETE',
            'RETOUR_DISPATCH',
            'ARCHIVE'
        )
    ),
    CONSTRAINT fk_dossier_dispatch FOREIGN KEY (id_dispatch) REFERENCES utilisateur(id) ON DELETE SET NULL,
    CONSTRAINT fk_dossier_verificateur FOREIGN KEY (id_verificateur) REFERENCES utilisateur(id) ON DELETE SET NULL,
    CONSTRAINT fk_dossier_validateur FOREIGN KEY (id_validateur) REFERENCES utilisateur(id) ON DELETE SET NULL
);

CREATE TABLE traitement (
    id SERIAL PRIMARY KEY,
    id_users INTEGER NOT NULL,
    id_dossier INTEGER NOT NULL,
    type_traitement VARCHAR(30) NOT NULL,
    commentaire TEXT,
    statut VARCHAR(30),
    date_traitement TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_traitement_utilisateur FOREIGN KEY (id_users) REFERENCES utilisateur(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_traitement_dossier FOREIGN KEY (id_dossier) REFERENCES dossier(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_type_traitement CHECK (
        type_traitement IN ('DISPATCH', 'VERIFICATION', 'VALIDATION', 'REJET', 'RETOUR')
    )
);

CREATE TABLE notification (
    id SERIAL PRIMARY KEY,
    id_user INTEGER NOT NULL,
    id_dossier INTEGER,
    message TEXT NOT NULL,
    type VARCHAR(30) NOT NULL DEFAULT 'INFO',
    lu BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_notification_utilisateur FOREIGN KEY (id_user) REFERENCES utilisateur(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_notification_dossier FOREIGN KEY (id_dossier) REFERENCES dossier(id) ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT chk_notification_type CHECK (
        type IN ('INFO', 'DOSSIER', 'VERIFICATION', 'VALIDATION', 'REJET', 'SYSTEME')
    )
);

CREATE TABLE archive (
    id SERIAL PRIMARY KEY,
    id_dossier INTEGER NOT NULL UNIQUE,
    archive_par INTEGER,
    date_archivage TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motif TEXT,
    CONSTRAINT fk_archive_dossier FOREIGN KEY (id_dossier) REFERENCES dossier(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_archive_utilisateur FOREIGN KEY (archive_par) REFERENCES utilisateur(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE TABLE audit_log (
    id BIGSERIAL PRIMARY KEY,
    id_user INTEGER,
    action VARCHAR(50) NOT NULL,
    table_name VARCHAR(100),
    record_id INTEGER,
    details JSONB,
    ip_address INET,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (id_user) REFERENCES utilisateur(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE INDEX idx_utilisateur_role ON utilisateur(id_roles);
CREATE INDEX idx_dossier_statut ON dossier(statut);
CREATE INDEX idx_traitement_users ON traitement(id_users);
CREATE INDEX idx_traitement_dossier ON traitement(id_dossier);
CREATE INDEX idx_notification_user ON notification(id_user);
CREATE INDEX idx_notification_dossier ON notification(id_dossier);
CREATE INDEX idx_notification_lu ON notification(lu);
CREATE INDEX idx_archive_dossier ON archive(id_dossier);
CREATE INDEX idx_audit_user ON audit_log(id_user);
CREATE INDEX idx_audit_table_record ON audit_log(table_name, record_id);
CREATE INDEX idx_audit_created_at ON audit_log(created_at);

INSERT INTO roles (nom) VALUES
('Admin'),
('Dispatch'),
('Verificateur'),
('Validateur');
