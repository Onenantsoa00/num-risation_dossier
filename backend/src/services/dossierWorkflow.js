const db = require("../config/db");
const { createNotification } = require("./helpers");
const {
  getTodayDateStr,
  PILE_BASE_SEC,
  pileExtraSecForAccount,
} = require("./deadline");

function dossierFieldsKey(n_compte, n_be, n_soa, n_ord, exo_budgetaire) {
  return [
    String(n_compte || "").trim(),
    String(n_be || "").trim(),
    String(n_soa || "").trim(),
    String(n_ord || "").trim(),
    String(exo_budgetaire || "").trim(),
  ].join("|");
}

async function findRetourDispatchDuplicate(fields) {
  const { n_compte, n_be, n_soa, n_ord, exo_budgetaire } = fields;
  const { rows } = await db.query(
    `SELECT d.*
     FROM dossier d
     WHERE d.statut IN ('RETOUR_DISPATCH', 'EN_ATTENTE_VERIFICATEUR', 'EN_VERIFICATION', 'EN_VALIDATION')
       AND COALESCE(d.n_compte, '') = $1
       AND COALESCE(d.n_be, '') = $2
       AND COALESCE(d.n_soa, '') = $3
       AND COALESCE(d.n_ord, '') = $4
       AND COALESCE(d.exo_budgetaire, '') = $5
     ORDER BY d.updated_at DESC
     LIMIT 1`,
    [
      String(n_compte || "").trim(),
      String(n_be || "").trim(),
      String(n_soa || "").trim(),
      String(n_ord || "").trim(),
      String(exo_budgetaire || "").trim(),
    ],
  );
  return rows[0] || null;
}

async function notifyAllAdmins({ id_dossier, message, type }) {
  const { rows } = await db.query(
    `SELECT u.id FROM utilisateur u
     JOIN roles r ON r.id = u.id_roles
     WHERE r.nom IN ('Admin', 'super_admin') AND u.actif = TRUE`,
  );
  for (const admin of rows) {
    await createNotification({
      id_user: admin.id,
      id_dossier,
      message,
      type,
    });
  }
}

/**
 * Vérifie si l'utilisateur est en congé à la date donnée (aujourd'hui par défaut).
 * Les dates sont comparées en « date calendrier » YYYY-MM-DD.
 */
async function isUserOnConge(userId, dateStr = null) {
  const { rows } = await db.query(
    `SELECT to_char(conge_debut, 'YYYY-MM-DD') AS conge_debut,
            to_char(conge_fin, 'YYYY-MM-DD') AS conge_fin
     FROM utilisateur WHERE id = $1`,
    [userId],
  );
  const u = rows[0];
  if (!u?.conge_debut || !u?.conge_fin) return false;
  const today = dateStr || getTodayDateStr();
  return today >= u.conge_debut && today <= u.conge_fin;
}

async function saveCurrentVersionToHistory(client, dossier) {
  if (!dossier.fichier_original) return;

  await client.query(
    `UPDATE dossier_version SET est_actuelle = FALSE WHERE id_dossier = $1`,
    [dossier.id],
  );

  await client.query(
    `INSERT INTO dossier_version (id_dossier, version, fichier_original, est_actuelle)
     VALUES ($1, $2, $3, FALSE)
     ON CONFLICT (id_dossier, version) DO UPDATE SET fichier_original = EXCLUDED.fichier_original`,
    [dossier.id, dossier.version || 1, dossier.fichier_original],
  );
}

async function getDossierVersions(dossierId) {
  const { rows } = await db.query(
    `SELECT * FROM dossier_version
     WHERE id_dossier = $1
     ORDER BY version ASC`,
    [dossierId],
  );
  return rows;
}

async function getPreviousVersion(dossierId, currentVersion) {
  const prevVersion = Number(currentVersion) - 1;
  if (prevVersion < 1) return null;

  const { rows } = await db.query(
    `SELECT * FROM dossier_version
     WHERE id_dossier = $1 AND version = $2`,
    [dossierId, prevVersion],
  );
  return rows[0] || null;
}

async function clearVersionHistory(client, dossierId) {
  await client.query(`DELETE FROM dossier_version WHERE id_dossier = $1`, [
    dossierId,
  ]);
  await client.query(
    `UPDATE dossier SET comparaison_active = FALSE WHERE id = $1`,
    [dossierId],
  );
}

