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
  emitToUser,
  emitToAdmins,
} = require("../services/helpers");
const {
  getDeadlineRemaining,
  formatRemaining,
} = require("../services/deadline");
const {
  findRetourDispatchDuplicate,
  notifyAllAdmins,
  isUserOnConge,
  saveCurrentVersionToHistory,
  getDossierVersions,
  getPreviousVersion,
  clearVersionHistory,
  markAdminModified,
  hasActiveDossier,
  startNextQueuedTimer,
  checkFifoOrder,
} = require("../services/dossierWorkflow");
const { uploadDir } = require("../middleware/upload");

const DOSSIER_SELECT = `
  SELECT
    d.*,

    a.archivage_rapide,

    ud.nom AS dispatch_nom,
    ud.prenoms AS dispatch_prenoms,
    ud.email AS dispatch_email,

    uv.nom AS verificateur_nom,
    uv.prenoms AS verificateur_prenoms,
    uv.email AS verificateur_email,

    uval.nom AS validateur_nom,
    uval.prenoms AS validateur_prenoms,
    uval.email AS validateur_email,

    uar.nom AS archiveur_nom,
    uar.prenoms AS archiveur_prenoms,
    uar.email AS archiveur_email,
    uar.im AS archiveur_im,

    dl.nom AS dossier_lie_nom,
    dl.statut AS dossier_lie_statut,
    dl.fichier_original AS dossier_lie_fichier,
    dl.id AS dossier_lie_id_ref

  FROM dossier d

  LEFT JOIN archive a
    ON a.id_dossier = d.id

  LEFT JOIN utilisateur ud
    ON ud.id = d.id_dispatch

  LEFT JOIN utilisateur uv
    ON uv.id = d.id_verificateur

  LEFT JOIN utilisateur uval
    ON uval.id = d.id_validateur

  LEFT JOIN utilisateur uar
    ON uar.id = d.id_archiveur

  LEFT JOIN dossier dl
    ON dl.id = d.dossier_lie_id
`;

async function getDossierOr404(id) {
  const { rows } = await db.query(`${DOSSIER_SELECT} WHERE d.id = $1`, [id]);
  return rows[0] || null;
}

async function enrichDossierWithDeadline(dossier, userId, userRole) {
  if (!dossier) return dossier;

  let congeDebut = null;
  let congeFin = null;

  if (userId) {
    const { rows } = await db.query(
      `SELECT conge_debut, conge_fin FROM utilisateur WHERE id = $1`,
      [userId],
    );
    congeDebut = rows[0]?.conge_debut;
    congeFin = rows[0]?.conge_fin;
  }

  const enriched = { ...dossier };

  if (
    dossier.statut === "EN_VERIFICATION" &&
    (dossier.id_verificateur === userId || ["Admin", "super_admin"].includes(userRole))
  ) {
    const { remaining, isPaused, waiting } = await getDeadlineRemaining(
      dossier,
      "verification",
      congeDebut,
      congeFin,
    );
    enriched.deadline_remaining_sec = remaining;
    enriched.deadline_remaining_label = waiting
      ? "En attente (file FIFO)"
      : formatRemaining(remaining, isPaused);
    enriched.deadline_is_paused = isPaused;
    enriched.deadline_waiting = !!waiting;
  }

  if (
    dossier.statut === "EN_VALIDATION" &&
    (dossier.id_validateur === userId || ["Admin", "super_admin"].includes(userRole))
  ) {
    const { remaining, isPaused, waiting } = await getDeadlineRemaining(
      dossier,
      "validation",
      congeDebut,
      congeFin,
    );
    enriched.deadline_remaining_sec = remaining;
    enriched.deadline_remaining_label = waiting
      ? "En attente (file FIFO)"
      : formatRemaining(remaining, isPaused);
    enriched.deadline_is_paused = isPaused;
    enriched.deadline_waiting = !!waiting;
  }

  return enriched;
}

function canSeeDossier(user, dossier) {
  // ============================================================
  // 1. ADMIN / SUPER ADMIN
  // ============================================================
  if (["Admin", "super_admin"].includes(user.role)) {
    return true;
  }

  // ============================================================
  // 2. DOSSIERS ARCHIVÉS
  // ============================================================
  // Tous les utilisateurs authentifiés peuvent consulter
  // le détail d'un dossier depuis les archives.
  //
  // Cela inclut également les dossiers créés par
  // "Archivage Rapide".
  // ============================================================
  if (dossier.statut === "ARCHIVE") {
    return true;
  }

  // ============================================================
  // 3. DISPATCH
  // ============================================================
  if (user.role === "Dispatch" && dossier.id_dispatch === user.id) {
    return true;
  }

  // ============================================================
  // 4. VERIFICATEUR
  // ============================================================
  if (user.role === "Verificateur" && dossier.id_verificateur === user.id) {
    return true;
  }

  // ============================================================
  // 5. I_ARCHIVE
  // ============================================================
  if (
    user.role === "i_archive" &&
    dossier.statut === "VALIDE" &&
    dossier.id_archiveur === user.id
  ) {
    return true;
  }

  // ============================================================
  // 6. VALIDATEUR
  // ============================================================
  if (user.role === "Validateur" && dossier.id_validateur === user.id) {
    return true;
  }

  // ============================================================
  // 7. DISPATCH : dossiers retournés / validés
  // ============================================================
  if (
    user.role === "Dispatch" &&
    ["RETOUR_DISPATCH", "VALIDE", "REJETE"].includes(dossier.statut)
  ) {
    return dossier.id_dispatch === user.id;
  }

  return false;
}

