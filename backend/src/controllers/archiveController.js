// backend/src/controllers/archiveController.js
const fs = require("fs");
const path = require("path");
const db = require("../config/db");
const { uploadDir } = require("../middleware/upload");
const { audit } = require("../services/helpers");
async function list(req, res) {
  try {
    const { q, type } = req.query;

    let sql = `
      SELECT
        a.*,
        a.archivage_rapide,
        d.nom AS dossier_nom,
        d.statut,
        d.fichier_original,

        d.n_compte,
        d.n_be,
        d.n_ord,
        d.n_soa,
        d.exo_budgetaire,
        d.compte_pc,
        d.date_fin_dossier,
        d.ref_ecriture,

        u.nom AS archiveur_nom,
        u.prenoms AS archiveur_prenoms,
        u.im AS archiveur_im

      FROM archive a

      JOIN dossier d
        ON d.id = a.id_dossier

      LEFT JOIN utilisateur u
        ON u.id = a.archive_par
    `;

    const conditions = [];
    const params = [];

    // ============================================================
    // 1. DROITS D'ACCÈS
    // ============================================================

    const archiveRoles = [
      "Dispatch",
      "Verificateur",
      "Validateur",
      "i_archive",
      "Admin",
      "super_admin",
    ];

    if (!archiveRoles.includes(req.user.role)) {
      return res.json([]);
    }

    // ============================================================
    // 2. RECHERCHE
    // ============================================================

    if (q?.trim()) {
      const search = q.trim();

      // ----------------------------------------------------------
      // Recherche par critère précis
      // ----------------------------------------------------------

      const fieldMap = {
        nom: `d.nom ILIKE $SEARCH`,
        exo_budgetaire: `d.exo_budgetaire ILIKE $SEARCH`,
        n_be: `d.n_be ILIKE $SEARCH`,
        n_ord: `d.n_ord ILIKE $SEARCH`,
        n_compte: `d.n_compte ILIKE $SEARCH`,
        n_soa: `d.n_soa ILIKE $SEARCH`,
        compte_pc: `d.compte_pc ILIKE $SEARCH`,
        ref_ecriture: `d.ref_ecriture ILIKE $SEARCH`,

        im: `u.im ILIKE $SEARCH`,

        date_fin_dossier: `
          (
            TO_CHAR(
              d.date_fin_dossier,
              'YYYY-MM-DD'
            ) ILIKE $SEARCH

            OR

            TO_CHAR(
              d.date_fin_dossier,
              'DD/MM/YYYY'
            ) ILIKE $SEARCH
          )
        `,
      };

      if (type && type !== "tous" && fieldMap[type]) {
        const placeholder = `$${params.length + 1}`;

        conditions.push(fieldMap[type].replace(/\$SEARCH/g, placeholder));

        params.push(`%${search}%`);
      }

      // ----------------------------------------------------------
      // Tous les champs
      // ----------------------------------------------------------
      else {
        const placeholder = `$${params.length + 1}`;

        conditions.push(`
          (
            d.nom ILIKE ${placeholder}
            OR d.exo_budgetaire ILIKE ${placeholder}
            OR d.n_be ILIKE ${placeholder}
            OR d.n_ord ILIKE ${placeholder}
            OR d.n_compte ILIKE ${placeholder}
            OR d.n_soa ILIKE ${placeholder}
            OR d.compte_pc ILIKE ${placeholder}
            OR d.ref_ecriture ILIKE ${placeholder}
            OR u.im ILIKE ${placeholder}

            OR TO_CHAR(
              d.date_fin_dossier,
              'YYYY-MM-DD'
            ) ILIKE ${placeholder}

            OR TO_CHAR(
              d.date_fin_dossier,
              'DD/MM/YYYY'
            ) ILIKE ${placeholder}
          )
        `);

        params.push(`%${search}%`);
      }
    }

    // ============================================================
    // 3. WHERE
    // ============================================================

    if (conditions.length) {
      sql += `
        WHERE ${conditions.join(" AND ")}
      `;
    }

    // ============================================================
    // 4. TRI
    // ============================================================

    sql += `
      ORDER BY a.date_archivage DESC
    `;

    const { rows } = await db.query(sql, params);

    res.json(rows);
  } catch (err) {
    console.error("Erreur liste archives :", err);

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
    // --------------------------------------------------------
    // 1. Vérification du rôle
    // --------------------------------------------------------
    if (!["i_archive", "Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({
        error: "Action réservée au service d'archivage",
      });
    }

    const dossierId = req.params.id;

    // --------------------------------------------------------
    // 2. Récupération du dossier
    // --------------------------------------------------------
    const dossierResult = await db.query(
      `
        SELECT *
        FROM dossier
        WHERE id = $1
      `,
      [dossierId],
    );

    const dossier = dossierResult.rows[0];

    // --------------------------------------------------------
    // 3. Vérification existence
    // --------------------------------------------------------
    if (!dossier) {
      return res.status(404).json({
        error: "Dossier introuvable",
      });
    }

    // --------------------------------------------------------
    // 4. Seul un dossier VALIDE peut être archivé
    // --------------------------------------------------------
    if (dossier.statut !== "VALIDE") {
      return res.status(400).json({
        error: "Seul un dossier validé peut être archivé.",
      });
    }

    // --------------------------------------------------------
    // 5. Vérifier que le dossier appartient au i_archive
    // --------------------------------------------------------
    if (req.user.role === "i_archive" && dossier.id_archiveur !== req.user.id) {
      return res.status(403).json({
        error: "Ce dossier ne vous a pas été attribué.",
      });
    }

    // --------------------------------------------------------
    // 6. Récupération des informations d'archivage
    // --------------------------------------------------------
    const { compte_pc, date_fin_dossier, ref_ecriture, motif } = req.body;

    // --------------------------------------------------------
    // 7. Vérifications des champs obligatoires
    // --------------------------------------------------------
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

    // Vérification du format YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_fin_dossier)) {
      return res.status(400).json({
        error: "La date de fin du dossier doit être au format YYYY-MM-DD.",
      });
    }

    const dateCompacte = date_fin_dossier.replace(/-/g, "");

    const archiveurUser = await db.query(
      `
    SELECT im
    FROM utilisateur
    WHERE id = $1
  `,
      [req.user.id],
    );

    const im = archiveurUser.rows[0]?.im;

    if (!im) {
      return res.status(400).json({
        error: "L'IM de l'archiveur est obligatoire pour archiver le dossier.",
      });
    }

    const safePart = (value) =>
      String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    const nouveauNom = [
      dossier.exo_budgetaire,
      dossier.n_be,
      dossier.n_ord,
      dossier.n_compte,
      dossier.n_soa,
      compte_pc,
      ref_ecriture,
      dateCompacte,
      im,
    ]
      .map(safePart)
      .filter(Boolean)
      .join("_");

    const extension = path
      .extname(dossier.fichier_original || "")
      .toLowerCase();

    const nouveauNomFichier = `${nouveauNom}${extension}`;

    const ancienChemin = path.join(uploadDir, dossier.fichier_original);

    const nouveauChemin = path.join(uploadDir, nouveauNomFichier);

    if (!fs.existsSync(ancienChemin)) {
      return res.status(404).json({
        error: "Le fichier original du dossier est introuvable sur le serveur.",
      });
    }

    if (ancienChemin !== nouveauChemin && fs.existsSync(nouveauChemin)) {
      return res.status(409).json({
        error: `Le fichier "${nouveauNomFichier}" existe déjà.`,
      });
    }

    if (ancienChemin !== nouveauChemin) {
      await fs.promises.rename(ancienChemin, nouveauChemin);
    }

    // --------------------------------------------------------
    // 8. Transaction PostgreSQL
    // --------------------------------------------------------
    await db.query(
      `
    UPDATE dossier
    SET
      nom = $1,
      compte_pc = $2,
      date_fin_dossier = $3,
      ref_ecriture = $4,
      fichier_original = $5,
      statut = 'ARCHIVE',
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $6
  `,
      [
        nouveauNom,
        compte_pc.trim(),
        date_fin_dossier,
        ref_ecriture.trim(),
        nouveauNomFichier,
        dossierId,
      ],
    );

    await db.query(
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

    res.json({
      success: true,
      message: "Dossier archivé définitivement.",
    });
  } catch (err) {
    console.error("Erreur archiveDossier :", err);

    res.status(500).json({
      error: "Erreur lors de l'archivage",
    });
  }
}

