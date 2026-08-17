const argon2 = require("argon2");
const path = require("path");
const db = require("../config/db");
const { publicUser } = require("./authController");
const { audit } = require("../services/helpers");

async function listRoles(_req, res) {
  try {
    const { rows } = await db.query("SELECT id, nom FROM roles ORDER BY id");
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération des rôles" });
  }
}

async function createUser(req, res) {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({
        error: "Seul l'Admin peut créer des comptes.",
      });
    }

    const { nom, prenoms, email, mdp, tel, date_naissance, cin, im, id_roles } =
      req.body;

    if (!nom?.trim() || !prenoms?.trim()) {
      return res.status(400).json({
        error: "Le nom et les prénoms sont obligatoires.",
      });
    }

    if (!email?.trim()) {
      return res.status(400).json({
        error: "L'email est obligatoire.",
      });
    }

    if (!mdp || mdp.length < 6) {
      return res.status(400).json({
        error: "Le mot de passe doit contenir au moins 6 caractères.",
      });
    }

    if (!id_roles) {
      return res.status(400).json({
        error: "Le rôle est obligatoire.",
      });
    }

    // ----------------------------------------------------------
    // Vérifier que le rôle est autorisé à la création
    // ----------------------------------------------------------

    const roleResult = await db.query(
      `
        SELECT id, nom
        FROM roles
        WHERE id = $1
      `,
      [id_roles],
    );

    const role = roleResult.rows[0];

    const rolesAutorises = [
      "Dispatch",
      "Verificateur",
      "Validateur",
      "i_archive",
    ];

    if (!role || !rolesAutorises.includes(role.nom)) {
      return res.status(400).json({
        error:
          "Le rôle doit être Dispatch, Verificateur, Validateur ou i_archive.",
      });
    }

    // ----------------------------------------------------------
    // Vérifier l'email
    // ----------------------------------------------------------

    const emailNormalized = email.trim().toLowerCase();

    const exists = await db.query(
      `
        SELECT id
        FROM utilisateur
        WHERE LOWER(email) = LOWER($1)
      `,
      [emailNormalized],
    );

    if (exists.rows.length) {
      return res.status(409).json({
        error: "Cet email est déjà utilisé.",
      });
    }

    // ----------------------------------------------------------
    // Hash du mot de passe
    // ----------------------------------------------------------

    const hash = await argon2.hash(mdp, {
      type: argon2.argon2id,
    });

    // ----------------------------------------------------------
    // Création
    // ----------------------------------------------------------

    const { rows } = await db.query(
      `
        INSERT INTO utilisateur (
          nom,
          prenoms,
          email,
          mdp,
          tel,
          date_naissance,
          cin,
          im,
          id_roles,
          image
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
          $10
        )
        RETURNING
          id,
          nom,
          prenoms,
          email,
          tel,
          date_naissance,
          cin,
          im,
          image,
          id_roles
      `,
      [
        nom.trim(),
        prenoms.trim(),
        emailNormalized,
        hash,
        tel?.trim() || null,
        date_naissance || null,
        cin?.trim() || null,
        im?.trim() || null,
        role.id,
        req.file ? `/uploads/${req.file.filename}` : null,
      ],
    );

    const user = {
      ...rows[0],
      role: role.nom,
    };

    await audit({
      id_user: req.user.id,
      action: "CREATE_USER",
      table_name: "utilisateur",
      record_id: user.id,
      details: {
        role: role.nom,
        email: emailNormalized,
      },
      ip_address: req.ip,
    });

    res.status(201).json({
      message: "Compte utilisateur créé avec succès.",
      user,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erreur création utilisateur.",
    });
  }
}

async function listUsers(req, res) {
  try {
    const { role } = req.query;
    let sql = `
      SELECT
        u.id,
        u.nom,
        u.prenoms,
        u.email,
        u.tel,
        u.date_naissance,
        u.cin,
        u.im,
        u.image,
        u.actif,
        u.id_roles,
        r.nom AS role
      FROM utilisateur u
      LEFT JOIN roles r ON r.id = u.id_roles
    `;
    const params = [];
    if (role) {
      params.push(role);
      sql += ` WHERE r.nom = $1`;
    }
    sql += " ORDER BY u.nom, u.prenoms";
    const { rows } = await db.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur récupération des utilisateurs" });
  }
}

