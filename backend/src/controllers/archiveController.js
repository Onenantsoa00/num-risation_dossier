const db = require("../config/db");

async function list(req, res) {
  try {
    let sql = `
      SELECT
        a.*,
        d.nom AS dossier_nom,
        d.statut,
        d.fichier_original,
        d.compte_pc,
        d.date_fin_dossier,
        d.ref_ecriture,
        u.nom AS archiveur_nom,
        u.prenoms AS archiveur_prenoms
      FROM archive a
      JOIN dossier d ON d.id = a.id_dossier
      LEFT JOIN utilisateur u ON u.id = a.archive_par
    `;

    const params = [];

    if (req.user.role === "Dispatch") {
      sql += " WHERE d.id_dispatch = $1";
      params.push(req.user.id);
    } else if (!["Admin", "super_admin", "i_archive"].includes(req.user.role)) {
      // Les autres rôles n'ont pas accès aux archives
      return res.json([]);
    }

    sql += " ORDER BY a.date_archivage DESC";

    const { rows } = await db.query(sql, params);

    res.json(rows);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erreur liste archives",
    });
  }
}

/*
 * ============================================================
 * ARCHIVER UN DOSSIER
 * ============================================================
 *
 * Le dossier doit :
 * - être en statut VALIDE
 * - être traité par i_archive ou Admin
 * - avoir compte_pc
 * - avoir date_fin_dossier
 * - avoir ref_ecriture
 *
 * Après validation :
 * - les 3 champs sont enregistrés
 * - le statut devient ARCHIVE
 * - une ligne est créée dans archive
 */
async function archiveDossier(req, res) {
  try {
    if (!["i_archive", "Admin"].includes(req.user.role)) {
      return res.status(403).json({
        error: "Action réservée au service d'archivage",
      });
    }

    const dossierId = req.params.id;

    /*
     * Récupération du dossier
     */
    const dossierResult = await db.query(
      `
        SELECT *
        FROM dossier
        WHERE id = $1
      `,
      [dossierId],
    );

    const dossier = dossierResult.rows[0];

    if (!dossier) {
      return res.status(404).json({
        error: "Dossier introuvable",
      });
    }

    /*
     * Seul un dossier VALIDÉ peut être archivé
     */
    if (dossier.statut !== "VALIDE") {
      return res.status(400).json({
        error: "Seul un dossier validé peut être archivé.",
      });
    }

    /*
     * Récupération des informations d'archivage
     */
    const { compte_pc, date_fin_dossier, ref_ecriture, motif } = req.body;

    /*
     * Vérifications
     */
    if (!compte_pc?.trim()) {
      return res.status(400).json({
        error: "Le compte PC est obligatoire.",
      });
    }

    if (!date_fin_dossier) {
      return res.status(400).json({
        error: "La date de fin du dossier est obligatoire.",
      });
    }

    if (!ref_ecriture?.trim()) {
      return res.status(400).json({
        error: "La référence d'écriture est obligatoire.",
      });
    }

    /*
     * Vérification simple du format de date YYYY-MM-DD
     */
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_fin_dossier)) {
      return res.status(400).json({
        error: "La date de fin du dossier doit être au format YYYY-MM-DD.",
      });
    }

    /*
     * Transaction PostgreSQL
     */
    const client = await db.connect();

    try {
      await client.query("BEGIN");

      /*
       * Mise à jour du dossier
       */
      await client.query(
        `
          UPDATE dossier
          SET
            compte_pc = $1,
            date_fin_dossier = $2,
            ref_ecriture = $3,
            statut = 'ARCHIVE',
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $4
        `,
        [compte_pc.trim(), date_fin_dossier, ref_ecriture.trim(), dossierId],
      );

      /*
       * Création / mise à jour de l'entrée d'archive
       */
      await client.query(
        `
          INSERT INTO archive (
            id_dossier,
            archive_par,
            motif
          )
          VALUES ($1, $2, $3)
          ON CONFLICT (id_dossier)
          DO UPDATE SET
            archive_par = EXCLUDED.archive_par,
            date_archivage = CURRENT_TIMESTAMP,
            motif = EXCLUDED.motif
        `,
        [dossierId, req.user.id, motif?.trim() || null],
      );

      /*
       * Validation de la transaction
       */
      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Dossier archivé définitivement.",
      });
    } catch (error) {
      /*
       * Annulation de toute la transaction
       */
      await client.query("ROLLBACK");

      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Erreur archiveDossier :", err);

    res.status(500).json({
      error: "Erreur lors de l'archivage",
    });
  }
}

module.exports = {
  list,
  archiveDossier,
};
