//backend/src/controllers/dossierController.js
const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const db = require("../config/db");
const PDFDocument = require("pdfkit");
const {
  createNotification,
  notifyMentions,
  audit,
} = require("../services/helpers");
const { uploadDir } = require("../middleware/upload");

const DOSSIER_SELECT = `
  SELECT d.*,
    ud.nom AS dispatch_nom,
    ud.prenoms AS dispatch_prenoms,
    ud.email AS dispatch_email,

    uv.nom AS verificateur_nom,
    uv.prenoms AS verificateur_prenoms,
    uv.email AS verificateur_email,

    uval.nom AS validateur_nom,
    uval.prenoms AS validateur_prenoms,
    uval.email AS validateur_email,

    uarch.nom AS archiveur_nom,
    uarch.prenoms AS archiveur_prenoms,
    uarch.email AS archiveur_email,
    uarch.im AS archiveur_im

  FROM dossier d

  LEFT JOIN utilisateur ud
    ON ud.id = d.id_dispatch

  LEFT JOIN utilisateur uv
    ON uv.id = d.id_verificateur

  LEFT JOIN utilisateur uval
    ON uval.id = d.id_validateur

  LEFT JOIN utilisateur uarch
    ON uarch.id = d.id_archiveur
`;

async function getDossierOr404(id) {
  const { rows } = await db.query(`${DOSSIER_SELECT} WHERE d.id = $1`, [id]);
  return rows[0] || null;
}

function canSeeDossier(user, dossier) {
  if (["Admin", "super_admin"].includes(user.role)) {
    return true;
  }
  if (user.role === "Dispatch" && dossier.id_dispatch === user.id) return true;
  if (user.role === "Verificateur" && dossier.id_verificateur === user.id)
    return true;
  if (
    user.role === "i_archive" &&
    ["VALIDE", "ARCHIVE"].includes(dossier.statut) &&
    dossier.id_archiveur === user.id
  ) {
    return true;
  }
  if (user.role === "Validateur" && dossier.id_validateur === user.id)
    return true;
  // Dispatch voit aussi les retours
  if (
    user.role === "Dispatch" &&
    ["RETOUR_DISPATCH", "VALIDE", "REJETE", "ARCHIVE"].includes(dossier.statut)
  ) {
    return dossier.id_dispatch === user.id;
  }
  return false;
}

async function list(req, res) {
  try {
    const { statut, q } = req.query;
    const params = [];
    let where = "WHERE 1=1";
    let i = 1;

    if (req.user.role === "Dispatch") {
      where += ` AND d.id_dispatch = $${i++}`;
      params.push(req.user.id);
    } else if (req.user.role === "Verificateur") {
      where += ` AND d.id_verificateur = $${i++}`;
      params.push(req.user.id);
    } else if (req.user.role === "Validateur") {
      where += ` AND d.id_validateur = $${i++}`;
      params.push(req.user.id);
    } else if (req.user.role === "i_archive") {
      where += ` AND d.statut = 'VALIDE'`;
    }

    if (statut) {
      where += ` AND d.statut = $${i++}`;
      params.push(statut);
    }
    if (q) {
      where += ` AND (d.nom ILIKE $${i} OR d.n_compte ILIKE $${i} OR d.n_be ILIKE $${i} OR d.n_soa ILIKE $${i})`;
      params.push(`%${q}%`);
      i++;
    }

    const { rows } = await db.query(
      `${DOSSIER_SELECT} ${where} ORDER BY d.updated_at DESC`,
      params,
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur liste des dossiers" });
  }
}

async function archiveDossier(req, res) {
  try {
    if (req.user.role !== "i_archive" && req.user.role !== "Admin") {
      return res.status(403).json({
        error: "Action réservée au service d'archivage",
      });
    }

    const dossierId = req.params.id;

    const dossierResult = await db.query(
      `SELECT *
       FROM dossier
       WHERE id = $1`,
      [dossierId],
    );

    const dossier = dossierResult.rows[0];

    if (!dossier) {
      return res.status(404).json({
        error: "Dossier introuvable",
      });
    }

    if (dossier.statut !== "VALIDE") {
      return res.status(400).json({
        error: "Seul un dossier validé peut être archivé.",
      });
    }

    const { compte_pc, date_fin_dossier, ref_ecriture, motif } = req.body;

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

    const client = await db.connect();

    try {
      await client.query("BEGIN");

      await client.query(
        `
    UPDATE dossier
    SET
      commentaire = $1,
      statut = $2,
      validation = $3,
      rejet = $4,
      compte_pc = NULL,
      date_fin_dossier = NULL,
      ref_ecriture = NULL,
      id_archiveur = $5,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $6
  `,
        [
          commentaire,
          statut,
          isValide,
          !isValide,
          isValide ? archiveur.id : null,
          dossier.id,
        ],
      );

      await client.query(
        `INSERT INTO archive (
           id_dossier,
           archive_par,
           motif
         )
         VALUES ($1, $2, $3)
         ON CONFLICT (id_dossier)
         DO UPDATE SET
           archive_par = EXCLUDED.archive_par,
           date_archivage = CURRENT_TIMESTAMP,
           motif = EXCLUDED.motif`,
        [dossierId, req.user.id, motif?.trim() || null],
      );

      await client.query("COMMIT");

      res.json({
        success: true,
        message: "Dossier archivé définitivement.",
      });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erreur lors de l'archivage",
    });
  }
}

