const db = require("../config/db");

const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes sans heartbeat = déconnecté

async function updatePresence(userId, status, dossierId = null) {
  await db.query(
    `UPDATE utilisateur
     SET presence_status = $1,
         presence_dossier_id = $2,
         last_activity_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $3`,
    [status, dossierId, userId],
  );
}

/**
 * Traduit un presence_status en libellé affiché dans la colonne « Activité ».
 */
function statusToDisplay(status, isOnline) {
  if (!isOnline) return "déconnecté";
  switch (status) {
    case "typing":
      return "en train d'écrire";
    case "scrolling":
      return "en scroll";
    case "viewing":
      return "en scroll";
    default:
      return "connecté";
  }
}

async function getPresenceList() {
  const { rows } = await db.query(
    `SELECT
       u.id,
       u.nom,
       u.prenoms,
       u.im,
       u.last_activity_at,
       u.presence_status,
       u.presence_dossier_id,
       r.nom AS role
     FROM utilisateur u
     LEFT JOIN roles r ON r.id = u.id_roles
     WHERE u.actif = TRUE
     ORDER BY u.nom, u.prenoms`,
  );

  const now = Date.now();

  return rows.map((u) => {
    const lastActivity = u.last_activity_at
      ? new Date(u.last_activity_at).getTime()
      : 0;
    // Online = statut différent de "offline" ET activité récente.
    // Un utilisateur déconnecté explicitement (presence_status='offline')
    // reste "déconnecté" même si last_activity_at est récent.
    const isOnline =
      u.presence_status !== "offline" &&
      now - lastActivity < OFFLINE_THRESHOLD_MS;

    return {
      ...u,
      is_online: isOnline,
      display_status: statusToDisplay(u.presence_status, isOnline),
    };
  });
}

module.exports = {
  updatePresence,
  getPresenceList,
  statusToDisplay,
  OFFLINE_THRESHOLD_MS,
};
