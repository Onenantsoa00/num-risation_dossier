const db = require('../config/db');

let _io = null;

function setIO(io) {
  _io = io;
}

function getIO() {
  if (_io) return _io;
  // Fallback: récupérer depuis l'app Express
  try {
    const app = require('express')();
    // Ne devrait pas arriver normalement
  } catch {}
  return null;
}

/**
 * Émettre un événement WebSocket à un utilisateur spécifique.
 */
function emitToUser(userId, event, data) {
  if (!_io) return;
  _io.to(`user:${userId}`).emit(event, data);
}

/**
 * Émettre un événement WebSocket à tous les admins.
 */
function emitToAdmins(event, data) {
  if (!_io) return;
  _io.to('admins').emit(event, data);
}

async function createNotification({ id_user, id_dossier, message, type = 'INFO' }) {
  const { rows } = await db.query(
    `INSERT INTO notification (id_user, id_dossier, message, type)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id_user, id_dossier || null, message, type]
  );

  const notification = rows[0];

  // ── WebSocket : envoyer la notification en temps réel ──
  emitToUser(id_user, 'notification:new', notification);

  // Aussi mettre à jour le compteur non-lu
  const { rows: countRows } = await db.query(
    'SELECT COUNT(*)::int AS count FROM notification WHERE id_user = $1 AND lu = FALSE',
    [id_user]
  );
  emitToUser(id_user, 'notification:unread-count', { count: countRows[0].count });

  return notification;
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

module.exports = { createNotification, notifyMentions, audit, setIO, emitToUser, emitToAdmins };
