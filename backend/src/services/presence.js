const db = require("../config/db");

const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000; // 2 minutes sans activité = déconnecté

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
    const isOnline = now - lastActivity < OFFLINE_THRESHOLD_MS;

    let displayStatus = "déconnecté";
    if (isOnline) {
      if (u.presence_status === "typing") {
        displayStatus = "en train d'écrire";
      } else if (u.presence_status === "viewing") {
        displayStatus = "consulte un dossier";
      } else if (u.presence_status === "scrolling") {
        displayStatus = "consulte un dossier";
      } else {
        displayStatus = "connecté";
      }
    }

    return {
      ...u,
      is_online: isOnline,
      display_status: displayStatus,
    };
  });
}

module.exports = {
  updatePresence,
  getPresenceList,
  OFFLINE_THRESHOLD_MS,
};