async function getOne(req, res) {
  try {
    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (!canSeeDossier(req.user, dossier)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const traitements = await db.query(
      `SELECT t.*, u.nom, u.prenoms, u.email, r.nom AS role
       FROM traitement t
       JOIN utilisateur u ON u.id = t.id_users
       LEFT JOIN roles r ON r.id = u.id_roles
       WHERE t.id_dossier = $1
       ORDER BY t.date_traitement ASC`,
      [dossier.id],
    );

    res.json({ ...dossier, traitements: traitements.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération du dossier" });
  }
}

async function create(req, res) {
  try {
    if (!["Dispatch", "Admin", "super_admin"].includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "Seul le Dispatch peut importer un dossier" });
    }

    const {
      nom,
      n_compte,
      n_be,
      n_soa,
      n_ord,
      exo_budgetaire,
      commentaire,
      id_verificateur,
    } = req.body;
    if (!nom)
      return res.status(400).json({ error: "Le nom du dossier est requis" });
    if (!id_verificateur)
      return res
        .status(400)
        .json({ error: "Un vérificateur doit être désigné" });
    if (!req.file)
      return res
        .status(400)
        .json({ error: "Le fichier du dossier est requis" });

    const verif = await db.query(
      `SELECT u.id, u.email, r.nom AS role FROM utilisateur u
       JOIN roles r ON r.id = u.id_roles WHERE u.id = $1`,
      [id_verificateur],
    );
    if (
      !verif.rows[0] ||
      !["Verificateur", "Admin"].includes(verif.rows[0].role)
    ) {
      return res
        .status(400)
        .json({ error: "Utilisateur vérificateur invalide" });
    }

    // ------------------------------------------------------------
    // Préparation du nom final du fichier
    // ------------------------------------------------------------

    const safeNom = nom
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^[-_.]+|[-_.]+$/g, "")
      .trim();

    const extension = path.extname(req.file.originalname).toLowerCase();

    const finalFileName = `${safeNom}${extension}`;

    const tempFilePath = path.join(uploadDir, req.file.filename);

    const finalFilePath = path.join(uploadDir, finalFileName);

    // Ne jamais écraser un fichier existant
    if (fs.existsSync(finalFilePath)) {
      return res.status(409).json({
        error: `Un fichier nommé "${finalFileName}" existe déjà.`,
      });
    }

    // Renommage du fichier temporaire
    await fs.promises.rename(tempFilePath, finalFilePath);

    // ------------------------------------------------------------
    // Création du dossier
    // ------------------------------------------------------------

    const { rows } = await db.query(
      `INSERT INTO dossier (
     nom,
     n_compte,
     n_be,
     n_soa,
     n_ord,
     exo_budgetaire,
     compte_pc,
     date_fin_dossier,
     ref_ecriture,
     commentaire,
     fichier_original,
     statut,
     id_dispatch,
     id_verificateur
   )
   VALUES (
     $1,
     $2,
     $3,
     $4,
     $5,
     $6,
     NULL,
     NULL,
     NULL,
     $7,
     $8,
     'EN_VERIFICATION',
     $9,
     $10
   )
   RETURNING *`,
      [
        nom,
        n_compte || null,
        n_be || null,
        n_soa || null,
        n_ord || null,
        exo_budgetaire || null,
        commentaire || null,
        finalFileName,
        req.user.id,
        id_verificateur,
      ],
    );

    const dossier = rows[0];

    await db.query(
      `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
       VALUES ($1, $2, 'DISPATCH', $3, 'EN_VERIFICATION')`,
      [
        req.user.id,
        dossier.id,
        commentaire || "Dossier importé et transmis au vérificateur",
      ],
    );

    await createNotification({
      id_user: Number(id_verificateur),
      id_dossier: dossier.id,
      message: `Nouveau dossier « ${nom} » à vérifier (envoyé par ${req.user.prenoms} ${req.user.nom})`,
      type: "VERIFICATION",
    });

    await notifyMentions(commentaire, dossier.id, req.user);

    await audit({
      id_user: req.user.id,
      action: "CREATE_DOSSIER",
      table_name: "dossier",
      record_id: dossier.id,
      details: { nom },
      ip_address: req.ip,
    });

    res.status(201).json(await getDossierOr404(dossier.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur création du dossier" });
  }
}

async function comment(req, res) {
  try {
    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (!canSeeDossier(req.user, dossier)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const { commentaire } = req.body;
    if (!commentaire?.trim()) {
      return res.status(400).json({ error: "Commentaire requis" });
    }

    // Met à jour le commentaire courant du dossier
    await db.query(
      `UPDATE dossier SET commentaire = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
      [commentaire, dossier.id],
    );

    let type = "VERIFICATION";
    if (req.user.role === "Validateur" || req.user.role === "Admin")
      type = "VALIDATION";
    if (req.user.role === "Dispatch") type = "DISPATCH";

    await db.query(
      `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, dossier.id, type, commentaire, dossier.statut],
    );

    await notifyMentions(commentaire, dossier.id, req.user);

    res.json(await getDossierOr404(dossier.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur commentaire" });
  }
}

async function sendToValidateur(req, res) {
  try {
    if (!["Verificateur", "Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Action réservée au vérificateur" });
    }

    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (
      !["Admin", "super_admin"].includes(req.user.role) &&
      dossier.id_verificateur !== req.user.id
    ) {
      return res
        .status(403)
        .json({ error: "Ce dossier ne vous est pas assigné" });
    }
    if (
      !["EN_VERIFICATION", "RETOUR_DISPATCH"].includes(dossier.statut) &&
      !["Admin", "super_admin"].includes(req.user.role)
    ) {
      return res
        .status(400)
        .json({ error: "Statut incompatible pour l'envoi en validation" });
    }

    const { id_validateur, commentaire } = req.body;
    if (!id_validateur)
      return res.status(400).json({ error: "Un validateur doit être désigné" });

    const val = await db.query(
      `SELECT u.id, r.nom AS role FROM utilisateur u
       JOIN roles r ON r.id = u.id_roles WHERE u.id = $1`,
      [id_validateur],
    );
    if (!val.rows[0] || !["Validateur", "Admin"].includes(val.rows[0].role)) {
      return res.status(400).json({ error: "Utilisateur validateur invalide" });
    }

    await db.query(
      `UPDATE dossier SET
         id_validateur = $1,
         commentaire = COALESCE($2, commentaire),
         statut = 'EN_VALIDATION',
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [id_validateur, commentaire || null, dossier.id],
    );

    await db.query(
      `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
       VALUES ($1, $2, 'VERIFICATION', $3, 'EN_VALIDATION')`,
      [
        req.user.id,
        dossier.id,
        commentaire || "Dossier transmis au validateur",
      ],
    );

    await createNotification({
      id_user: Number(id_validateur),
      id_dossier: dossier.id,
      message: `Dossier « ${dossier.nom} » à valider (envoyé par ${req.user.prenoms} ${req.user.nom})`,
      type: "VALIDATION",
    });

    await notifyMentions(commentaire, dossier.id, req.user);

    res.json(await getDossierOr404(dossier.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur envoi au validateur" });
  }
}

async function decide(req, res) {
  try {
    if (!["Validateur", "Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Action réservée au validateur" });
    }

    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (
      !["Admin", "super_admin"].includes(req.user.role) &&
      dossier.id_validateur !== req.user.id
    ) {
      return res
        .status(403)
        .json({ error: "Ce dossier ne vous est pas assigné" });
    }

    const { action, commentaire, id_archiveur } = req.body;
    if (!["valider", "rejeter"].includes(action)) {
      return res
        .status(400)
        .json({ error: "action doit être valider ou rejeter" });
    }
    if (action === "valider" && !id_archiveur) {
      return res.status(400).json({
        error: "Vous devez désigner un responsable d'archivage.",
      });
    }
    let archiveur = null;

    if (action === "valider") {
      const archiveurResult = await db.query(
        `
      SELECT
        u.id,
        u.nom,
        u.prenoms,
        u.email
      FROM utilisateur u
      JOIN roles r ON r.id = u.id_roles
      WHERE u.id = $1
        AND LOWER(r.nom) = LOWER('i_archive')
    `,
        [id_archiveur],
      );

      archiveur = archiveurResult.rows[0];

      if (!archiveur) {
        return res.status(400).json({
          error: "L'utilisateur sélectionné n'a pas le rôle i_archive.",
        });
      }
    }
    if (!commentaire?.trim()) {
      return res.status(400).json({ error: "Un commentaire est requis" });
    }

    const isValide = action === "valider";
    const statut = isValide ? "VALIDE" : "REJETE";
    const typeTraitement = isValide ? "VALIDATION" : "REJET";

    await db.query(
      `
    UPDATE dossier SET
      commentaire = $1,
      statut = $2,
      validation = $3,
      rejet = $4,
      compte_pc = NULL,
      date_fin_dossier = NULL,
      ref_ecriture = NULL,
      id_archiveur = $5,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = $6
  `,
      [
        commentaire,
        statut,
        isValide,
        !isValide,
        isValide ? archiveur.id : null,
        dossier.id,
      ],
    );

    await db.query(
      `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.user.id, dossier.id, typeTraitement, commentaire, statut],
    );

    // Retour au dispatch + notification
    if (dossier.id_dispatch) {
      await createNotification({
        id_user: dossier.id_dispatch,
        id_dossier: dossier.id,
        message: `Dossier « ${dossier.nom} » ${isValide ? "validé" : "rejeté"} — retour Dispatch`,
        type: isValide ? "VALIDATION" : "REJET",
      });
    }
    if (isValide && archiveur) {
      await createNotification({
        id_user: archiveur.id,
        id_dossier: dossier.id,
        message: `Le dossier « ${dossier.nom} » a été validé et vous est attribué pour archivage.`,
        type: "DOSSIER",
      });
    }

    await notifyMentions(commentaire, dossier.id, req.user);

    await audit({
      id_user: req.user.id,
      action: isValide ? "VALIDER_DOSSIER" : "REJETER_DOSSIER",
      table_name: "dossier",
      record_id: dossier.id,
      ip_address: req.ip,
    });

    res.json(await getDossierOr404(dossier.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur décision dossier" });
  }
}

async function adminAction(req, res) {
  try {
    if (!["Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({
        error: "Réservé à l'Admin ou au super_admin",
      });
    }

    const dossier = await getDossierOr404(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        error: "Dossier introuvable",
      });
    }

    const { action, commentaire, id_verificateur, id_validateur } = req.body;

    if (!commentaire?.trim()) {
      return res.status(400).json({
        error: "Commentaire requis",
      });
    }

    if (action === "verifier") {
      const verifId = id_verificateur || dossier.id_verificateur;

      await db.query(
        `
          UPDATE dossier
          SET
            commentaire = $1,
            statut = 'EN_VERIFICATION',
            id_verificateur = COALESCE($2, id_verificateur),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `,
        [commentaire, verifId, dossier.id],
      );

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
            'VERIFICATION',
            $3,
            'EN_VERIFICATION'
          )
        `,
        [req.user.id, dossier.id, commentaire],
      );

      if (verifId) {
        await createNotification({
          id_user: Number(verifId),
          id_dossier: dossier.id,
          message: `Admin : dossier « ${dossier.nom} » en vérification`,
          type: "VERIFICATION",
        });
      }
    } else if (action === "valider" || action === "rejeter") {
      req.body.action = action;
      return decide(req, res);
    } else {
      return res.status(400).json({
        error: "action invalide (verifier|valider|rejeter)",
      });
    }

    await notifyMentions(commentaire, dossier.id, req.user);

    res.json(await getDossierOr404(dossier.id));
  } catch (err) {
    console.error("Erreur action admin :", err);

    res.status(500).json({
      error: "Erreur action admin",
    });
  }
}

async function returnToDispatch(req, res) {
  try {
    if (
      !["Validateur", "Verificateur", "Admin", "super_admin"].includes(
        req.user.role,
      )
    ) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });

    const { commentaire } = req.body;
    if (!commentaire?.trim()) {
      return res.status(400).json({ error: "Commentaire requis" });
    }

    await db.query(
      `UPDATE dossier SET commentaire = $1, statut = 'RETOUR_DISPATCH', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [commentaire, dossier.id],
    );

    await db.query(
      `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
       VALUES ($1, $2, 'RETOUR', $3, 'RETOUR_DISPATCH')`,
      [req.user.id, dossier.id, commentaire],
    );

    if (dossier.id_dispatch) {
      await createNotification({
        id_user: dossier.id_dispatch,
        id_dossier: dossier.id,
        message: `Dossier « ${dossier.nom} » retourné au Dispatch`,
        type: "DOSSIER",
      });
    }

    await notifyMentions(commentaire, dossier.id, req.user);
    res.json(await getDossierOr404(dossier.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur retour dispatch" });
  }
}

async function reuploadVersion(req, res) {
  let tempFilePath = null;
  let finalFilePath = null;

  try {
    if (!["Dispatch", "Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({
        error:
          "Seul le Dispatch, l'Admin ou le super_admin peut importer une nouvelle version",
      });
    }

    const dossier = await getDossierOr404(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        error: "Dossier introuvable",
      });
    }

    if (
      !["Admin", "super_admin"].includes(req.user.role) &&
      dossier.id_dispatch !== req.user.id
    ) {
      return res.status(403).json({
        error: "Ce dossier ne vous appartient pas",
      });
    }

    if (dossier.statut !== "RETOUR_DISPATCH") {
      return res.status(400).json({
        error:
          "Une nouvelle version ne peut être importée que pour un dossier retourné au Dispatch",
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: "Le nouveau fichier est requis",
      });
    }

    tempFilePath = path.join(uploadDir, req.file.filename);

    const { n_compte, n_be, n_soa, exo_budgetaire, id_verificateur } = req.body;

    if (!n_compte?.trim()) {
      return res.status(400).json({
        error: "Le N° compte est requis",
      });
    }

    if (!n_be?.trim()) {
      return res.status(400).json({
        error: "Le N° BE est requis",
      });
    }

    if (!n_soa?.trim()) {
      return res.status(400).json({
        error: "Le N° SOA est requis",
      });
    }

    if (!exo_budgetaire?.trim()) {
      return res.status(400).json({
        error: "L'exercice budgétaire est requis",
      });
    }

    /*
     * Le vérificateur doit rester valide.
     * Le Dispatch peut éventuellement en sélectionner un autre.
     */
    const verifierId = id_verificateur || dossier.id_verificateur;

    if (!verifierId) {
      return res.status(400).json({
        error: "Un vérificateur doit être désigné",
      });
    }

    const verif = await db.query(
      `SELECT u.id, u.email, r.nom AS role
       FROM utilisateur u
       JOIN roles r ON r.id = u.id_roles
       WHERE u.id = $1`,
      [verifierId],
    );

    if (
      !verif.rows[0] ||
      !["Verificateur", "Admin"].includes(verif.rows[0].role)
    ) {
      return res.status(400).json({
        error: "Utilisateur vérificateur invalide",
      });
    }

    /*
     * Nouvelle version
     */
    const newVersion = Number(dossier.version || 1) + 1;

    /*
     * Nom de base basé sur les nouveaux champs.
     *
     * Exemple :
     * 100020039-10399049-0293029390-2026
     */
    const baseName = [
      n_compte.trim(),
      n_be.trim(),
      n_soa.trim(),
      exo_budgetaire.trim(),
    ]
      .join("-")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^[-_.]+|[-_.]+$/g, "")
      .trim();

    /*
     * Pour la version 2 :
     * 100020039-10399049-0293029390-2026(2)
     */
    const versionedName = `${baseName}(${newVersion})`;

    /*
     * Extension du fichier original.
     */
    const extension = path.extname(req.file.originalname).toLowerCase();

    const finalFileName = `${versionedName}${extension}`;

    finalFilePath = path.join(uploadDir, finalFileName);

    /*
     * Protection supplémentaire contre un doublon.
     */
    if (fs.existsSync(finalFilePath)) {
      return res.status(409).json({
        error: `Le fichier "${finalFileName}" existe déjà.`,
      });
    }

    /*
     * Renommer le fichier temporaire.
     *
     * L'ancien fichier n'est PAS supprimé.
     */
    await fs.promises.rename(tempFilePath, finalFilePath);

    tempFilePath = null;

    /*
     * Mise à jour du même dossier.
     *
     * IMPORTANT :
     * commentaire reste inchangé.
     */
    const { rows } = await db.query(
      `UPDATE dossier
   SET
     nom = $1,
     n_compte = $2,
     n_be = $3,
     n_soa = $4,
     exo_budgetaire = $5,
     compte_pc = NULL,
     date_fin_dossier = NULL,
     ref_ecriture = NULL,
     fichier_original = $6,
     version = $7,
     id_verificateur = $8,
     statut = 'EN_VERIFICATION',
     validation = FALSE,
     rejet = FALSE,
     updated_at = CURRENT_TIMESTAMP
   WHERE id = $9
   RETURNING *`,
      [
        versionedName,
        n_compte.trim(),
        n_be.trim(),
        n_soa.trim(),
        exo_budgetaire.trim(),
        finalFileName,
        newVersion,
        verifierId,
        dossier.id,
      ],
    );

    const updatedDossier = rows[0];

    /*
     * Conservation de l'historique.
     *
     * Le commentaire actuel du dossier n'est PAS écrasé.
     */
    await db.query(
      `INSERT INTO traitement (
         id_users,
         id_dossier,
         type_traitement,
         commentaire,
         statut
       )
       VALUES ($1, $2, 'DISPATCH', $3, 'EN_VERIFICATION')`,
      [
        req.user.id,
        updatedDossier.id,
        `Nouvelle version du dossier importée (version ${newVersion})`,
      ],
    );

    /*
     * Notification du vérificateur
     */
    await createNotification({
      id_user: Number(verifierId),
      id_dossier: updatedDossier.id,
      message: `Nouvelle version du dossier « ${versionedName} » à vérifier`,
      type: "VERIFICATION",
    });

    /*
     * Audit
     */
    await audit({
      id_user: req.user.id,
      action: "REUPLOAD_DOSSIER",
      table_name: "dossier",
      record_id: updatedDossier.id,
      details: {
        ancienne_version: dossier.version,
        nouvelle_version: newVersion,
        ancien_fichier: dossier.fichier_original,
        nouveau_fichier: finalFileName,
        ancien_nom: dossier.nom,
        nouveau_nom: versionedName,
      },
      ip_address: req.ip,
    });

    res.json(await getDossierOr404(updatedDossier.id));
  } catch (err) {
    console.error(err);

    /*
     * Si le fichier a été uploadé mais qu'une erreur
     * survient avant son renommage, on le supprime.
     */
    if (tempFilePath) {
      try {
        if (fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath);
        }
      } catch (cleanupError) {
        console.error("Erreur nettoyage fichier temporaire :", cleanupError);
      }
    }

    /*
     * Si le fichier final existe mais que la mise à jour
     * a échoué, on peut le supprimer afin d'éviter
     * un fichier orphelin.
     */
    if (finalFilePath) {
      try {
        if (fs.existsSync(finalFilePath)) {
          await fs.promises.unlink(finalFilePath);
        }
      } catch (cleanupError) {
        console.error("Erreur nettoyage fichier final :", cleanupError);
      }
    }

    res.status(500).json({
      error: "Erreur lors de l'import de la nouvelle version",
    });
  }
}

