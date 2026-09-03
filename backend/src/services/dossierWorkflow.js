const db = require("../config/db");
const { createNotification } = require("./helpers");
const { getTodayDateStr } = require("./deadline");

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
       WHERE id_verificateur = $1 AND statut = 'EN_VERIFICATION'`,
      [userId],
    );
    return rows[0].count;
  }
  if (role === "Validateur") {
    const { rows } = await db.query(
      `SELECT COUNT(*)::int AS count FROM dossier
       WHERE id_validateur = $1 AND statut = 'EN_VALIDATION'`,
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
 * Démarre le timer du dossier FIFO suivant (assign_verification_at ou assign_validation_at).
 * Ordre : updated_at ASC — identique à l'ordre affiché dans la liste du vérificateur /
 * validateur (assigned_*_at ASC NULLS LAST, updated_at ASC). Un dossier revalidé
 * (updated_at récent) démarre donc après les dossiers déjà en file.
 */
async function startNextQueuedTimer(userId, role) {
  let sql;
  let updateCol;
  let params;
  if (role === "Verificateur") {
    sql = `SELECT id FROM dossier
           WHERE id_verificateur = $1 AND statut = 'EN_VERIFICATION'
             AND assigned_verification_at IS NULL
           ORDER BY updated_at ASC LIMIT 1`;
    updateCol = 'assigned_verification_at';
    params = [userId];
  } else if (role === "Validateur") {
    sql = `SELECT id FROM dossier
           WHERE id_validateur = $1 AND statut = 'EN_VALIDATION'
             AND assigned_validation_at IS NULL
           ORDER BY updated_at ASC LIMIT 1`;
    updateCol = 'assigned_validation_at';
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
 * Vérifie si un dossier est le PREMIER dans la file FIFO d'un utilisateur.
 * Retourne { isBlocked: true, blockingDossier } si bloqué, sinon { isBlocked: false }.
 */
async function checkFifoOrder(userId, role, dossierId) {
  let sql;
  // Seuls les dossiers ACTIFS (timer démarré, assigned_at IS NOT NULL) peuvent bloquer.
  // Un dossier en attente FIFO (assigned_at IS NULL) ne bloque pas un dossier actif.
  if (role === "Verificateur") {
    sql = `SELECT id, nom FROM dossier
           WHERE id_verificateur = $1
             AND statut = 'EN_VERIFICATION'
             AND id <> $2
             AND assigned_verification_at IS NOT NULL
           ORDER BY assigned_verification_at ASC, created_at ASC
           LIMIT 1`;
  } else if (role === "Validateur") {
    sql = `SELECT id, nom FROM dossier
           WHERE id_validateur = $1
             AND statut = 'EN_VALIDATION'
             AND id <> $2
             AND assigned_validation_at IS NOT NULL
           ORDER BY assigned_validation_at ASC, created_at ASC
           LIMIT 1`;
  } else {
    return { isBlocked: false };
  }
  const { rows } = await db.query(sql, [userId, dossierId]);
  if (rows[0]) {
    return { isBlocked: true, blockingDossier: rows[0] };
  }
  return { isBlocked: false };
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
};
