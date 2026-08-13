const argon2 = require('argon2');
const jwt = require('jsonwebtoken');
const db = require('../config/db');
const { audit } = require('../services/helpers');

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
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
    image: row.image,
    id_roles: row.id_roles,
    role: row.role,
  };
}

async function signup(req, res) {
  try {
    const { nom, prenoms, email, mdp, tel, date_naissance, id_roles } = req.body;
    if (!nom || !prenoms || !email || !mdp) {
      return res.status(400).json({ error: 'nom, prenoms, email et mdp sont requis' });
    }

    const exists = await db.query('SELECT id FROM utilisateur WHERE LOWER(email) = LOWER($1)', [email]);
    if (exists.rows.length) {
      return res.status(409).json({ error: 'Cet email est déjà utilisé' });
    }

    const hash = await argon2.hash(mdp, { type: argon2.argon2id });
    const roleId = id_roles || 2; // Dispatch par défaut

    const { rows } = await db.query(
      `INSERT INTO utilisateur (nom, prenoms, email, mdp, tel, date_naissance, id_roles)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, nom, prenoms, email, tel, date_naissance, image, id_roles`,
      [nom, prenoms, email.toLowerCase(), hash, tel || null, date_naissance || null, roleId]
    );

    const roleRes = await db.query('SELECT nom FROM roles WHERE id = $1', [rows[0].id_roles]);
    const user = { ...rows[0], role: roleRes.rows[0]?.nom };

    await audit({
      id_user: user.id,
      action: 'SIGNUP',
      table_name: 'utilisateur',
      record_id: user.id,
      ip_address: req.ip,
    });

    const token = signToken(user.id);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l\'inscription' });
  }
}

async function login(req, res) {
  try {
    const { email, mdp } = req.body;
    if (!email || !mdp) {
      return res.status(400).json({ error: 'email et mdp requis' });
    }

    const { rows } = await db.query(
      `SELECT u.*, r.nom AS role
       FROM utilisateur u
       LEFT JOIN roles r ON r.id = u.id_roles
       WHERE LOWER(u.email) = LOWER($1)`,
      [email]
    );

    if (!rows[0]) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const valid = await argon2.verify(rows[0].mdp, mdp);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    await audit({
      id_user: rows[0].id,
      action: 'LOGIN',
      table_name: 'utilisateur',
      record_id: rows[0].id,
      ip_address: req.ip,
    });

    const token = signToken(rows[0].id);
    res.json({ token, user: publicUser(rows[0]) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de la connexion' });
  }
}

async function me(req, res) {
  res.json({ user: publicUser(req.user) });
}

module.exports = { signup, login, me, publicUser };
