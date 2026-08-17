const express = require("express");
const archiveCtrl = require("../controllers/archiveController");
const { authenticate, authorize } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.use(authenticate);

/*
 * Consultation des archives
 */
router.get("/", archiveCtrl.list);

/*
 * Archivage Rapide
 * Admin et super_admin uniquement
 */
router.post(
  "/quick",
  authorize("Admin", "super_admin"),
  upload.single("fichier"),
  archiveCtrl.quickArchive,
);

/*
 * Archivage définitif
 */
router.post(
  "/:id/archive",
  authorize("i_archive", "Admin"),
  archiveCtrl.archiveDossier,
);

module.exports = router;