async function toggleUserStatus(req, res) {
  try {
    if (req.user.role !== "Admin") {
      return res.status(403).json({
        error: "Seul l'Admin peut modifier le statut d'un utilisateur.",
      });
    }

    const userId = Number(req.params.id);

    if (!Number.isInteger(userId)) {
      return res.status(400).json({
        error: "Identifiant utilisateur invalide.",
      });
    }

    if (userId === req.user.id) {
      return res.status(400).json({
        error: "Vous ne pouvez pas désactiver votre propre compte.",
      });
    }

    const userResult = await db.query(
      `
        SELECT
          u.id,
          u.nom,
          u.prenoms,
          u.email,
          u.actif,
          r.nom AS role
        FROM utilisateur u
        LEFT JOIN roles r
          ON r.id = u.id_roles
        WHERE u.id = $1
      `,
      [userId],
    );

    const user = userResult.rows[0];

    if (!user) {
      return res.status(404).json({
        error: "Utilisateur introuvable.",
      });
    }

    const nouvelEtat = !user.actif;

    const { rows } = await db.query(
      `
        UPDATE utilisateur
        SET
          actif = $1,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
        RETURNING
          id,
          nom,
          prenoms,
          email,
          tel,
          date_naissance,
          cin,
          im,
          image,
          id_roles,
          actif
      `,
      [nouvelEtat, userId],
    );

    await audit({
      id_user: req.user.id,
      action: nouvelEtat ? "ACTIVER_UTILISATEUR" : "DESACTIVER_UTILISATEUR",
      table_name: "utilisateur",
      record_id: userId,
      details: {
        utilisateur: `${user.prenoms} ${user.nom}`,
        ancien_etat: user.actif,
        nouvel_etat: nouvelEtat,
      },
      ip_address: req.ip,
    });

    res.json({
      message: nouvelEtat ? "Utilisateur réactivé." : "Utilisateur désactivé.",
      user: {
        ...rows[0],
        role: user.role,
      },
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: "Erreur modification statut utilisateur.",
    });
  }
}

async function updateProfile(req, res) {
  try {
    const { nom, prenoms, tel, date_naissance, cin, im, email, mdp } = req.body;
    const userId = req.user.id;

    const fields = [];
    const values = [];
    let i = 1;

    if (nom) {
      fields.push(`nom = $${i++}`);
      values.push(nom);
    }
    if (prenoms) {
      fields.push(`prenoms = $${i++}`);
      values.push(prenoms);
    }
    if (tel !== undefined) {
      fields.push(`tel = $${i++}`);
      values.push(tel || null);
    }
    if (date_naissance !== undefined) {
      fields.push(`date_naissance = $${i++}`);
      values.push(date_naissance || null);
    }
    if (cin !== undefined) {
      fields.push(`cin = $${i++}`);
      values.push(cin || null);
    }

    if (im !== undefined) {
      fields.push(`im = $${i++}`);
      values.push(im || null);
    }
    if (email) {
      const exists = await db.query(
        "SELECT id FROM utilisateur WHERE LOWER(email) = LOWER($1) AND id <> $2",
        [email, userId],
      );
      if (exists.rows.length) {
        return res.status(409).json({ error: "Email déjà utilisé" });
      }
      fields.push(`email = $${i++}`);
      values.push(email.toLowerCase());
    }
    if (mdp) {
      const hash = await argon2.hash(mdp, { type: argon2.argon2id });
      fields.push(`mdp = $${i++}`);
      values.push(hash);
    }
    if (req.file) {
      fields.push(`image = $${i++}`);
      values.push(`/uploads/${req.file.filename}`);
    }

    if (!fields.length) {
      return res.status(400).json({ error: "Aucune modification fournie" });
    }

    fields.push("updated_at = CURRENT_TIMESTAMP");
    values.push(userId);

    const { rows } = await db.query(
      `UPDATE utilisateur SET ${fields.join(", ")}
       WHERE id = $${i}
       RETURNING
        id,
        nom,
        prenoms,
        email,
        tel,
        date_naissance,
        cin,
        im,
        image,
        id_roles`,
      values,
    );

    const roleRes = await db.query("SELECT nom FROM roles WHERE id = $1", [
      rows[0].id_roles,
    ]);
    const user = { ...rows[0], role: roleRes.rows[0]?.nom };

    await audit({
      id_user: userId,
      action: "UPDATE_PROFILE",
      table_name: "utilisateur",
      record_id: userId,
      ip_address: req.ip,
    });

    res.json({ user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur mise à jour du profil" });
  }
}

module.exports = {
  createUser,
  listRoles,
  listUsers,
  updateProfile,
  toggleUserStatus,
};