async function list(req, res) {
  try {
    const { statut, q } = req.query;
    const params = [];
    let where = "WHERE d.statut <> 'ARCHIVE'";
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
    } else if (["Admin", "super_admin"].includes(req.user.role)) {
      // Les admins voient tous les dossiers non archivés
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

    let orderBy = "ORDER BY d.updated_at DESC";
    if (req.user.role === "Verificateur") {
      orderBy =
        "ORDER BY d.assigned_verification_at ASC NULLS LAST, d.updated_at ASC";
    } else if (req.user.role === "Validateur") {
      orderBy =
        "ORDER BY d.assigned_validation_at ASC NULLS LAST, d.updated_at ASC";
    } else if (["Admin", "super_admin"].includes(req.user.role)) {
      orderBy =
        "ORDER BY CASE WHEN d.statut = 'EN_ATTENTE_VERIFICATEUR' THEN 0 ELSE 1 END, d.updated_at DESC";
    }

    const { rows } = await db.query(
      `${DOSSIER_SELECT} ${where} ${orderBy}`,
      params,
    );

    const enriched = await Promise.all(
      rows.map((d) =>
        enrichDossierWithDeadline(d, req.user.id, req.user.role),
      ),
    );
    res.json(enriched);
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

    const versions = await getDossierVersions(dossier.id);
    const previousVersion = dossier.comparaison_active
      ? await getPreviousVersion(dossier.id, dossier.version)
      : null;

    const enriched = await enrichDossierWithDeadline(
      dossier,
      req.user.id,
      req.user.role,
    );

    // ================================================================
    // Charger le dossier lié (ancien ou nouveau)
    // ================================================================
    let dossier_lie = null;
    if (dossier.dossier_lie_id_ref) {
      dossier_lie = await getDossierOr404(dossier.dossier_lie_id_ref);
      if (dossier_lie) {
        dossier_lie = await enrichDossierWithDeadline(
          dossier_lie,
          req.user.id,
          req.user.role,
        );
      }
    }

    res.json({
      ...enriched,
      traitements: traitements.rows,
      versions,
      previous_version: previousVersion,
      dossier_lie,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération du dossier" });
  }
}

async function checkDuplicate(req, res) {
  try {
    const { n_compte, n_be, n_soa, n_ord, exo_budgetaire } = req.query;
    const duplicate = await findRetourDispatchDuplicate({
      n_compte,
      n_be,
      n_soa,
      n_ord,
      exo_budgetaire,
    });

    if (!duplicate) {
      return res.json({ duplicate: false });
    }

    res.json({
      duplicate: true,
      dossier: {
        id: duplicate.id,
        nom: duplicate.nom,
        statut: duplicate.statut,
        version: duplicate.version,
        verificateur_nom: duplicate.id_verificateur,
        validateur_nom: duplicate.id_validateur,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur vérification doublon" });
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
      force_new,
    } = req.body;

    if (!nom)
      return res.status(400).json({ error: "Le nom du dossier est requis" });
    if (!req.file)
      return res
        .status(400)
        .json({ error: "Le fichier du dossier est requis" });

    // Vérifier doublon RETOUR_DISPATCH
    if (force_new !== "true" && force_new !== true) {
      const duplicate = await findRetourDispatchDuplicate({
        n_compte,
        n_be,
        n_soa,
        n_ord,
        exo_budgetaire,
      });

      if (duplicate) {
        return res.status(409).json({
          code: "DUPLICATE_ACTIVE",
          error:
            "Un dossier identique existe déjà avec le statut " + duplicate.statut + ".",
          existing_dossier_id: duplicate.id,
          existing_dossier: duplicate,
        });
      }
    }

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

    if (fs.existsSync(finalFilePath)) {
      return res.status(409).json({
        error: `Un fichier nommé "${finalFileName}" existe déjà.`,
      });
    }

    await fs.promises.rename(tempFilePath, finalFilePath);

    const { rows } = await db.query(
      `INSERT INTO dossier (
     nom, n_compte, n_be, n_soa, n_ord, exo_budgetaire,
     compte_pc, date_fin_dossier, ref_ecriture,
     commentaire, fichier_original, statut, id_dispatch
   )
   VALUES ($1, $2, $3, $4, $5, $6, NULL, NULL, NULL, $7, $8, 'EN_ATTENTE_VERIFICATEUR', $9)
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
      ],
    );

    const dossier = rows[0];

    await db.query(
      `INSERT INTO dossier_version (id_dossier, version, fichier_original, est_actuelle)
       VALUES ($1, 1, $2, TRUE)
       ON CONFLICT (id_dossier, version) DO NOTHING`,
      [dossier.id, finalFileName],
    );

    await db.query(
      `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
       VALUES ($1, $2, 'DISPATCH', $3, 'EN_ATTENTE_VERIFICATEUR')`,
      [
        req.user.id,
        dossier.id,
        commentaire || "Dossier importé — en attente d'assignation vérificateur",
      ],
    );

    await notifyAllAdmins({
      id_dossier: dossier.id,
      message: `Nouveau dossier « ${nom} » à assigner (envoyé par ${req.user.prenoms} ${req.user.nom})`,
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

    // WebSocket : notifier les admins du nouveau dossier
    const newDossier = await getDossierOr404(dossier.id);
    emitToAdmins("dossier:new", { dossier: newDossier });

    res.status(201).json(newDossier);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur création du dossier" });
  }
}

async function confirmReimport(req, res) {
  let tempFilePath = null;
  let finalFilePath = null;

  try {
    if (!["Dispatch", "Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (dossier.statut !== "RETOUR_DISPATCH") {
      return res.status(400).json({
        error: "Seul un dossier en retour dispatch peut être réimporté ainsi.",
      });
    }
    if (!req.file) {
      return res.status(400).json({ error: "Le fichier est requis" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // ================================================================
      // 1. Créer un NOUVEAU dossier (ne pas modifier l'ancien)
      // ================================================================
      const newVersion = 2;
      const extension = path.extname(req.file.originalname).toLowerCase();
      const baseName = (dossier.nom || `dossier_${dossier.id}`)
        .replace(/\(\d+\)$/, "");
      const versionedName = `${baseName}(2)`;
      const finalFileName = `${versionedName}${extension}`;

      tempFilePath = path.join(uploadDir, req.file.filename);
      finalFilePath = path.join(uploadDir, finalFileName);

      if (fs.existsSync(finalFilePath)) {
        await client.query("ROLLBACK");
        return res.status(409).json({
          error: `Le fichier "${finalFileName}" existe déjà.`,
        });
      }

      await fs.promises.rename(tempFilePath, finalFilePath);
      tempFilePath = null;

      // Insérer le nouveau dossier lié à l'ancien
      // Garder l'ancien commentaire et tous les acteurs
      const { rows: newDossierRows } = await client.query(
        `INSERT INTO dossier (
           nom, n_compte, n_be, n_soa, n_ord, exo_budgetaire,
           commentaire, fichier_original, statut,
           id_dispatch, id_verificateur, id_validateur, dossier_lie_id,
           version, comparaison_active,
           assigned_verification_at,
           deadline_verif_elapsed_sec, deadline_verif_paused_at
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'EN_VERIFICATION',
           $9, $10, $11, $12, $13, TRUE,
           CURRENT_TIMESTAMP, 0, NULL)
         RETURNING *`,
        [
          versionedName,
          dossier.n_compte,
          dossier.n_be,
          dossier.n_soa,
          dossier.n_ord,
          dossier.exo_budgetaire,
          dossier.commentaire || null,
          finalFileName,
          req.user.id,
          dossier.id_verificateur,
          dossier.id_validateur,
          dossier.id,
          newVersion,
        ],
      );

      const newDossier = newDossierRows[0];

      // Version initiale du nouveau dossier
      await client.query(
        `INSERT INTO dossier_version (id_dossier, version, fichier_original, est_actuelle)
         VALUES ($1, 1, $2, FALSE)
         ON CONFLICT (id_dossier, version) DO NOTHING`,
        [newDossier.id, dossier.fichier_original],
      );

      await client.query(
        `INSERT INTO dossier_version (id_dossier, version, fichier_original, est_actuelle)
         VALUES ($1, $2, $3, TRUE)
         ON CONFLICT (id_dossier, version) DO UPDATE SET fichier_original = EXCLUDED.fichier_original, est_actuelle = TRUE`,
        [newDossier.id, newVersion, finalFileName],
      );

      // Historique traitement du nouveau dossier — garder l'ancien commentaire
      await client.query(
        `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
         VALUES ($1, $2, 'DISPATCH', $3, 'EN_VERIFICATION')`,
        [
          req.user.id,
          newDossier.id,
          dossier.commentaire || `Réimport du dossier « ${dossier.nom} »`,
        ],
      );

      // Lien depuis l'ancien vers le nouveau (dossier_lie_id)
      // On ne modifie PAS le statut de l'ancien dossier
      await client.query(
        `UPDATE dossier SET dossier_lie_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [newDossier.id, dossier.id],
      );

      await client.query("COMMIT");

      // Notification au vérificateur du nouveau dossier
      if (newDossier.id_verificateur) {
        await createNotification({
          id_user: newDossier.id_verificateur,
          id_dossier: newDossier.id,
          message: `Nouveau dossier « ${versionedName} » à vérifier (comparaison avec « ${dossier.nom} »)`,
          type: "VERIFICATION",
        });
      }

      // Notification au dispatch
      await createNotification({
        id_user: req.user.id,
        id_dossier: newDossier.id,
        message: `Nouveau dossier « ${versionedName} » créé — ancien dossier « ${dossier.nom} » conservé`,
        type: "DOSSIER",
      });

      // Retourner les deux dossiers liés
      const enrichedNew = await getDossierOr404(newDossier.id);
      const enrichedOld = await getDossierOr404(dossier.id);
      res.json({
        new_dossier: enrichedNew,
        old_dossier: enrichedOld,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.promises.unlink(tempFilePath).catch(() => {});
    }
    res.status(500).json({ error: "Erreur réimport du dossier" });
  }
}

async function assignVerificateur(req, res) {
  try {
    if (!["Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Réservé à l'administrateur" });
    }

    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (dossier.statut !== "EN_ATTENTE_VERIFICATEUR") {
      return res.status(400).json({
        error: "Ce dossier n'est pas en attente d'assignation vérificateur.",
      });
    }

    const { id_verificateur } = req.body;
    if (!id_verificateur) {
      return res.status(400).json({ error: "Un vérificateur doit être désigné" });
    }

    if (await isUserOnConge(id_verificateur)) {
      return res.status(400).json({
        error: "Ce vérificateur est en congé et ne peut pas recevoir de dossier.",
      });
    }

    const verif = await db.query(
      `SELECT u.id, r.nom AS role FROM utilisateur u
       JOIN roles r ON r.id = u.id_roles WHERE u.id = $1`,
      [id_verificateur],
    );
    if (
      !verif.rows[0] ||
      !["Verificateur", "Admin"].includes(verif.rows[0].role)
    ) {
      return res.status(400).json({ error: "Utilisateur vérificateur invalide" });
    }

    // FIFO : vérifier si le vérificateur a déjà un dossier actif
    const activeDossier = await hasActiveDossier(id_verificateur, "Verificateur");
    const timerIsActive = !activeDossier;

    await db.query(
      `UPDATE dossier SET
         id_verificateur = $1,
         statut = 'EN_VERIFICATION',
         assigned_verification_at = ${timerIsActive ? 'CURRENT_TIMESTAMP' : 'NULL'},
         deadline_verif_elapsed_sec = 0,
         deadline_verif_paused_at = NULL,
         updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [id_verificateur, dossier.id],
    );

    await db.query(
      `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
       VALUES ($1, $2, 'VERIFICATION', $3, 'EN_VERIFICATION')`,
      [
        req.user.id,
        dossier.id,
        `Dossier assigné au vérificateur par ${req.user.prenoms} ${req.user.nom}`,
      ],
    );

    await createNotification({
      id_user: Number(id_verificateur),
      id_dossier: dossier.id,
      message: `Dossier « ${dossier.nom} » assigné pour vérification`,
      type: "VERIFICATION",
    });

    // WebSocket : notifier le vérificateur et les admins
    const updatedDossier = await getDossierOr404(dossier.id);
    emitToUser(Number(id_verificateur), "dossier:update", { dossier: updatedDossier });
    emitToAdmins("dossier:update", { dossier: updatedDossier });

    res.json(updatedDossier);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur assignation vérificateur" });
  }
}

async function comment(req, res) {
  try {
    const dossier = await getDossierOr404(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        error: "Dossier introuvable",
      });
    }

    // ------------------------------------------------------------
    // 1. Vérifier que l'utilisateur peut voir le dossier
    // ------------------------------------------------------------
    if (!canSeeDossier(req.user, dossier)) {
      return res.status(403).json({
        error: "Accès refusé",
      });
    }

    // ------------------------------------------------------------
    // 2. Vérifier qui a le droit de commenter selon le statut
    // ------------------------------------------------------------
    const role = req.user.role;

    let roleAutorise = false;

    switch (dossier.statut) {
      case "EN_VERIFICATION":
        roleAutorise =
          (role === "Verificateur" && dossier.id_verificateur === req.user.id) ||
          ["Admin", "super_admin"].includes(role);
        break;

      case "EN_VALIDATION":
        roleAutorise =
          (role === "Validateur" && dossier.id_validateur === req.user.id) ||
          ["Admin", "super_admin"].includes(role);
        break;

      case "RETOUR_DISPATCH":
        roleAutorise =
          role === "Dispatch" && dossier.id_dispatch === req.user.id;
        break;

      default:
        roleAutorise = ["Admin", "super_admin"].includes(role);
        break;
    }

    if (!roleAutorise) {
      return res.status(403).json({
        error:
          "Vous n'êtes pas autorisé à commenter ce dossier dans son statut actuel.",
      });
    }

    // ------------------------------------------------------------
    // 2b. Vérification FIFO stricte
    //     Le verificateur/validateur ne peut pas interagir
    //     tant qu'un dossier plus ancien n'est pas traité.
    // ------------------------------------------------------------
    if (["Verificateur", "Validateur"].includes(role) &&
        ["EN_VERIFICATION", "EN_VALIDATION"].includes(dossier.statut)) {
      const fifo = await checkFifoOrder(req.user.id, role, dossier.id);
      if (fifo.isBlocked) {
        return res.status(403).json({
          error: `Vous ne pouvez pas interagir avec ce dossier. Le dossier « ${fifo.blockingDossier.nom} » (#${fifo.blockingDossier.id}) doit être traité en premier (ordre FIFO).`,
          code: "FIFO_BLOCKED",
          blocking_dossier: fifo.blockingDossier,
        });
      }
    }

    // ------------------------------------------------------------
    // 3. Vérifier le commentaire
    // ------------------------------------------------------------
    const { commentaire } = req.body;

    if (!commentaire?.trim()) {
      return res.status(400).json({
        error: "Commentaire requis",
      });
    }

    const commentaireFinal = commentaire.trim();

    // ------------------------------------------------------------
    // 4. Mettre à jour le commentaire courant du dossier
    // ------------------------------------------------------------
    await db.query(
      `
        UPDATE dossier
        SET
          commentaire = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `,
      [commentaireFinal, dossier.id],
    );

    // ------------------------------------------------------------
    // 5. Déterminer le type de traitement
    // ------------------------------------------------------------
    let type = "VERIFICATION";

    if (role === "Validateur") {
      type = "VALIDATION";
    } else if (role === "Dispatch") {
      type = "DISPATCH";
    }

    // ------------------------------------------------------------
    // 6. Enregistrer le commentaire dans l'historique
    // ------------------------------------------------------------
    await db.query(
      `
        INSERT INTO traitement (
          id_users,
          id_dossier,
          type_traitement,
          commentaire,
          statut
        )
        VALUES ($1, $2, $3, $4, $5)
      `,
      [req.user.id, dossier.id, type, commentaireFinal, dossier.statut],
    );

    // ------------------------------------------------------------
    // 7. Notifications des mentions
    // ------------------------------------------------------------
    await notifyMentions(commentaireFinal, dossier.id, req.user);

    if (["Admin", "super_admin"].includes(role)) {
      await markAdminModified(dossier.id);
    }

    // ------------------------------------------------------------
    // 8. WebSocket : notifier les participants du dossier
    // ------------------------------------------------------------
    const updated = await getDossierOr404(dossier.id);
    if (dossier.id_verificateur) emitToUser(dossier.id_verificateur, "dossier:update", { dossier: updated });
    if (dossier.id_validateur) emitToUser(dossier.id_validateur, "dossier:update", { dossier: updated });
    if (dossier.id_dispatch) emitToUser(dossier.id_dispatch, "dossier:update", { dossier: updated });
    emitToAdmins("dossier:update", { dossier: updated });

    // ------------------------------------------------------------
    // 9. Retourner le dossier mis à jour
    // ------------------------------------------------------------
    res.json(updated);
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erreur commentaire",
    });
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

    // FIFO stricte : vérifier l'ordre
    if (!["Admin", "super_admin"].includes(req.user.role) &&
        dossier.statut === "EN_VERIFICATION") {
      const fifo = await checkFifoOrder(req.user.id, "Verificateur", dossier.id);
      if (fifo.isBlocked) {
        return res.status(403).json({
          error: `Vous ne pouvez pas envoyer ce dossier au validateur. Le dossier « ${fifo.blockingDossier.nom} » (#${fifo.blockingDossier.id}) doit être traité en premier (ordre FIFO).`,
          code: "FIFO_BLOCKED",
          blocking_dossier: fifo.blockingDossier,
        });
      }
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

    if (await isUserOnConge(id_validateur)) {
      return res.status(400).json({
        error: "Ce validateur est en congé et ne peut pas recevoir de dossier.",
      });
    }

    // FIFO : vérifier si le validateur a déjà un dossier actif
    const activeValDossier = await hasActiveDossier(id_validateur, "Validateur");
    const valTimerIsActive = !activeValDossier;

    await db.query(
      `UPDATE dossier SET
         id_validateur = $1,
         commentaire = COALESCE($2, commentaire),
         statut = 'EN_VALIDATION',
         assigned_validation_at = ${valTimerIsActive ? 'CURRENT_TIMESTAMP' : 'NULL'},
         deadline_valid_elapsed_sec = 0,
         deadline_valid_paused_at = NULL,
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

    // FIFO : démarrer le timer du dossier suivant en file d'attente
    if (dossier.id_verificateur) {
      const nextId = await startNextQueuedTimer(dossier.id_verificateur, "Verificateur");
      if (nextId) {
        const nextDossier = await getDossierOr404(nextId);
        emitToUser(Number(dossier.id_verificateur), "dossier:update", { dossier: nextDossier });
      }
    }

    // WebSocket : notifier le validateur
    const updatedDossier = await getDossierOr404(dossier.id);
    emitToUser(Number(id_validateur), "dossier:update", { dossier: updatedDossier });
    emitToAdmins("dossier:update", { dossier: updatedDossier });

    res.json(updatedDossier);
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

    // FIFO stricte : vérifier l'ordre pour le validateur
    if (!["Admin", "super_admin"].includes(req.user.role)) {
      const fifo = await checkFifoOrder(req.user.id, "Validateur", dossier.id);
      if (fifo.isBlocked) {
        return res.status(403).json({
          error: `Vous ne pouvez pas traiter ce dossier. Le dossier « ${fifo.blockingDossier.nom} » (#${fifo.blockingDossier.id}) doit être traité en premier (ordre FIFO).`,
          code: "FIFO_BLOCKED",
          blocking_dossier: fifo.blockingDossier,
        });
      }
    }

    const { action, commentaire, id_archiveur, ecraser } = req.body;
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

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      await client.query(
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

      if (ecraser === true || ecraser === "true") {
        await clearVersionHistory(client, dossier.id);
      }

      await client.query(
        `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
       VALUES ($1, $2, $3, $4, $5)`,
        [req.user.id, dossier.id, typeTraitement, commentaire, statut],
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

    // FIFO : démarrer le timer du dossier suivant en file d'attente
    if (dossier.id_validateur) {
      const nextValId = await startNextQueuedTimer(dossier.id_validateur, "Validateur");
      if (nextValId) {
        const nextValDossier = await getDossierOr404(nextValId);
        emitToUser(Number(dossier.id_validateur), "dossier:update", { dossier: nextValDossier });
      }
    }

    // WebSocket : notifier
    const decidedDossier = await getDossierOr404(dossier.id);
    if (dossier.id_dispatch) emitToUser(dossier.id_dispatch, "dossier:update", { dossier: decidedDossier });
    emitToAdmins("dossier:update", { dossier: decidedDossier });

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

    if (["Admin", "super_admin"].includes(req.user.role)) {
      await markAdminModified(dossier.id);
    }

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

    const { commentaire, ecraser } = req.body;
    if (!commentaire?.trim()) {
      return res.status(400).json({ error: "Commentaire requis" });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      await client.query(
        `UPDATE dossier SET commentaire = $1, statut = 'RETOUR_DISPATCH', updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
        [commentaire, dossier.id],
      );

      if (ecraser === true || ecraser === "true") {
        await clearVersionHistory(client, dossier.id);
      }

      await client.query(
        `INSERT INTO traitement (id_users, id_dossier, type_traitement, commentaire, statut)
       VALUES ($1, $2, 'RETOUR', $3, 'RETOUR_DISPATCH')`,
        [req.user.id, dossier.id, commentaire],
      );

      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }

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
    // ============================================================
    // 1. Vérification du rôle
    // ============================================================
    if (!["Dispatch", "Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({
        error:
          "Seul le Dispatch, l'Admin ou le super_admin peut importer une nouvelle version",
      });
    }

    // ============================================================
    // 2. Récupération du dossier
    // ============================================================
    const dossier = await getDossierOr404(req.params.id);

    if (!dossier) {
      return res.status(404).json({
        error: "Dossier introuvable",
      });
    }

    // ============================================================
    // 3. Vérification du propriétaire
    // ============================================================
    if (
      !["Admin", "super_admin"].includes(req.user.role) &&
      dossier.id_dispatch !== req.user.id
    ) {
      return res.status(403).json({
        error: "Ce dossier ne vous appartient pas",
      });
    }

    // ============================================================
    // 4. Vérification du statut
    // ============================================================
    if (dossier.statut !== "RETOUR_DISPATCH") {
      return res.status(400).json({
        error:
          "Une nouvelle version ne peut être importée que pour un dossier retourné au Dispatch",
      });
    }

    // ============================================================
    // 5. Vérification du fichier
    // ============================================================
    if (!req.file) {
      return res.status(400).json({
        error: "Le nouveau fichier est requis",
      });
    }

    tempFilePath = path.join(uploadDir, req.file.filename);

    // ============================================================
    // 6. Récupération des informations envoyées
    // ============================================================
    const { n_compte, n_be, n_soa, n_ord, exo_budgetaire, id_verificateur } =
      req.body;

    // ============================================================
    // 7. Vérification des champs obligatoires
    // ============================================================
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

    if (!n_ord?.trim()) {
      return res.status(400).json({
        error: "Le N° ORD est requis",
      });
    }

    if (!exo_budgetaire?.trim()) {
      return res.status(400).json({
        error: "L'exercice budgétaire est requis",
      });
    }

    // ============================================================
    // 8. Vérification du vérificateur
    // ============================================================
    const verifierId = id_verificateur || dossier.id_verificateur;

    if (!verifierId) {
      return res.status(400).json({
        error: "Un vérificateur doit être désigné",
      });
    }

    const verif = await db.query(
      `SELECT
         u.id,
         u.email,
         r.nom AS role
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

    // ============================================================
    // 9. Calcul de la nouvelle version
    // ============================================================
    const newVersion = Number(dossier.version || 1) + 1;

    // ============================================================
    // 10. Création du nom de fichier
    // ============================================================
    const baseName = [
      n_compte.trim(),
      n_be.trim(),
      n_soa.trim(),
      n_ord.trim(),
      exo_budgetaire.trim(),
    ]
      .join("-")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "_")
      .replace(/^[-_.]+|[-_.]+$/g, "")
      .trim();

    const versionedName = `${baseName}(${newVersion})`;

    // ============================================================
    // 11. Extension du fichier
    // ============================================================
    const extension = path.extname(req.file.originalname).toLowerCase();

    const finalFileName = `${versionedName}${extension}`;

    finalFilePath = path.join(uploadDir, finalFileName);

    // ============================================================
    // 12. Protection contre les doublons
    // ============================================================
    if (fs.existsSync(finalFilePath)) {
      return res.status(409).json({
        error: `Le fichier "${finalFileName}" existe déjà.`,
      });
    }

    // ============================================================
    // 13. Renommage du fichier temporaire
    // ============================================================
    await fs.promises.rename(tempFilePath, finalFilePath);

    tempFilePath = null;

    // ============================================================
    // 14. Mise à jour du dossier
    //
    // IMPORTANT :
    // Le commentaire n'est PAS modifié ici.
    // ============================================================
    const { rows } = await db.query(
      `
      UPDATE dossier
      SET
        nom = $1,
        n_compte = $2,
        n_be = $3,
        n_soa = $4,
        n_ord = $5,
        exo_budgetaire = $6,

        compte_pc = NULL,
        date_fin_dossier = NULL,
        ref_ecriture = NULL,

        fichier_original = $7,
        version = $8,
        id_verificateur = $9,

        statut = 'EN_VERIFICATION',
        validation = FALSE,
        rejet = FALSE,

        updated_at = CURRENT_TIMESTAMP

      WHERE id = $10

      RETURNING *
      `,
      [
        versionedName,
        n_compte.trim(),
        n_be.trim(),
        n_soa.trim(),
        n_ord.trim(),
        exo_budgetaire.trim(),
        finalFileName,
        newVersion,
        verifierId,
        dossier.id,
      ],
    );

    const updatedDossier = rows[0];

    // ============================================================
    // 15. Historique du traitement
    // ============================================================
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
        'DISPATCH',
        $3,
        'EN_VERIFICATION'
      )
      `,
      [
        req.user.id,
        updatedDossier.id,
        `Nouvelle version du dossier importée (version ${newVersion})`,
      ],
    );

    // ============================================================
    // 16. Notification du vérificateur
    // ============================================================
    await createNotification({
      id_user: Number(verifierId),
      id_dossier: updatedDossier.id,
      message: `Nouvelle version du dossier « ${versionedName} » à vérifier`,
      type: "VERIFICATION",
    });

    // ============================================================
    // 17. Audit
    // ============================================================
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

        ancien_n_ord: dossier.n_ord,
        nouveau_n_ord: n_ord.trim(),
      },
      ip_address: req.ip,
    });

    // ============================================================
    // 18. Retour
    // ============================================================
    res.json(await getDossierOr404(updatedDossier.id));
  } catch (err) {
    console.error("Erreur reuploadVersion :", err);

    // ============================================================
    // Nettoyage du fichier temporaire
    // ============================================================
    if (tempFilePath) {
      try {
        if (fs.existsSync(tempFilePath)) {
          await fs.promises.unlink(tempFilePath);
        }
      } catch (cleanupError) {
        console.error("Erreur nettoyage fichier temporaire :", cleanupError);
      }
    }

    // ============================================================
    // Nettoyage du fichier final
    // ============================================================
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
    // 3. Récupération de l'historique
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
    // 4. Nom sécurisé du ZIP
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

      version: dossier.version,

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

    // ============================================================
    // 9. Générer commentaire.pdf
    //
    // PDF = historique complet
    // ============================================================
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

    commentairePdf.fontSize(11);

    commentairePdf.text(`Dossier : ${dossier.nom || "-"}`);
    commentairePdf.text(`N° compte : ${dossier.n_compte || "-"}`);
    commentairePdf.text(`N° BE : ${dossier.n_be || "-"}`);
    commentairePdf.text(`N° ORD : ${dossier.n_ord || "-"}`);
    commentairePdf.text(`N° SOA : ${dossier.n_soa || "-"}`);
    commentairePdf.text(
      `Exercice budgétaire : ${dossier.exo_budgetaire || "-"}`,
    );

    commentairePdf.moveDown();

    commentairePdf.text(`Version : ${dossier.version || 1}`);

    if (dossier.admin_modifie) {
      commentairePdf
        .font("Helvetica-Bold")
        .fillColor("red")
        .text(
          "⚠ Modifié par un administrateur — les données peuvent différer de l'original.",
        );
      commentairePdf.fillColor("black").font("Helvetica");
    }

    commentairePdf.text(`Compte PC : ${dossier.compte_pc || "-"}`);

    commentairePdf.text(
      `Date fin du dossier : ${formatHumanDate(dossier.date_fin_dossier)}`,
    );

    commentairePdf.text(
      `Référence d'écriture : ${dossier.ref_ecriture || "-"}`,
    );

    commentairePdf.moveDown();

    commentairePdf.fontSize(14).text("Commentaires et historique");

    commentairePdf.moveDown();

    // ============================================================
    // Historique complet
    // ============================================================
    for (const t of traitements.rows) {
      const auteur = `${t.prenoms || ""} ${t.nom || ""}`.trim();

      const date = formatHumanDate(t.date_traitement);

      commentairePdf
        .fontSize(11)
        .font("Helvetica-Bold")
        .text(`${date} — ${t.type_traitement || ""}`);

      commentairePdf.font("Helvetica").text(`Auteur : ${auteur || "-"}`);

      commentairePdf.text(`Statut : ${t.statut || "-"}`);

      commentairePdf.text(`Commentaire : ${t.commentaire || "-"}`);

      commentairePdf.moveDown();
    }

    commentairePdf.end();

    const commentairePdfBuffer = await commentairePdfPromise;

    archive.append(commentairePdfBuffer, {
      name: "commentaire.pdf",
    });

    // ============================================================
    // 10. Générer commentaire_to_ordsec.pdf
    //
    // Ce PDF contient UNIQUEMENT :
    //
    // - N° compte
    // - N° BE
    // - N° SOA
    // - N° ORD
    // - Exercice budgétaire
    // - Dernier commentaire actuel
    // ============================================================
    const ordsecPdf = new PDFDocument({
      margin: 60,
      size: "A4",
    });

    const ordsecChunks = [];

    ordsecPdf.on("data", (chunk) => {
      ordsecChunks.push(chunk);
    });

    const ordsecPdfPromise = new Promise((resolve, reject) => {
      ordsecPdf.on("end", () => {
        resolve(Buffer.concat(ordsecChunks));
      });

      ordsecPdf.on("error", reject);
    });

    // ============================================================
    // En-tête
    // ============================================================
    ordsecPdf
      .font("Helvetica-Bold")
      .fontSize(18)
      .text("COMMENTAIRE À L'ORDSEC", {
        align: "center",
      });

    ordsecPdf.moveDown(1.5);

    // ============================================================
    // Informations du dossier
    // ============================================================
    ordsecPdf
      .font("Helvetica-Bold")
      .fontSize(12)
      .text("Informations du dossier");

    ordsecPdf.moveDown(0.5);

    ordsecPdf.font("Helvetica").fontSize(11);

    ordsecPdf.text(`Dossier : ${dossier.nom || "-"}`);

    ordsecPdf.text(`N° compte : ${dossier.n_compte || "-"}`);

    ordsecPdf.text(`N° BE : ${dossier.n_be || "-"}`);

    ordsecPdf.text(`N° SOA : ${dossier.n_soa || "-"}`);

    ordsecPdf.text(`N° ORD : ${dossier.n_ord || "-"}`);

    ordsecPdf.text(`Exercice budgétaire : ${dossier.exo_budgetaire || "-"}`);

    ordsecPdf.moveDown(1.5);

    // ============================================================
    // Dernier commentaire
    // ============================================================
    ordsecPdf.font("Helvetica-Bold").fontSize(13).text("Commentaire");

    ordsecPdf.moveDown(0.7);

    ordsecPdf
      .font("Helvetica")
      .fontSize(11)
      .text(
        dossier.commentaire?.trim()
          ? dossier.commentaire.trim()
          : "Aucun commentaire.",
        {
          align: "left",
          width: 470,
        },
      );

    ordsecPdf.moveDown(1.5);

    // ============================================================
    // Informations complémentaires
    // ============================================================
    ordsecPdf
      .font("Helvetica-Bold")
      .fontSize(10)
      .text(`Version du dossier : ${dossier.version || 1}`);

    ordsecPdf.moveDown(2);

    ordsecPdf.end();

    const ordsecPdfBuffer = await ordsecPdfPromise;

    // ============================================================
    // Ajout au ZIP
    // ============================================================
    archive.append(ordsecPdfBuffer, {
      name: "commentaire_to_ordsec.pdf",
    });

    // ============================================================
    // 11. Ajouter le fichier original
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
    // 12. Finalisation du ZIP
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

async function previewVersion(req, res) {
  try {
    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });
    if (!canSeeDossier(req.user, dossier)) {
      return res.status(403).json({ error: "Accès refusé" });
    }

    const versionNum = Number(req.params.version);
    const { rows } = await db.query(
      `SELECT fichier_original FROM dossier_version
       WHERE id_dossier = $1 AND version = $2`,
      [dossier.id, versionNum],
    );

    const fichier = rows[0]?.fichier_original;
    if (!fichier) {
      return res.status(404).json({ error: "Version introuvable" });
    }

    const filePath = path.join(uploadDir, fichier);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Fichier introuvable sur le serveur" });
    }

    const ext = path.extname(fichier).toLowerCase();
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
    res.setHeader("Content-Disposition", `inline; filename="${fichier}"`);
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    return res.sendFile(filePath, { etag: false, lastModified: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur prévisualisation version" });
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

function formatHumanDate(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

/**
 * Supprimer l'ancien dossier lié (réservé au Validateur).
 * Le validateur supprime l'ancien dossier après avoir validé le nouveau.
 */
async function deleteOldLinked(req, res) {
  try {
    if (!["Validateur", "Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Action réservée au validateur" });
    }

    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });

    if (!dossier.dossier_lie_id_ref) {
      return res.status(400).json({ error: "Ce dossier n'a pas de dossier lié." });
    }

    const oldDossierId = dossier.dossier_lie_id_ref;
    const oldDossier = await getDossierOr404(oldDossierId);
    if (!oldDossier) {
      return res.status(404).json({ error: "L'ancien dossier est introuvable." });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Supprimer les traitements de l'ancien dossier
      await client.query(`DELETE FROM traitement WHERE id_dossier = $1`, [oldDossierId]);

      // Supprimer les notifications liées
      await client.query(`DELETE FROM notification WHERE id_dossier = $1`, [oldDossierId]);

      // Supprimer les versions
      await client.query(`DELETE FROM dossier_version WHERE id_dossier = $1`, [oldDossierId]);

      // Supprimer le dossier lui-même
      await client.query(`DELETE FROM dossier WHERE id = $1`, [oldDossierId]);

      // Retirer le lien du nouveau dossier
      await client.query(
        `UPDATE dossier SET dossier_lie_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [dossier.id],
      );

      await client.query("COMMIT");

      await audit({
        id_user: req.user.id,
        action: "DELETE_OLD_LINKED_DOSSIER",
        table_name: "dossier",
        record_id: oldDossierId,
        details: { ancien_nom: oldDossier.nom, nouveau_dossier_id: dossier.id },
        ip_address: req.ip,
      });

      res.json({
        message: `Ancien dossier « ${oldDossier.nom} » supprimé.`,
        deleted_id: oldDossierId,
      });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur suppression ancien dossier" });
  }
}

async function deleteDossier(req, res) {
  try {
    if (!["Admin", "super_admin"].includes(req.user.role)) {
      return res.status(403).json({ error: "Réservé à l'Admin ou au super_admin" });
    }

    const dossier = await getDossierOr404(req.params.id);
    if (!dossier) return res.status(404).json({ error: "Dossier introuvable" });

    // Seuls les dossiers REJETE peuvent être supprimés
    if (dossier.statut !== "REJETE") {
      return res.status(400).json({ error: "Seul un dossier rejeté peut être supprimé." });
    }

    const client = await db.connect();
    try {
      await client.query("BEGIN");

      // Supprimer les notifications liées
      await client.query(`DELETE FROM notification WHERE id_dossier = $1`, [dossier.id]);

      // Supprimer les traitements
      await client.query(`DELETE FROM traitement WHERE id_dossier = $1`, [dossier.id]);

      // Supprimer les versions
      await client.query(`DELETE FROM dossier_version WHERE id_dossier = $1`, [dossier.id]);

      // Supprimer le fichier physique
      if (dossier.fichier_original) {
        const filePath = path.join(uploadDir, dossier.fichier_original);
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath).catch(() => {});
        }
      }

      // Supprimer le dossier
      await client.query(`DELETE FROM dossier WHERE id = $1`, [dossier.id]);

      await client.query("COMMIT");

      await audit({
        id_user: req.user.id,
        action: "DELETE_REJETE_DOSSIER",
        table_name: "dossier",
        record_id: dossier.id,
        details: { nom: dossier.nom, statut: dossier.statut },
        ip_address: req.ip,
      });

      res.json({ message: `Dossier « ${dossier.nom} » supprimé.` });
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur suppression dossier" });
  }
}

module.exports = {
  list,
  getOne,
  create,
  checkDuplicate,
  confirmReimport,
  assignVerificateur,
  comment,
  sendToValidateur,
  decide,
  adminAction,
  returnToDispatch,
  reuploadVersion,
  exportDossier,
  formatHumanDate,
  downloadFile,
  archiveDossier,
  previewFile,
  previewVersion,
  deleteOldLinked,
  deleteDossier,
};