async function markAdminModified(dossierId) {
  await db.query(
    `UPDATE dossier SET admin_modifie = TRUE, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [dossierId],
  );
}

async function countAssignedDossiers(userId, role) {
  if (role === "Verificateur") {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM dossier
       WHERE id_verificateur = $1 AND statut IN ('EN_VERIFICATION', 'RETOUR_DISPATCH')`,
      [userId],
    );
    return rows[0].count;
  }
  if (role === "Validateur") {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM dossier
       WHERE id_validateur = $1 AND statut IN ('EN_VALIDATION', 'RETOUR_DISPATCH')`,
      [userId],
    );
    return rows[0].count;
  }
  if (role === "Admin") {
    // Admin peut être assigné pour vérification ET validation
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM dossier
       WHERE (id_verificateur = $1 OR id_validateur = $1) 
         AND statut IN ('EN_VERIFICATION', 'EN_VALIDATION', 'RETOUR_DISPATCH')`,
      [userId],
    );
    return rows[0].count;
  }
  if (role === "super_admin") {
    // super_admin gère la validation
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM dossier
       WHERE id_validateur = $1 AND statut IN ('EN_VALIDATION', 'RETOUR_DISPATCH')`,
      [userId],
    );
    return rows[0].count;
  }
  return 0;
}

/**
 * Vérifie si un utilisateur a un dossier actif (timer en cours) pour un rôle donné.
 * FIFO : ne peut pas traiter un dossier tant qu'un dossier plus ancien est actif.
 */
async function hasActiveDossier(userId, role, excludeDossierId = null) {
  let sql;
  let params;
  if (role === "Verificateur") {
    sql = `SELECT id FROM dossier
           WHERE id_verificateur = $1 AND statut = 'EN_VERIFICATION'
             AND assigned_verification_at IS NOT NULL`;
    params = [userId];
  } else if (role === "Validateur") {
    sql = `SELECT id FROM dossier
           WHERE id_validateur = $1 AND statut = 'EN_VALIDATION'
             AND assigned_validation_at IS NOT NULL`;
    params = [userId];
  } else {
    return false;
  }
  if (excludeDossierId) {
    sql += ` AND id <> $2`;
    params.push(excludeDossierId);
  }
  sql += ` ORDER BY id ASC LIMIT 1`;
  const { rows } = await db.query(sql, params);
  return rows[0] || null;
}

/**
 * Vérifie si un utilisateur a AU MOINS UN dossier dans sa file FIFO
 * (actif OU en attente) pour un rôle donné.
 *
 * Un dossier retourné au Dispatch puis revalidé doit rejoindre la FIN de
 * la file : on ne démarre son timer que si la file est vide.
 */
async function hasPendingDossier(userId, role, excludeDossierId = null) {
  let sql;
  if (role === "Verificateur") {
    sql = `SELECT id FROM dossier
           WHERE id_verificateur = $1 AND statut = 'EN_VERIFICATION'`;
  } else if (role === "Validateur") {
    sql = `SELECT id FROM dossier
           WHERE id_validateur = $1 AND statut = 'EN_VALIDATION'`;
  } else {
    return null;
  }
  const params = [userId];
  if (excludeDossierId) {
    sql += ` AND id <> $2`;
    params.push(excludeDossierId);
  }
  sql += ` ORDER BY id ASC LIMIT 1`;
  const { rows } = await db.query(sql, params);
  return rows[0] || null;
}

/**
 * Ordre canonique de la file FIFO d'un utilisateur pour un rôle.
 *
 * ⚠️ Cet ordre DOIT rester identique à celui utilisé pour afficher la liste
 * des dossiers (dossierController.list). Le dossier en TÊTE de cet ordre est
 * le seul qui peut être traité ; tous les autres sont bloqués par lui.
 *
 * Règles :
 *  - Validateur : un dossier PRIORITAIRE (réimport après retour dispatch)
 *    passe devant toute la file ; puis les dossiers EN_VALIDATION ;
 *  - ensuite, dossier ACTIF avant dossier en attente, puis ordre d'entrée
 *    dans la file (assigned_*_at, puis updated_at, puis id) → FIFO strict.
 */
function queueOrderBy(role, alias = "d") {
  const a = alias;
  if (role === "Verificateur") {
    return `CASE WHEN ${a}.statut = 'EN_VERIFICATION' THEN 0 ELSE 1 END,
            ${a}.assigned_verification_at ASC NULLS LAST,
            ${a}.updated_at ASC,
            ${a}.id ASC`;
  }
  if (role === "Validateur") {
    return `CASE WHEN ${a}.priorite AND ${a}.statut = 'EN_VALIDATION' THEN 0 ELSE 1 END,
            CASE WHEN ${a}.statut = 'EN_VALIDATION' THEN 0 ELSE 1 END,
            ${a}.assigned_validation_at ASC NULLS LAST,
            ${a}.updated_at ASC,
            ${a}.id ASC`;
  }
  return `${a}.updated_at DESC`;
}

/**
 * Démarre le timer du dossier FIFO suivant (assign_verification_at ou assign_validation_at).
 * Ordre : `queueOrderBy` — identique à l'ordre affiché dans la liste du
 * vérificateur / validateur. Un dossier prioritaire (validateur) passe donc
 * devant toute la file, et un dossier revalidé (updated_at récent) démarre
 * après les dossiers déjà en file.
 */
async function startNextQueuedTimer(userId, role) {
  let sql;
  let updateCol;
  let params;

  // Sécurité : ne jamais démarrer un nouveau timer si un dossier est déjà
  // ACTIF pour cet utilisateur. Cas typique : un dossier prioritaire est
  // traité avant sa file — le dossier actif restant ne doit pas être
  // doublé par un timer démarré par erreur.
  if (await hasActiveDossier(userId, role)) return null;

  if (role === "Verificateur") {
    sql = `SELECT d.id FROM dossier d
           WHERE d.id_verificateur = $1 AND d.statut = 'EN_VERIFICATION'
             AND d.assigned_verification_at IS NULL
           ORDER BY ${queueOrderBy("Verificateur")} LIMIT 1`;
    updateCol = "assigned_verification_at";
    params = [userId];
  } else if (role === "Validateur") {
    // Un dossier prioritaire en attente passe devant toute la file.
    sql = `SELECT d.id FROM dossier d
           WHERE d.id_validateur = $1 AND d.statut = 'EN_VALIDATION'
             AND d.assigned_validation_at IS NULL
           ORDER BY ${queueOrderBy("Validateur")} LIMIT 1`;
    updateCol = "assigned_validation_at";
    params = [userId];
  } else {
    return null;
  }
  const { rows } = await db.query(sql, params);
  if (!rows[0]) return null;
  const dossierId = rows[0].id;
  await db.query(
    `UPDATE dossier SET ${updateCol} = CURRENT_TIMESTAMP,
       deadline_verif_elapsed_sec = 0, deadline_valid_elapsed_sec = 0,
       deadline_verif_paused_at = NULL, deadline_valid_paused_at = NULL,
       updated_at = CURRENT_TIMESTAMP
     WHERE id = $1`,
    [dossierId],
  );
  return dossierId;
}

/**
 * Fait entrer un dossier dans la « pile » FIFO d'un utilisateur pour un rôle
 * (Verificateur → EN_VERIFICATION / deadline_verif_*, Validateur →
 * EN_VALIDATION / deadline_valid_*).
 *
 * Règle métier :
 *  - pile VIDE → le dossier démarre une pile avec 12 h de budget,
 *    pile_start = maintenant.
 *  - pile NON vide → le dossier entre en file (derrière les autres) et la
 *    pile gagne +3 h (n° compte rapide) ou +12 h (sinon).
 *
 * Tous les dossiers encore dans la pile partagent le même pile_start et le
 * même pile_budget (mis à jour ici) pour le chrono commun.
 * En revanche, own_budget_sec est figé à l'entrée : c'est le cumul jusqu'à
 * CE dossier, pour afficher sa deadline individuelle.
 *
 * `excludeDossierId` permet d'ignorer le dossier en cours
 * (réassignation / nouvelle version).
 */
async function joinPileDeadline({
  userId,
  role,
  nCompte,
  dossierId,
  excludeDossierId = null,
  executor = db,
}) {
  const isVerif = role === "Verificateur";
  const statut = isVerif ? "EN_VERIFICATION" : "EN_VALIDATION";
  const idCol = isVerif ? "id_verificateur" : "id_validateur";
  const pre = isVerif ? "deadline_verif" : "deadline_valid";

  const exclusions = [];
  const params = [userId, statut];
  if (excludeDossierId) {
    params.push(excludeDossierId);
    exclusions.push(`AND d.id <> $${params.length}`);
  }

  // État actuel de la pile (premier dossier qui en fait partie)
  const { rows } = await executor.query(
    `SELECT d.${pre}_pile_start AS pile_start,
            d.${pre}_pile_budget_sec AS pile_budget
     FROM dossier d
     WHERE d.${idCol} = $1 AND d.statut = $2 ${exclusions.join(" ")}
     ORDER BY d.${pre}_pile_start ASC NULLS LAST, d.id ASC
     LIMIT 1`,
    params,
  );

  const now = new Date();
  const pileStart = rows[0]?.pile_start ? new Date(rows[0].pile_start) : now;
  const existingBudget = Number(rows[0]?.pile_budget || 0);
  // Pile vide → 12h ; pile non vide → +3h/+12h selon le compte.
  const budget = rows[0]?.pile_start
    ? existingBudget + pileExtraSecForAccount(nCompte)
    : PILE_BASE_SEC;

  // 1) Le dossier qui entre : budget total + own_budget (= cumul à son entrée)
  await executor.query(
    `UPDATE dossier
     SET ${pre}_pile_start = $1,
         ${pre}_pile_budget_sec = $2,
         ${pre}_own_budget_sec = $2,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [pileStart, budget, dossierId],
  );

  // 2) Les autres dossiers de la pile partagent le nouveau budget TOTAL
  //    (chrono commun), sans toucher à leur own_budget ni à updated_at.
  const updParams = [userId, statut, budget];
  let updSql = `UPDATE dossier SET ${pre}_pile_budget_sec = $3
                WHERE ${idCol} = $1 AND statut = $2 AND ${pre}_pile_start IS NOT NULL
                  AND id <> $${updParams.length + 1}`;
  updParams.push(dossierId);
  if (excludeDossierId) {
    updParams.push(excludeDossierId);
    updSql += ` AND id <> $${updParams.length}`;
  }
  await executor.query(updSql, updParams);

  return { pileStart, budget };
}

