const argon2 = require("argon2");
const jwt = require("jsonwebtoken");
const db = require("../config/db");
const { audit } = require("../services/helpers");

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || "24h",
  });
}

function publicUser(row) {
  return {
    id: row.id,
    nom: row.nom,
    prenoms: row.prenoms,
    email: row.email,
    tel: row.tel,
    date_naissance: row.date_naissance,
    cin: row.cin,
    im: row.im,
    image: row.image,
    id_roles: row.id_roles,
    role: row.role,
  };
}

async function login(req, res) {
  try {
    const { email, mdp } = req.body;
    if (!email || !mdp) {
      return res.status(400).json({ error: "email et mdp requis" });
    }

    const { rows } = await db.query(
      `SELECT u.*, r.nom AS role
       FROM utilisateur u
       LEFT JOIN roles r ON r.id = u.id_roles
       WHERE LOWER(u.email) = LOWER($1)`,
      [email],
    );

    if (!rows[0]) {
      return res.status(401).json({ error: "Identifiants incorrects" });
    }
    if (!rows[0].actif) {
      return res.status(403).json({
        error: "Votre compte est restreint.",
        code: "ACCOUNT_RESTRICTED",
      });
    }

    const valid = await argon2.verify(rows[0].mdp, mdp);
    if (!valid) {
      return res.status(401).json({ error: "Identifiants incorrects" });
    }

    await audit({
      id_user: rows[0].id,
      action: "LOGIN",
      table_name: "utilisateur",
      record_id: rows[0].id,
      ip_address: req.ip,
    });

    const token = signToken(rows[0].id);
    res.json({ token, user: publicUser(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erreur lors de la connexion" });
  }
}

async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

module.exports = { login, me, publicUser };
