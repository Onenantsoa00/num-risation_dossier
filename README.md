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

|  ID | Nom          | Prénoms       | CIN            | Mot de passe  | Rôle         |
| --: | ------------ | ------------- | -------------- | ------------- | ------------ |
|   1 | Admin        | Utilisateur 1 | `TEST00000001` | `password123` | Admin        |
|   2 | Admin        | Utilisateur 2 | `TEST00000002` | `password123` | Admin        |
|   3 | Dispatch     | Utilisateur 1 | `TEST00000003` | `password123` | Dispatch     |
|   4 | Dispatch     | Utilisateur 2 | `TEST00000004` | `password123` | Dispatch     |
|   5 | Verificateur | Utilisateur 1 | `TEST00000005` | `password123` | Verificateur |
|   6 | Verificateur | Utilisateur 2 | `TEST00000006` | `password123` | Verificateur |
|   7 | Validateur   | Utilisateur 1 | `TEST00000007` | `password123` | Validateur   |
|   8 | Validateur   | Utilisateur 2 | `TEST00000008` | `password123` | Validateur   |
|   9 | Super        | Admin 1       | `TEST00000009` | `password123` | super_admin  |
|  10 | Super        | Admin 2       | `TEST00000010` | `password123` | super_admin  |
|  11 | Archive      | Utilisateur 1 | `TEST00000011` | `password123` | i_archive    |
|  12 | Archive      | Utilisateur 2 | `TEST00000012` | `password123` | i_archive    |

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

git switch dev
git add .
git commit -m "Nouvelle fonctionnalité"
git push origin dev

## version stable

git checkout main
git merge dev
git push origin main

## redemarage de systeme backend dans le server

sudo systemctl restart ordsec.service

## sur windows

cd C:\numerisation_dossier
git checkout main
git pull origin main

## lien pour accéder au application

http://192.168.137.1:3000

| Compte                   | CIN            | Mot de passe      |
| ------------------------ | -------------- | ----------------- |
| super_admin(trésorier)   | `100000000001` | `SuperAdmin@2026` |
| Admin 1 (chef Fortuner)  | `100000000002` | `Admin@2026-01`   |
| Admin 2 (chef Harijaona) | `100000000003` | `Admin@2026-02`   |
| Admin 3 (chef Sariaka)   | `100000000004` | `Admin@2026-03`   |

Windows + R : taskschd.msc

"1. Vérifier les services sur le serveur

Sur le serveur Ubuntu :

systemctl is-active postgresql

doit afficher :

active

Puis :

systemctl is-active ordsec-backend

doit afficher :

active 2. Tester l'API

Toujours sur le serveur :

curl -i http://127.0.0.1:3000/api/health

Tu dois obtenir :

HTTP/1.1 200 OK

et :

{"ok":true,"service":"gestion-dossiers"}

Tu l'as déjà testé et ça fonctionne. ✅"

"3. Tester avec l'adresse IP du serveur

C'est maintenant le test important.

Sur le serveur, fais :

ip -br addr

Tu dois retrouver ton Ethernet avec :

enp3s0 UP 192.168.86.200/24

Ensuite :

curl -i http://192.168.86.200:3000/api/health

Tu dois obtenir :

HTTP/1.1 200 OK

Si ça fonctionne, cela signifie que Node accepte bien les connexions sur l'adresse réseau."

voici l'erreur quand c'est le même dossier, l'ancien dossier n'affiche pas mais le nouveau dossier s'affiche et voici l'erreur dans le console: "DossierCreatePage.vue:224

       POST http://localhost:9000/api/dossiers 409 (Conflict)"

et le timer reste toujours en pause or il devrait marcher entre 08h - 12h et entre 14h - 16h, ajoute le fonctionnalité, quand c'est le samedi est dimanche il ne marche pas et dans le partie utilisateur pour le role admin et super_admin ajoute le mode jour ferier ou les gens ne travaille pas est le timer ne marche pas n'en plus à ce jours là

pour prendre le schema d'une base de données : "sudo -u postgres pg_dump -d gestion_dossiers --schema-only > ~/schema_serveur.sql"