async function quickArchive(req, res) {
  let tempFilePath = null;
  let finalFilePath = null;

  try {
    // ==========================================================
    // 1. Vérification du rôle
    // ==========================================================

    if (!["Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({
        error:
          "Seul l'Admin ou le super_admin peut effectuer un archivage rapide.",
      });
    }

    // ==========================================================
    // 2. Vérification du fichier
    // ==========================================================

    if (!req.file) {
      return res.status(400).json({
        error: "Le fichier du dossier est obligatoire.",
      });
    }

    // ==========================================================
    // 3. Récupération des champs
    // ==========================================================

    const {
      exo_budgetaire,
      n_be,
      n_ord,
      n_compte,
      n_soa,
      compte_pc,
      ref_ecriture,
      date_fin_dossier,
    } = req.body;

    // ==========================================================
    // 4. Validation
    // ==========================================================

    if (!exo_budgetaire?.trim()) {
      return res.status(400).json({
        error: "L'exercice budgétaire est obligatoire.",
      });
    }

    if (!n_be?.trim()) {
      return res.status(400).json({
        error: "Le N° BE est obligatoire.",
      });
    }

    if (!n_ord?.trim()) {
      return res.status(400).json({
        error: "Le N° ORD est obligatoire.",
      });
    }

    if (!n_compte?.trim()) {
      return res.status(400).json({
        error: "Le N° compte est obligatoire.",
      });
    }

    if (!n_soa?.trim()) {
      return res.status(400).json({
        error: "Le N° SOA est obligatoire.",
      });
    }

    if (!compte_pc?.trim()) {
      return res.status(400).json({
        error: "Le compte PC est obligatoire.",
      });
    }

    if (!ref_ecriture?.trim()) {
      return res.status(400).json({
        error: "La référence d'écriture est obligatoire.",
      });
    }

    if (!date_fin_dossier) {
      return res.status(400).json({
        error: "La date de fin du dossier est obligatoire.",
      });
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date_fin_dossier)) {
      return res.status(400).json({
        error: "La date de fin du dossier doit être au format YYYY-MM-DD.",
      });
    }

    // ==========================================================
    // 5. Récupérer l'IM de l'utilisateur connecté
    // ==========================================================

    const archiveurResult = await db.query(
      `
        SELECT id, nom, prenoms, im
        FROM utilisateur
        WHERE id = $1
      `,
      [req.user.id],
    );

    const archiveur = archiveurResult.rows[0];

    if (!archiveur) {
      return res.status(404).json({
        error: "Utilisateur introuvable.",
      });
    }

    if (!archiveur.im?.trim()) {
      return res.status(400).json({
        error: "Votre IM est obligatoire pour effectuer un archivage rapide.",
      });
    }

    // ==========================================================
    // 6. Fonction de sécurisation des noms
    // ==========================================================

    const safePart = (value) =>
      String(value ?? "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "");

    // ==========================================================
    // 7. Date YYYYMMDD
    // ==========================================================

    const dateCompacte = date_fin_dossier.replace(/-/g, "");

    // ==========================================================
    // 8. Construire le nom du dossier
    // ==========================================================

    const nouveauNom = [
      exo_budgetaire,
      n_be,
      n_ord,
      n_compte,
      n_soa,
      compte_pc,
      ref_ecriture,
      dateCompacte,
      archiveur.im,
    ]
      .map(safePart)
      .filter(Boolean)
      .join("_");

    if (!nouveauNom) {
      return res.status(400).json({
        error: "Impossible de générer le nom du dossier.",
      });
    }

    // ==========================================================
    // 9. Nom final du fichier
    // ==========================================================

    const extension = path.extname(req.file.originalname || "").toLowerCase();

    const nouveauNomFichier = `${nouveauNom}${extension}`;

    // ==========================================================
    // 10. Chemins du fichier
    // ==========================================================

    tempFilePath = path.join(uploadDir, req.file.filename);

    finalFilePath = path.join(uploadDir, nouveauNomFichier);

    // ==========================================================
    // 11. Éviter un doublon
    // ==========================================================

    if (fs.existsSync(finalFilePath)) {
      // supprimer le fichier temporaire créé par Multer
      if (fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
      }

      return res.status(409).json({
        error: `Le fichier "${nouveauNomFichier}" existe déjà.`,
      });
    }

    // ==========================================================
    // 12. Renommer le fichier
    // ==========================================================

    await fs.promises.rename(tempFilePath, finalFilePath);

    // Une fois renommé, le temporaire n'existe plus
    tempFilePath = null;

    // ==========================================================
    // 13. Création du dossier
    // ==========================================================

    const dossierResult = await db.query(
      `
        INSERT INTO dossier (
          nom,
          n_compte,
          n_be,
          n_soa,
          n_ord,
          exo_budgetaire,
          compte_pc,
          date_fin_dossier,
          ref_ecriture,
          fichier_original,
          statut,
          validation,
          rejet,
          id_dispatch,
          id_verificateur,
          id_validateur,
          id_archiveur,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          'ARCHIVE',
          TRUE,
          FALSE,
          NULL,
          NULL,
          NULL,
          $11,
          CURRENT_TIMESTAMP,
          CURRENT_TIMESTAMP
        )
        RETURNING *
      `,
      [
        nouveauNom,
        n_compte.trim(),
        n_be.trim(),
        n_soa.trim(),
        n_ord.trim(),
        exo_budgetaire.trim(),
        compte_pc.trim(),
        date_fin_dossier,
        ref_ecriture.trim(),
        nouveauNomFichier,
        req.user.id,
      ],
    );

    const dossier = dossierResult.rows[0];

    // ==========================================================
    // 14. Historique du traitement
    // ==========================================================

    await db.query(
      `
        INSERT INTO traitement (
          id_users,
          id_dossier,
          type_traitement,
          commentaire,
          statut
        )
        VALUES (
          $1,
          $2,
          'ARCHIVAGE_RAPIDE',
          $3,
          'ARCHIVE'
        )
      `,
      [
        req.user.id,
        dossier.id,
        "Dossier créé et archivé directement via Archivage Rapide.",
      ],
    );

    // ==========================================================
    // 15. Création de l'archive
    // ==========================================================

    await db.query(
      `
        INSERT INTO archive (
          id_dossier,
          archive_par,
          motif,
          archivage_rapide
        )
        VALUES (
          $1,
          $2,
          $3,
          TRUE
        )
      `,
      [dossier.id, req.user.id, "Archivage Rapide"],
    );

    // ==========================================================
    // 16. Audit
    // ==========================================================

    await audit({
      id_user: req.user.id,
      action: "ARCHIVAGE_RAPIDE",
      table_name: "dossier",
      record_id: dossier.id,
      details: {
        nom: nouveauNom,
        fichier: nouveauNomFichier,
        im: archiveur.im,
      },
      ip_address: req.ip,
    });

    // ==========================================================
    // 17. Réponse
    // ==========================================================

    return res.status(201).json({
      success: true,
      message: "Dossier importé et archivé directement.",
      dossier,
    });
  } catch (err) {
    console.error("Erreur quickArchive :", err);

    // ==========================================================
    // Nettoyage si erreur
    // ==========================================================

    try {
      // fichier temporaire
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        await fs.promises.unlink(tempFilePath);
      }

      // fichier final
      if (finalFilePath && fs.existsSync(finalFilePath)) {
        await fs.promises.unlink(finalFilePath);
      }
    } catch (cleanupError) {
      console.error("Erreur nettoyage fichier :", cleanupError);
    }

    return res.status(500).json({
      error: "Erreur lors de l'archivage rapide.",
    });
  }
}

module.exports = {
  list,
  archiveDossier,
  quickArchive,
};
