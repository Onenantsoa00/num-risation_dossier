const db = require('../config/db');

async function list(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT * FROM notification
       WHERE id_user = $1
       ORDER BY created_at DESC
       LIMIT 100`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur récupération des notifications' });
  }
}

async function unreadCount(req, res) {
  try {
    const { rows } = await db.query(
      'SELECT COUNT(*)::int AS count FROM notification WHERE id_user = $1 AND lu = FALSE',
      [req.user.id]
    );
    res.json({ count: rows[0].count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur comptage notifications' });
  }
}

async function markRead(req, res) {
  try {
    const { id } = req.params;
    await db.query(
      'UPDATE notification SET lu = TRUE WHERE id = $1 AND id_user = $2',
      [id, req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur marquage notification' });
  }
}

async function markAllRead(req, res) {
  try {
    await db.query(
      'UPDATE notification SET lu = TRUE WHERE id_user = $1 AND lu = FALSE',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur marquage notifications' });
  }
}

module.exports = { list, unreadCount, markRead, markAllRead };