## Production (mise en service sur le serveur)

Sur le serveur de l'entreprise (certains PC du parc sont peu puissants : 2 Go de RAM, disque dur HDD) :

```bash
# 1. Construire le frontend une seule fois (ou à chaque mise à jour)
npm run build          # génère frontend/dist/spa

# 2. Démarrer le backend : il sert aussi le frontend construit
npm start              # équivaut à NODE_ENV=production npm start --prefix backend
```

L'application est alors accessible sur `http://IP_du_serveur:3000`.

### Logs : développement vs production

- **Développement** : tous les logs s'affichent (console du backend + console du navigateur).
- **Production** : les logs de routine (`console.log` / `info` / `warn` / `debug`) sont coupés automatiquement pour ne pas surcharger les machines faibles ; seules les erreurs (`console.error`) restent visibles pour diagnostiquer un incident.
- **Dépannage ponctuel en production** : lancer `LOG_LEVEL=debug npm start --prefix backend` réaffiche tous les logs même en mode production.

---

# Simulation de l'application — 15/10/2026 à 20h19

> Rapport de la simulation complète (toutes les fonctionnalités testées + bugs trouvés + corrections).
> Les données créées pour les tests ont été supprimées à la fin : la base et `backend/uploads` sont revenus à leur état initial.

## 1. Méthode et résultat global

| Élément                | Détail                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------- |
| Backend                | `npm run dev --prefix backend` → `http://127.0.0.1:3000`                                 |
| Frontend               | `quasar dev` → `http://localhost:9000`, puis `npm run build` (build de production : OK)  |
| Base de données        | PostgreSQL `gestion_dossiers` (données de démo réelles)                                  |
| Tests API              | **86 vérifications** (auth, workflow complet, droits par rôle, imports, archivage, exports, notifications, jours fériés, congés, présence, téléchargements) |
| Tests interface        | **10 vérifications** dans Chrome (headless) : page Archives, Archivage Rapide, sélection multiple, téléchargement ZIP, archivage rapide de bout en bout |
| Tests deadline         | **14 vérifications** des règles du timer (plages 08h-12h / 14h-16h, week-ends, jours fériés, congés, pile FIFO 12 h / +3 h) |
| **Résultat**           | **API : 85/86** — **Interface : 10/10** — **Deadline : 14/14**                           |
| Seul échec             | Compte de démo `TEST00000001` : le mot de passe `password123` du README est refusé (401)  |

Les scripts de simulation ont été exécutés hors dépôt (`/tmp/ordsec-sim/`) : `api-sim.js` (86 tests),
`ui-sim.js` (10 tests pilotant Chrome) et `deadline-sim.js` (14 tests des règles du timer).
Ils créent, testent puis nettoient toutes leurs données.

## 2. Nouveautés livrées pendant la simulation

### 2.1 Archivage Rapide en affichage NORMAL (plus de plein écran imposé)

- **Avant** : le bouton « Archivage Rapide » ouvrait une `q-dialog` `maximized` contenant
  `DossierSplitLayout mode="fullscreen"` → toujours plein écran ; le drapeau `quickFullscreen`
  existait mais n'était jamais utilisé, donc le bouton **Plein écran** de l'aperçu ne faisait rien.
