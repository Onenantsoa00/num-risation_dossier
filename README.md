# ORDSEC — Gestion & validation de dossiers

Application de suivi et validation de dossiers pour l'ORDSEC.

## Stack

- **Backend** : Node.js (Express) + Argon2id + JWT
- **Frontend** : Vue 3 + Quasar
- **Base de données** : PostgreSQL

## Prérequis

- Node.js 20+
- PostgreSQL 14+
- npm

## Installation

### 1. Base de données

```bash
sudo -u postgres createdb gestion_dossiers
# ou : createdb -U postgres gestion_dossiers

psql -U postgres -d gestion_dossiers -f database/schema.sql
```

Ajustez `backend/.env` (copie de `.env.example`) :

```
DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/gestion_dossiers
```

> Le script `database/schema.sql` ajoute les colonnes d'assignation (`id_dispatch`, `id_verificateur`, `id_validateur`) nécessaires au workflow.

### 2. Backend

```bash
cd backend
cp .env.example .env   # puis éditer DATABASE_URL
npm install
npm run seed           # comptes de démo
npm run dev            # http://localhost:3000
```

### 3. Frontend

Préférez **Node.js 20 ou 22** :

```bash
cd frontend
npm install
npm run dev            # http://localhost:9000
```

## Comptes de démonstration

| Rôle         | Email        | Mot de passe   |
| ------------ | ------------ | -------------- |
| Admin        | test         | Admin123!      |
| Dispatch     | 101000000001 | Dispatch123!   |
| Vérificateur | 101000000002 | Verif123!      |
| Validateur   | 101000000003 | Valid123!      |
| i_archive    | 123456789012 | iarchive123!   |
| super_admin  | 120394       | superadmin123! |

## Workflow

1. **Dispatch** importe un dossier (fichier + nom), le commente et l'envoie à un **Vérificateur**
2. **Vérificateur** commente puis envoie au **Validateur**
3. **Validateur** commente, valide ou rejette → retour info au Dispatch ; validation ⇒ archivage auto
4. **Admin** peut intervenir à toutes les étapes
5. Mentions `@email@domaine.com` dans un commentaire → notification

## Fonctionnalités

- Authentification (login / signup)
- Notifications (assignation + mentions)
- Import / affichage / export ZIP (fichier + commentaires, nommé par le Dispatch)
- Archives des dossiers validés
- Modification du profil

## Structure

```
database/schema.sql
backend/src/
frontend/src/
```

## pendant le developpement

git checkout dev
git add .
git commit -m "Nouvelle fonctionnalité"
git push origin dev

## version stable

git checkout main
git merge dev
git push origin main
