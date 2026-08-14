const fs = require("fs");
const path = require("path");
const archiver = require("archiver");
const db = require("../config/db");
const {
  createNotification,
  notifyMentions,
  audit,
} = require("../services/helpers");
const { uploadDir } = require("../middleware/upload");

const DOSSIER_SELECT = `
  SELECT d.*,
    ud.nom AS dispatch_nom, ud.prenoms AS dispatch_prenoms, ud.email AS dispatch_email,
    uv.nom AS verificateur_nom, uv.prenoms AS verificateur_prenoms, uv.email AS verificateur_email,
    uval.nom AS validateur_nom, uval.prenoms AS validateur_prenoms, uval.email AS validateur_email
  FROM dossier d
  LEFT JOIN utilisateur ud ON ud.id = d.id_dispatch
  LEFT JOIN utilisateur uv ON uv.id = d.id_verificateur
  LEFT JOIN utilisateur uval ON uval.id = d.id_validateur
`;

async function getDossierOr404(id) {
  const { rows } = await db.query(`${DOSSIER_SELECT} WHERE d.id = $1`, [id]);
  return rows[0] || null;
}

function canSeeDossier(user, dossier) {
  if (user.role === "Admin") return true;
  if (user.role === "Dispatch" && dossier.id_dispatch === user.id) return true;
  if (user.role === "Verificateur" && dossier.id_verificateur === user.id)
    return true;
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
    if (!["Dispatch", "Admin"].includes(req.user.role)) {
      return res
        .status(403)
        .json({ error: "Seul le Dispatch peut importer un dossier" });
    }

    const {
      nom,
      n_compte,
      n_be,
      n_soa,
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
     exo_budgetaire,
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
     $7,
     'EN_VERIFICATION',
     $8,
     $9
   )
   RETURNING *`,
      [
        nom,
        n_compte || null,
        n_be || null,
        n_soa || null,
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
    if (!["Verificateur", "Admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Action réservée au vérificateur" });
    }

    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (req.user.role !== "Admin" && dossier.id_verificateur !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Ce dossier ne vous est pas assigné" });
    }
    if (
      !["EN_VERIFICATION", "RETOUR_DISPATCH"].includes(dossier.statut) &&
      req.user.role !== "Admin"
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
    if (!["Validateur", "Admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Action réservée au validateur" });
    }

    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (req.user.role !== "Admin" && dossier.id_validateur !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Ce dossier ne vous est pas assigné" });
    }

    const { action, commentaire } = req.body;
    if (!["valider", "rejeter"].includes(action)) {
      return res
        .status(400)
        .json({ error: "action doit être valider ou rejeter" });
    }
    if (!commentaire?.trim()) {
      return res.status(400).json({ error: "Un commentaire est requis" });
    }

    const isValide = action === "valider";
    const statut = isValide ? "VALIDE" : "REJETE";
    const typeTraitement = isValide ? "VALIDATION" : "REJET";

    await db.query(
      `UPDATE dossier SET
         commentaire = $1,
         statut = $2,
         validation = $3,
         rejet = $4,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $5`,
      [commentaire, statut, isValide, !isValide, dossier.id],
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

    // Archivage automatique si validé
    if (isValide) {
      await db.query(
        `INSERT INTO archive (id_dossier, archive_par, motif)
         VALUES ($1, $2, $3)
         ON CONFLICT (id_dossier) DO NOTHING`,
        [dossier.id, req.user.id, commentaire],
      );
      await db.query(
        `UPDATE dossier SET statut = 'ARCHIVE', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [dossier.id],
      );
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
    if (req.user.role !== "Admin") {
      return res.status(403).json({ error: "Réservé à l'admin" });
    }

    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });

    const { action, commentaire, id_verificateur, id_validateur } = req.body;
    if (!commentaire?.trim()) {
      return res.status(400).json({ error: "Commentaire requis" });
    }

    if (action === "verifier") {
      const verifId = id_verificateur || dossier.id_verificateur;
      await db.query(
        `UPDATE dossier SET commentaire = $1, statut = 'EN_VERIFICATION',
           id_verificateur = COALESCE($2, id_verificateur), updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [commentaire, verifId, dossier.id],
      );
      await db.query(
        `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
         VALUES ($1, $2, 'VERIFICATION', $3, 'EN_VERIFICATION')`,
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
      return res
        .status(400)
        .json({ error: "action invalide (verifier|valider|rejeter)" });
    }

    await notifyMentions(commentaire, dossier.id, req.user);
    res.json(await getDossierOr404(dossier.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur action admin" });
  }
}

async function returnToDispatch(req, res) {
  try {
    if (!["Validateur", "Verificateur", "Admin"].includes(req.user.role)) {
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

async function exportDossier(req, res) {
  try {
    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (!canSeeDossier(req.user, dossier)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const traitements = await db.query(
      `SELECT t.*, u.nom, u.prenoms, u.email
       FROM traitement t
       JOIN utilisateur u ON u.id = t.id_users
       WHERE t.id_dossier = $1
       ORDER BY t.date_traitement ASC`,
      [dossier.id],
    );

    const safeName = (dossier.nom || `dossier_${dossier.id}`).replace(
      /[^a-zA-Z0-9._\-\s]/g,
      "_",
    );
    const zipName = `${safeName}.zip`;

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(zipName)}"`,
    );

    const archive = archiver("zip", { zlib: { level: 9 } });
    archive.on("error", (err) => {
      console.error(err);
      if (!res.headersSent) res.status(500).json({ error: "Erreur export" });
    });
    archive.pipe(res);

    const meta = {
      nom: dossier.nom,
      n_compte: dossier.n_compte,
      n_be: dossier.n_be,
      n_soa: dossier.n_soa,
      exo_budgetaire: dossier.exo_budgetaire,
      statut: dossier.statut,
      validation: dossier.validation,
      rejet: dossier.rejet,
      commentaire_actuel: dossier.commentaire,
      created_at: dossier.created_at,
      updated_at: dossier.updated_at,
      traitements: traitements.rows.map((t) => ({
        type: t.type_traitement,
        statut: t.statut,
        commentaire: t.commentaire,
        auteur: `${t.prenoms} ${t.nom}`,
        email: t.email,
        date: t.date_traitement,
      })),
    };

    archive.append(JSON.stringify(meta, null, 2), {
      name: "commentaires.json",
    });
    archive.append(
      [
        `Dossier: ${dossier.nom}`,
        `Statut: ${dossier.statut}`,
        `N° compte: ${dossier.n_compte || "-"}`,
        `N° BE: ${dossier.n_be || "-"}`,
        `N° SOA: ${dossier.n_soa || "-"}`,
        `Exercice: ${dossier.exo_budgetaire || "-"}`,
        "",
        "=== HISTORIQUE DES COMMENTAIRES ===",
        ...traitements.rows.map(
          (t) =>
            `[${t.date_traitement?.toISOString?.() || t.date_traitement}] ${t.type_traitement} — ${t.prenoms} ${t.nom}\n${t.commentaire || ""}\n`,
        ),
      ].join("\n"),
      { name: "commentaires.txt" },
    );

    if (dossier.fichier_original) {
      const filePath = path.join(uploadDir, dossier.fichier_original);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: `fichier/${dossier.fichier_original}` });
      }
    }

    await archive.finalize();
  } catch (err) {
    console.error(err);
    if (!res.headersSent) res.status(500).json({ error: "Erreur exportation" });
  }
}

async function downloadFile(req, res) {
  try {
    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (!canSeeDossier(req.user, dossier)) {
      return res.status(403).json({ error: "Accès refusé" });
    }
    if (!dossier.fichier_original) {
      return res.status(404).json({ error: "Aucun fichier" });
    }
    const filePath = path.join(uploadDir, dossier.fichier_original);
    if (!fs.existsSync(filePath)) {
      return res
        .status(404)
        .json({ error: "Fichier introuvable sur le serveur" });
    }
    res.download(filePath, dossier.fichier_original);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur téléchargement" });
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
  exportDossier,
  downloadFile,
};