- **Après** (`frontend/src/pages/ArchivesPage.vue`) : fenêtre normale (aperçu à gauche, formulaire à droite,
  comme la page d'import du rôle Dispatch), avec les champs **Compte Prise en charge**, **Réf. écriture**
  et **Date d'écriture**. Le plein écran reste possible via le bouton de l'aperçu.
- **Vérifié dans Chrome** : fenêtre 560 × 715 dans un écran 1440 × 900, `position: static`,
  classe `dossier-workspace--preview` ; le bouton plein écran bascule bien en `--fullscreen`.

### 2.2 Sélection multiple + téléchargement dans les Archives

- Cases à cocher par ligne + case « tout sélectionner » dans l'en-tête (`ArchivesPage.vue`).
- Bouton **Télécharger (n)** dès qu'au moins une ligne est cochée, et bouton de téléchargement sur chaque ligne.
- Nouvelle route API : `POST /api/archives/download-zip` (`{ dossier_ids: [...] }`, 100 dossiers max)
  → ZIP contenant le fichier de chaque archive sélectionnée ; les dossiers non archivés sont ignorés.
- **Vérifié de bout en bout** : 2 lignes cochées → bouton « Télécharger (2) » → ZIP téléchargé contenant
  les 2 fichiers (noms réels des dossiers) ; la sélection se vide après le téléchargement.

## 3. Bugs corrigés (6)

1. **Date d'écriture décalée d'un jour** — les colonnes SQL `DATE` étaient converties par `node-postgres`
   en `Date` à minuit local : l'API renvoyait `2026-10-14T21:00:00.000Z` pour une saisie au **15/10/2026**
   (fuseau UTC+3) et le tableau des archives affichait **14/10/2026**.
   *Corrigé* dans `backend/src/config/db.js` (`types.setTypeParser(1082, v => v)` → l'API renvoie `2026-10-15`).
   *Vérifié* : colonne « Date fin » = 15/10/2026 à l'écran.

2. **Nom affiché ≠ nom enregistré (Archivage Rapide)** — le « Nom du dossier » affiché dans la fenêtre gardait
   les tirets du N° SOA (`71-71-7-717-71717`) alors que le serveur les remplace par des `_`.
   *Corrigé* dans `ArchivesPage.vue` (même sécurisation que le serveur).

3. **Fichiers orphelins sur le disque (fuite d'espace)** — 74 fichiers orphelins relevés sur 160 dans
   `backend/uploads`. Cause : Multer écrit le fichier avant le contrôleur, et **tout refus** laissait le fichier
   (doublon 409, champ obligatoire manquant 400, droits insuffisants 403, agent en congé…).
   Sur le serveur de production (HDD, disque limité), cela remplit le disque silencieusement.
   *Corrigé* par `cleanupUploadOnFailure` (`backend/src/middleware/upload.js`) branché après chaque
   `upload.single()` (routes `dossiers`, `archives`, `users`) : tout statut ≥ 400 supprime le fichier temporaire.
   *Vérifié* : plus aucun nouveau fichier orphelin après 6 passages complets de la simulation.

4. **Jour férié : date libre → erreur 500** — `POST /api/jours-feries` avec `date_ferie: "not-a-date"`
   provoquait une erreur SQL (500). *Corrigé* (`backend/src/controllers/jourFerierController.js`) :
   refus explicite 400 « La date doit être au format YYYY-MM-DD ».

5. **Aperçu des versions cassé après archivage définitif (404)** — l'archivage définitif renomme le fichier
   (`nouveauNom.pdf`) mais `dossier_version.fichier_original` gardait l'ancien nom :
   `GET /api/dossiers/:id/preview-version/1` répondait alors « Fichier introuvable ».
   *Corrigé* dans `archiveController.archiveDossier` (mise à jour de `dossier_version` après le renommage).

6. **Archivage Rapide sans historique de version** — un dossier créé par Archivage Rapide n'avait aucune ligne
   dans `dossier_version` (contrairement à un import Dispatch), donc aucune version à afficher.
   *Corrigé* dans `archiveController.quickArchive` (insertion de la version 1).

## 4. Bugs constatés, NON corrigés (à décider)

1. **Compte de démo `TEST00000001` inutilisable** — le mot de passe `password123` du tableau « Comptes de
   démonstration » est refusé (401), alors que les 11 autres comptes `TEST0000000x` fonctionnent.
   → vérifier le mot de passe réel, mettre à jour le README ou relancer `npm run seed`.
2. **`npm run lint` ne peut pas fonctionner** — `frontend/package.json` appelle `eslint -c ./eslint.config.js`
   mais `frontend/eslint.config.js` n'existe pas et `eslint` n'est pas dans les `devDependencies`.
   → ajouter la configuration ESLint (ou retirer le script).
3. **« Validation ⇒ archivage auto » est inexact** — après validation, le dossier passe en `VALIDE` mais
   **n'apparaît pas dans /archives** ; il faut que le service d'archivage (`i_archive`) fasse l'archivage
   définitif en saisissant Compte PC / Réf. écriture / Date d'écriture (`POST /api/archives/:id/archive`).
   → préciser le README (ou changer la règle métier).
4. **Recherche « Tous les champs » des archives incomplète** — le nom/prénoms de l'agent qui a archivé
   n'est pas recherché (seul son IM l'est). Test réalisé : recherche `Utilisateur 1` en mode « tous les champs »
   → **0 résultat**, alors que 6 archives ont été faites par cet agent (l'IM, lui, remonte bien 5 archives).
   → ajouter `u.nom` / `u.prenoms` à la recherche, ou proposer un type « Agent ». (L'interface propose déjà un
   type « IM de l'archiveur ».)
5. **33 fichiers orphelins historiques** subsistent dans `backend/uploads` (dont 26 au format temporaire
   Multer), créés entre août et septembre 2026, **avant** la correction du point 3.3 (~90 Mo au total,
   dont plusieurs fichiers de 9,7 Mo). Ils n'ont pas été supprimés par prudence.
   → purge possible après validation : tout fichier de `backend/uploads` absent de
   `dossier.fichier_original`, `dossier_version.fichier_original` et `utilisateur.image` est un orphelin.
6. **Nommage incohérent du champ de date** — le champ saisi « Date d'écriture » est stocké dans la colonne
   `date_fin_dossier` et affiché « Date fin » dans le tableau des archives (et « Date d'écriture » dans le
   détail du dossier). → harmoniser les libellés (cosmétique).
7. **`getDeadlineRemaining(dossier, type, …, nowMs)`** : le temps restant est bien calculé à partir de `nowMs`,
   mais l'indicateur « en pause » (`isDeadlinePausedNow`) utilise toujours l'heure réelle du serveur.
   Sans conséquence en production (les deux utilisent la même horloge), mais gênant pour les tests.
   → passer `nowMs` à `isDeadlinePausedNow` pour rendre la fonction cohérente.

## 5. Fonctionnalités vérifiées (OK)

- **Authentification** : connexion des 12 comptes (sauf le point 4.1), mauvais mot de passe → 401, CIN inconnu → 401,
  champs manquants → 400, compte restreint → 403 `ACCOUNT_RESTRICTED`, accès sans token / token invalide → 401,
  `GET /auth/me`.
- **Workflow complet** : import Dispatch → doublon détecté (409 `DUPLICATE_ACTIVE`) → assignation vérificateur
  (admin) → vérification (commentaire + envoi validateur) → validation (commentaire + archiveur) → `VALIDE` →
  archivage définitif → `ARCHIVE` ; parcours **rejet** → `REJETE` et **retour dispatch** → `RETOUR_DISPATCH` →
  réimport (`confirm-reimport`, nouveau dossier prioritaire lié à l'ancien, en validation directe).
- **Règles FIFO** respectées : un vérificateur/validateur ne peut pas traiter un dossier qui n'est pas en tête de
  sa file (erreur explicite) ; l'assignation d'un agent en congé est refusée.
- **Archivage Rapide** : 201 avec les 5 champs + fichier, nom de fichier généré correctement, ligne d'archive
  marquée `archivage_rapide`, badge et ligne colorée dans l'interface, 409 si le même dossier est réimporté,
  400 pour chaque champ obligatoire manquant (Compte Prise en charge, Réf. écriture, Date d'écriture, format de date),
  403 pour un rôle non autorisé, 400 sans IM, 201 depuis un Admin. **Parcours complet réalisé depuis l'interface**.
- **Archives** : liste, 11 filtres de recherche (dont Compte Prise en charge, Réf. écriture, Date d'écriture, IM),
  sélection multiple, téléchargement ZIP multiple et unitaire, ligne « Archivage rapide » mise en évidence.
- **Documents** : aperçu (`preview`), aperçu d'une version antérieure, téléchargement, export texte du dossier,
  export ZIP Dispatch (et 403 pour les autres rôles), remplacement de fichier par le vérificateur, réimport de version.
- **Notifications** : liste, compteur non-lus, marquage lu / tout lu, notification aux admins à l'import,
  notification de mention `@email` dans un commentaire.
- **Jours fériés** : création (Admin/super_admin), 409 sur doublon, 403 pour les autres rôles, lecture par tous,
  suppression, invalidation du cache des deadlines.
- **Utilisateurs / présence / congés** : liste et filtre par rôle, création (Admin uniquement, 403 sinon),
  restriction / réactivation d'un compte, pose et retrait de congé, présence (heartbeat + liste), mise à jour du profil.
- **Droits d'accès** : 403 sur toutes les actions réservées à un autre rôle, 404 sur un dossier inexistant,
  403 sur un dossier non assigné.
- **Deadline / timer** (14 vérifications dans `deadline-sim.js`) :
  - seules les plages **08h-12h et 14h-16h** sont décomptées (08h00 ouvré, 12h00/13h00/16h00/20h00 non ouvrés) ;
  - **samedi, dimanche et jours fériés** ne consomment jamais de temps ;
  - 08h→12h = 4 h, 08h→17h = 6 h ouvrées ; +2 h depuis 11h00 → fin à 15h00 ; +12 h depuis un vendredi 15h00
    → fin le **mardi 15h00** (week-end sauté) ;
  - pile FIFO : budget de base **12 h**, 1 h consommée de 08h à 09h → 11 h restantes, nuit et heures non ouvrées
    exclues (4 h ouvrées sur 18 h civiles), 0 → « Dépassé » ;
  - **congé** de l'agent et **jour férié en base** : chrono en pause et temps non consommé (cache des jours fériés
    invalidé puis rechargé) ;
  - compte « rapide » (6241…) : **+3 h** ajoutées à la pile ; autre compte : **+12 h**.
  - ℹ️ **Pourquoi le timer semble « toujours en pause »** : en dehors de 08h-12h et 14h-16h (soirée, nuit,
    week-end), le chrono est **volontairement** affiché en pause et ne consomme rien — c'est la règle métier,
    pas une panne. Un test unitaire serait utile pour vérifier le redémarrage automatique à 08h00.
- **Cohérence des données** : aucun dossier sans fichier sur le disque (0/58 pendant les tests),
  0 doublon actif non détecté, nettoyage automatique des chaînes de réimport.

## 6. Données de test

Toutes les données créées pendant la simulation ont été supprimées à la fin : dossiers `TEST-…`,
archives rapides de test, comptes `VER…`/`VAL…`/`SIM…`, jours fériés de test, congés posés, IM temporaire
et fichiers déposés. La base est revenue à son état initial (44 dossiers, 6 archives, 12 utilisateurs,
1 jour férié) et `backend/uploads` à 82 fichiers.

---

# Correction — téléchargement de la sélection d'archives (15/10/2026 à 21h15)

## 1. Ce qui n'allait pas

En cochant plusieurs dossiers dans **Archives** puis en cliquant sur **Télécharger (n)**, le ZIP ne contenait pas
tous les dossiers cochés : les archives dont le fichier n'est plus présent dans `backend/uploads`
(`dossier.fichier_original` renseigné en base mais fichier absent du disque) étaient **ignorées en silence**
(un simple `console.warn` côté serveur), et l'interface annonçait « n fichier(s) téléchargé(s) » comme si tout
s'était bien passé.

Constat sur la base de démonstration : **5 des 6 archives** n'ont plus leur fichier sur le disque —
`s_s_s_s_s_test_test_…` et `z_z_z_z_z_aaa_aaa_…` (archivées le 02-03/09/2026), `d_d_d_d_d_taz_azer_…` (03/09),
`f_f_f_f_f_f_f_…_310229` (archivage rapide du 03/09) et `q_q_q_q_q_a_a_…`. Seule l'archive
`QQQQ_…_20261013_309462` est téléchargeable : cocher les 6 lignes ne pouvait donc produire qu'un ZIP d'**1 seul
fichier** (mesuré avant correction : `x-archives-total 6` → ZIP à 1 entrée).

## 2. Ce qui a été corrigé

- **`backend/src/controllers/archiveController.js`**
  - `resolveDossierFilePath()` : le fichier est cherché sous le nom enregistré en base, puis sous un nom de doublon
    de l'application (`nom(2).pdf`, `nom(3).pdf`…). La liste de `backend/uploads` est mémorisée 10 s (une seule
    lecture disque, pas une par ligne — serveur HDD).
  - `downloadSelectionZip()` : **tous les dossiers sélectionnés dont le fichier existe sont inclus** (identifiants
    en doublon ignorés) ; ceux dont le fichier est introuvable sont **signalés** au lieu d'être oubliés :
    - en-têtes de réponse `X-Archives-Total`, `X-Archives-Included`, `X-Archives-Missing`,
      `X-Archives-Missing-Names` ;
    - si **aucun** fichier n'est disponible : erreur **400** explicite avec la liste des dossiers concernés
      (avant : ZIP vide/partiel incompréhensible) ;
    - les noms manquants sont aussi tracés dans le journal d'audit (`details.manquants`).
  - `list()` renvoie en plus `fichier_disponible` pour chaque archive.
- **`backend/src/index.js`** : `exposedHeaders` pour le CORS — sans cela le navigateur masque ces en-têtes
  (le frontend de développement et l'API ne sont pas sur le même port).
- **`frontend/src/pages/ArchivesPage.vue`**
  - badge rouge **« Fichier introuvable »** sur les archives non téléchargeables, bouton de la ligne en gris avec
    infobulle explicative ;
  - le bouton de sélection passe en avertissement (`link_off`) et indique combien de dossiers cochés n'ont plus
    de fichier ;
  - après téléchargement : « n fichier(s) téléchargé(s) sur N. Fichier introuvable sur le serveur pour : … » ;
  - la limite « 100 dossiers par ZIP » précise désormais le nombre sélectionné et la marche à suivre.

## 3. Vérifications

| Contrôle | Résultat |
| --- | --- |
| `verify-all.js` : 2 archives créées pour l'occasion + les 6 existantes sélectionnées | ZIP **intègre (CRC)** avec les **3 fichiers disponibles**, contenu identique aux fichiers importés, 5 dossiers manquants annoncés ; sélection en doublon → un seul passage ; sélection ne contenant que des dossiers sans fichier → **400** avec les noms |
| Interface Chrome (build de production, `ui-zip-test.js`) | **7/7** : 5 badges « Fichier introuvable », bouton « Télécharger (6) » en avertissement, ZIP de 1 fichier, avertissement nommant les 5 dossiers, message explicite sur une ligne sans fichier, téléchargement nominal d'une archive disponible |
| `node --check` (`archiveController.js`, `index.js`) | OK |
| `npx quasar build` (build de production) | OK |

Les données de test ont été supprimées après vérification : base revenue à **44 dossiers / 6 archives**,
`backend/uploads` inchangé (82 fichiers, + `.gitkeep`), lignes d'audit créées par ces tests retirées.

## 4. Reste à décider

- Les **5 fichiers manquants** ci-dessus ne sont pas récupérables depuis le serveur (aucune copie de
  `backend/uploads` n'existe) : il faut réimporter les documents d'origine, ou supprimer ces lignes d'archive si
  elles ne correspondent à aucun dossier réel. En attendant, l'interface les signale clairement.
- **Accès à l'application en `http://localhost:3000` (ou `127.0.0.1:3000`) sur le serveur** : ces origines ne
  figurent pas dans la liste CORS (`http://localhost:9000` et les IP du réseau local), donc les requêtes `POST`
  de l'application (connexion, téléchargement ZIP…) reçoivent une erreur **500**. Passer par l'IP réseau
  (`http://192.168.86.200:3000`) fonctionne. → ajouter les origines locales à `allowedOrigins` si l'accès en
  localhost sur le serveur est utile.
