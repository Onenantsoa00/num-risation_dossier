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

async function listUsers(req, res) {
  try {
    const { role } = req.query;
    let sql = `
      SELECT u.id, u.nom, u.prenoms, u.email, u.tel, u.image, u.id_roles, r.nom AS role
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

module.exports = { listRoles, listUsers, updateProfile };
