const db = require("../config/db");
const { audit } = require("../services/helpers");
const { invalidateJourFeriesCache } = require("../services/deadline");

/**
 * Liste tous les jours fériés.
 */
async function list(req, res) {
  try {
    const { rows } = await db.query(
      `SELECT jf.id,
              to_char(jf.date_ferie, 'YYYY-MM-DD') AS date_ferie,
              jf.libelle, jf.created_at,
              u.nom AS created_by_nom, u.prenoms AS created_by_prenoms
       FROM jour_ferier jf
       LEFT JOIN utilisateur u ON u.id = jf.created_by
       ORDER BY jf.date_ferie ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération des jours fériés" });
  }
}

/**
 * Créer un jour férié.
 */
async function create(req, res) {
  try {
    if (!["Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Réservé à l'administrateur" });
    }

    const { date_ferie, libelle } = req.body;

    if (!date_ferie) {
      return res.status(400).json({ error: "La date est requise." });
    }

    if (!libelle?.trim()) {
      return res.status(400).json({ error: "Le libellé est requis." });
    }

    // Vérifier doublon
    const exists = await db.query(
      `SELECT id FROM jour_ferier WHERE date_ferie = $1`,
      [date_ferie]
    );
    if (exists.rows.length) {
      return res.status(409).json({ error: "Cette date est déjà un jour férié." });
    }

    const { rows } = await db.query(
      `INSERT INTO jour_ferier (date_ferie, libelle, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, date_ferie, libelle, created_at`,
      [date_ferie, libelle.trim(), req.user.id]
    );

    invalidateJourFeriesCache();

    await audit({
      id_user: req.user.id,
      action: "CREATE_JOUR_FERIER",
      table_name: "jour_ferier",
      record_id: rows[0].id,
      details: { date_ferie, libelle: libelle.trim() },
      ip_address: req.ip,
    });

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur création jour férié" });
  }
}

/**
 * Supprimer un jour férié.
 */
async function remove(req, res) {
  try {
    if (!["Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Réservé à l'administrateur" });
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ error: "Identifiant invalide." });
    }

    const { rows } = await db.query(
      `DELETE FROM jour_ferier WHERE id = $1 RETURNING id, date_ferie, libelle`,
      [id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Jour férié introuvable." });
    }

    invalidateJourFeriesCache();

    await audit({
      id_user: req.user.id,
      action: "DELETE_JOUR_FERIER",
      table_name: "jour_ferier",
      record_id: id,
      details: { date_ferie: rows[0].date_ferie, libelle: rows[0].libelle },
      ip_address: req.ip,
    });

    res.json({ message: "Jour férié supprimé." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur suppression jour férié" });
  }
}

module.exports = {
  list,
  create,
  remove,
};
