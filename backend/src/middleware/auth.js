const jwt = require("jsonwebtoken");
const db = require("../config/db");

async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Token manquant" });
    }
    const token = header.slice(7);
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    const { rows } = await db.query(
      `SELECT
        u.id,
        u.nom,
        u.prenoms,
        u.email,
        u.image,
        u.tel,
        u.date_naissance,
        u.cin,
        u.im,
        u.actif,
        u.id_roles,
        r.nom AS role
       FROM utilisateur u
       LEFT JOIN roles r ON r.id = u.id_roles
       WHERE u.id = $1`,
      [payload.userId],
    );

    if (!rows[0]) {
      return res.status(401).json({ error: "Utilisateur introuvable" });
    }

    req.user = rows[0];
    if (!rows[0]) {
      return res.status(401).json({
        error: "Utilisateur introuvable",
      });
    }

    if (!rows[0].actif) {
      return res.status(403).json({
        error: "Votre compte est restreint.",
        code: "ACCOUNT_RESTRICTED",
      });
    }

    req.user = rows[0];
    next();
  } catch {
    return res.status(401).json({ error: "Token invalide ou expiré" });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        error: "Non authentifié",
      });
    }

    // super_admin possède tous les droits d'un Admin
    if (req.user.role === "Admin" || req.user.role === "super_admin") {
      next();
      return;
    }

    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: "Accès refusé pour ce rôle",
      });
    }

    next();
  };
}

module.exports = { authenticate, authorize };
