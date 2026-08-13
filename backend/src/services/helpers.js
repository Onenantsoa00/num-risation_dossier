const db = require('../config/db');

async function createNotification({ id_user, id_dossier, message, type = 'INFO' }) {
  const { rows } = await db.query(
    `INSERT INTO notification (id_user, id_dossier, message, type)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id_user, id_dossier || null, message, type]
  );
  return rows[0];
}

async function notifyMentions(commentaire, id_dossier, fromUser) {
  if (!commentaire) return [];
  const mentions = [...commentaire.matchAll(/@([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g)];
  const created = [];

  for (const m of mentions) {
    const email = m[1];
    const { rows } = await db.query(
      'SELECT id, email FROM utilisateur WHERE LOWER(email) = LOWER($1)',
      [email]
    );
    if (rows[0] && rows[0].id !== fromUser.id) {
      const notif = await createNotification({
        id_user: rows[0].id,
        id_dossier,
        message: `${fromUser.prenoms} ${fromUser.nom} vous a mentionné dans le dossier #${id_dossier}`,
        type: 'INFO',
      });
      created.push(notif);
    }
  }
  return created;
}

async function audit({ id_user, action, table_name, record_id, details, ip_address }) {
  await db.query(
    `INSERT INTO audit_log (id_user, action, table_name, record_id, details, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [id_user || null, action, table_name || null, record_id || null, details ? JSON.stringify(details) : null, ip_address || null]
  );
}

module.exports = { createNotification, notifyMentions, audit };
