const db = require('../config/db');

async function list(req, res) {
  try {
    let sql = `
      SELECT a.*, d.nom AS dossier_nom, d.statut, d.fichier_original,
             u.nom AS archiveur_nom, u.prenoms AS archiveur_prenoms
      FROM archive a
      JOIN dossier d ON d.id = a.id_dossier
      LEFT JOIN utilisateur u ON u.id = a.archive_par
    `;
    const params = [];

    if (req.user.role === 'Dispatch') {
      sql += ' WHERE d.id_dispatch = $1';
      params.push(req.user.id);
    }

    sql += ' ORDER BY a.date_archivage DESC';
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur liste archives' });
  }
}

module.exports = { list };
