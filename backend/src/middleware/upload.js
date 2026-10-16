const path = require('path');
const multer = require('multer');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../../', process.env.UPLOAD_DIR || 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${unique}-${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 },
});

/**
 * Supprime le fichier temporaire déposé par Multer lorsque la requête est
 * refusée (statut >= 400).
 *
 * Sans ce nettoyage, tout import rejeté après l'upload (doublon, champ
 * obligatoire manquant, droits insuffisants, congé…) laisse le fichier
 * sur le disque : les tests ont relevé 74 fichiers orphelins sur 160.
 * Si le contrôleur a déjà renommé le fichier, ce nettoyage ne fait rien.
 */
function cleanupUploadOnFailure(req, res, next) {
  res.on("finish", () => {
    const nom = req.file?.filename;
    if (!nom || res.statusCode < 400) return;

    const cible = path.join(uploadDir, nom);
    if (fs.existsSync(cible)) {
      fs.promises.unlink(cible).catch(() => {});
    }
  });

  next();
}

module.exports = { upload, uploadDir, cleanupUploadOnFailure };