/**
 * Vérifie si un dossier est le PREMIER dans la file FIFO d'un utilisateur.
 * Retourne { isBlocked: true, blockingDossier } si bloqué, sinon { isBlocked: false }.
 *
 * Règle : seul le dossier en TÊTE de la file (index 0 dans `queueOrderBy`)
 * peut travailler. Un dossier est donc bloqué UNIQUEMENT par le dossier de
 * tête, jamais par un dossier situé après lui.
 *
 * C'est ce qui rend toute boucle impossible : si #312 et #313 sont tous les
 * deux actifs, #312 (entré en premier) est en tête et n'est jamais bloqué ;
 * #313 est bloqué par #312. Après le traitement de #312, #313 devient la
 * tête et se débloque — au lieu de se renvoyer mutuellement « traitez
 * l'autre d'abord ».
 *
 * Conséquences directes :
 *  - le dossier PRIORITAIRE (réimport après retour dispatch) est en tête
 *    de la file du validateur → jamais bloqué, il passe devant tout le
 *    monde (règle FIFO spéciale) ;
 *  - FIFO strict pour le vérificateur et le validateur : premier entré,
 *    premier traité ;
 *  - aucun effet pour les autres rôles (Dispatch, Admin, super_admin).
 */
async function checkFifoOrder(userId, role, dossierId) {
  let idCol;
  let statut;
  if (role === "Verificateur") {
    idCol = "id_verificateur";
    statut = "EN_VERIFICATION";
  } else if (role === "Validateur") {
    idCol = "id_validateur";
    statut = "EN_VALIDATION";
  } else {
    // La FIFO ne s'applique qu'au vérificateur et au validateur.
    return { isBlocked: false };
  }

  // File complète de l'utilisateur pour ce rôle, dans l'ordre canonique
  // (identique à l'ordre affiché dans la liste).
  const { rows } = await db.query(
    `SELECT d.id, d.nom
       FROM dossier d
      WHERE d.${idCol} = $1
        AND d.statut = $2
      ORDER BY ${queueOrderBy(role)}`,
    [userId, statut],
  );

  const index = rows.findIndex((r) => Number(r.id) === Number(dossierId));
  if (index <= 0) {
    // Dossier en tête de file (ou absent de la file) → autorisé.
    return { isBlocked: false };
  }

  // Bloqueur unique = dossier de tête. Tous les dossiers bloqués pointent
  // vers le même dossier → impossible de se bloquer mutuellement.
  const head = rows[0];
  return {
    isBlocked: true,
    blockingDossier: { id: head.id, nom: head.nom },
  };
}

module.exports = {
  dossierFieldsKey,
  findRetourDispatchDuplicate,
  notifyAllAdmins,
  isUserOnConge,
  saveCurrentVersionToHistory,
  getDossierVersions,
  getPreviousVersion,
  clearVersionHistory,
  markAdminModified,
  countAssignedDossiers,
  hasActiveDossier,
  hasPendingDossier,
  startNextQueuedTimer,
  checkFifoOrder,
  queueOrderBy,
  joinPileDeadline,
};