async function exportDossier(req, res) {
  try {
    // ============================================================
    // 1. Récupération du dossier
    // ============================================================
    const dossier = await getDossierOr404(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        error: "Dossier introuvable",
      });
    }

    // ============================================================
    // 2. Vérification des droits d'accès
    // ============================================================
    if (!canSeeDossier(req.user, dossier)) {
      return res.status(403).json({
        error: "Accès refusé",
      });
    }

    // ============================================================
    // 3. Récupération de l'historique des traitements
    // ============================================================
    const traitements = await db.query(
      `
        SELECT
          t.*,
          u.nom,
          u.prenoms,
          u.email
        FROM traitement t
        JOIN utilisateur u
          ON u.id = t.id_users
        WHERE t.id_dossier = $1
        ORDER BY t.date_traitement ASC
      `,
      [dossier.id],
    );

    // ============================================================
    // 4. Nom sécurisé du fichier ZIP
    // ============================================================
    const safeName = (dossier.nom || `dossier_${dossier.id}`)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._\-\s]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/^[-_.]+|[-_.]+$/g, "")
      .trim();

    const zipName = `${safeName}.zip`;

    // ============================================================
    // 5. Headers HTTP
    // ============================================================
    res.setHeader("Content-Type", "application/zip");

    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(zipName)}"`,
    );

    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // ============================================================
    // 6. Création du ZIP
    // ============================================================
    const archive = archiver("zip", {
      zlib: {
        level: 9,
      },
    });

    archive.on("error", (err) => {
      console.error("Erreur archiver ZIP :", err);

      if (!res.headersSent) {
        res.status(500).json({
          error: "Erreur export",
        });
      }
    });

    archive.pipe(res);

    // ============================================================
    // 7. Métadonnées du dossier
    // ============================================================
    const meta = {
      nom: dossier.nom,

      n_compte: dossier.n_compte,
      n_be: dossier.n_be,
      n_ord: dossier.n_ord,
      n_soa: dossier.n_soa,
      exo_budgetaire: dossier.exo_budgetaire,

      compte_pc: dossier.compte_pc,
      date_fin_dossier: dossier.date_fin_dossier,
      ref_ecriture: dossier.ref_ecriture,

      statut: dossier.statut,
      validation: dossier.validation,
      rejet: dossier.rejet,

      id_dispatch: dossier.id_dispatch,
      id_verificateur: dossier.id_verificateur,
      id_validateur: dossier.id_validateur,
      id_archiveur: dossier.id_archiveur,

      commentaire_actuel: dossier.commentaire,

      created_at: dossier.created_at,
      updated_at: dossier.updated_at,

      traitements: traitements.rows.map((t) => ({
        type: t.type_traitement,
        statut: t.statut,
        commentaire: t.commentaire,

        auteur: `${t.prenoms} ${t.nom}`.trim(),

        email: t.email,

        date: t.date_traitement,
      })),
    };

    const commentairePdf = new PDFDocument({
      margin: 50,
      size: "A4",
    });

    const commentaireChunks = [];

    commentairePdf.on("data", (chunk) => {
      commentaireChunks.push(chunk);
    });

    const commentairePdfPromise = new Promise((resolve, reject) => {
      commentairePdf.on("end", () => {
        resolve(Buffer.concat(commentaireChunks));
      });

      commentairePdf.on("error", reject);
    });

    commentairePdf.fontSize(18).text("Historique du dossier", {
      align: "center",
    });

    commentairePdf.moveDown();

    commentairePdf.fontSize(11).text(`Dossier : ${dossier.nom || "-"}`);

    commentairePdf.text(`N° compte : ${dossier.n_compte || "-"}`);

    commentairePdf.text(`N° BE : ${dossier.n_be || "-"}`);

    commentairePdf.text(`N° ORD : ${dossier.n_ord || "-"}`);

    commentairePdf.text(`N° SOA : ${dossier.n_soa || "-"}`);

    commentairePdf.text(`Exercice : ${dossier.exo_budgetaire || "-"}`);

    commentairePdf.moveDown();

    commentairePdf.text(`Compte PC : ${dossier.compte_pc || "-"}`);

    commentairePdf.text(
      `Date fin du dossier : ${dossier.date_fin_dossier || "-"}`,
    );

    commentairePdf.text(
      `Référence d'écriture : ${dossier.ref_ecriture || "-"}`,
    );

    commentairePdf.moveDown();

    commentairePdf.fontSize(14).text("Commentaires et historique");

    commentairePdf.moveDown();

    for (const t of traitements.rows) {
      const auteur = `${t.prenoms || ""} ${t.nom || ""}`.trim();

      const date =
        t.date_traitement?.toISOString?.() || t.date_traitement || "";

      commentairePdf
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(`${date} — ${t.type_traitement || ""}`);

      commentairePdf.font("Helvetica").text(`Auteur : ${auteur || "-"}`);

      commentairePdf.text(`Commentaire : ${t.commentaire || "-"}`);

      commentairePdf.moveDown();
    }

    commentairePdf.end();

    const commentairePdfBuffer = await commentairePdfPromise;

    archive.append(commentairePdfBuffer, {
      name: "commentaire.pdf",
    });

    // ============================================================
    // 9. Ajouter commentaires.txt
    // ============================================================
    const historiqueTexte = traitements.rows.map((t) => {
      const date =
        t.date_traitement?.toISOString?.() || t.date_traitement || "";

      const auteur = `${t.prenoms || ""} ${t.nom || ""}`.trim();

      return (
        `[${date}] ` +
        `${t.type_traitement} — ` +
        `${auteur}\n` +
        `${t.commentaire || ""}\n`
      );
    });

    // ============================================================
    // 10. Ajouter le fichier original
    // ============================================================
    if (dossier.fichier_original) {
      const filePath = path.join(uploadDir, dossier.fichier_original);

      if (fs.existsSync(filePath)) {
        archive.file(filePath, {
          name: `fichier/${dossier.fichier_original}`,
        });
      } else {
        console.warn(`Fichier du dossier introuvable : ${filePath}`);
      }
    }

    // ============================================================
    // 11. Finalisation
    // ============================================================
    await archive.finalize();
  } catch (err) {
    console.error("Erreur exportDossier :", err);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Erreur exportation",
      });
    }
  }
}

