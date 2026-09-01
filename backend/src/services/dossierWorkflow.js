const db = require("../config/db");
const { createNotification } = require("./helpers");

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
     WHERE d.statut = 'RETOUR_DISPATCH'
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

async function isUserOnConge(userId) {
  const { rows } = await db.query(
    `SELECT conge_debut, conge_fin FROM utilisateur WHERE id = $1`,
    [userId],
  );
  const u = rows[0];
  if (!u?.conge_debut || !u?.conge_fin) return false;
  const today = new Date().toISOString().slice(0, 10);
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
};
