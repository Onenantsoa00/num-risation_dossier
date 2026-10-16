const express = require("express");
const archiveCtrl = require("../controllers/archiveController");
const { authenticate, authorize } = require("../middleware/auth");
const {
  upload,
  cleanupUploadOnFailure,
} = require("../middleware/upload");

const router = express.Router();

router.use(authenticate);

/*
 * Consultation des archives
 */
router.get("/", archiveCtrl.list);

/*
 * Archivage Rapide
 * i_archive, Admin et super_admin
 */
router.post(
  "/quick",
  authorize("i_archive", "Admin", "super_admin"),
  upload.single("fichier"),
  cleanupUploadOnFailure,
  archiveCtrl.quickArchive,
);

/*
 * Téléchargement multiple (ZIP) des archives sélectionnées
 */
router.post("/download-zip", archiveCtrl.downloadSelectionZip);

/*
 * Archivage définitif
 */
router.post(
  "/:id/archive",
  authorize("i_archive", "Admin"),
  archiveCtrl.archiveDossier,
);

module.exports = router;