async function previewFile(req, res) {
  try {
    const dossier = await getDossierOr404(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        error: "Dossier introuvable",
      });
    }

    if (!canSeeDossier(req.user, dossier)) {
      return res.status(403).json({
        error: "Accès refusé",
      });
    }

    if (!dossier.fichier_original) {
      return res.status(404).json({
        error: "Aucun fichier",
      });
    }

    const filePath = path.join(uploadDir, dossier.fichier_original);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: "Fichier introuvable sur le serveur",
      });
    }

    const ext = path.extname(dossier.fichier_original).toLowerCase();

    const mimeTypes = {
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".txt": "text/plain; charset=utf-8",
    };

    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");

    res.setHeader(
      "Content-Disposition",
      `inline; filename="${dossier.fichier_original}"`,
    );

    // Empêcher le navigateur / proxy de mettre le fichier en cache
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    return res.sendFile(filePath, {
      etag: false,
      lastModified: false,
      cacheControl: false,
    });
  } catch (err) {
    console.error("Erreur previewFile :", err);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Erreur prévisualisation",
      });
    }
  }
}

async function downloadFile(req, res) {
  try {
    // ============================================================
    // 1. Récupération du dossier
    // ============================================================
    const dossier = await getDossierOr404(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        error: "Dossier introuvable",
      });
    }

    // ============================================================
    // 2. Vérification des droits
    // ============================================================
    if (!canSeeDossier(req.user, dossier)) {
      return res.status(403).json({
        error: "Accès refusé",
      });
    }

    // ============================================================
    // 3. Vérification du fichier
    // ============================================================
    if (!dossier.fichier_original) {
      return res.status(404).json({
        error: "Aucun fichier",
      });
    }

    const filePath = path.join(uploadDir, dossier.fichier_original);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: "Fichier introuvable sur le serveur",
      });
    }

    // ============================================================
    // 4. Déterminer le type MIME
    // ============================================================
    const ext = path.extname(dossier.fichier_original).toLowerCase();

    const mimeTypes = {
      ".pdf": "application/pdf",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".txt": "text/plain; charset=utf-8",
      ".doc": "application/msword",
      ".docx":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ".xls": "application/vnd.ms-excel",
      ".xlsx":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".zip": "application/zip",
    };

    res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");

    // Forcer le téléchargement
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(dossier.fichier_original)}"`,
    );

    // Empêcher le cache
    res.setHeader(
      "Cache-Control",
      "no-store, no-cache, must-revalidate, proxy-revalidate",
    );

    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");

    // Désactiver les réponses 304/ETag
    return res.sendFile(filePath, {
      etag: false,
      lastModified: false,
      cacheControl: false,
    });
  } catch (err) {
    console.error("Erreur téléchargement :", err);

    if (!res.headersSent) {
      res.status(500).json({
        error: "Erreur téléchargement",
      });
    }
  }
}

module.exports = {
  list,
  getOne,
  create,
  comment,
  sendToValidateur,
  decide,
  adminAction,
  returnToDispatch,
  reuploadVersion,
  exportDossier,
  downloadFile,
  archiveDossier,
  previewFile,
};
