const express = require("express");
const archiveCtrl = require("../controllers/archiveController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

/*
 * Consultation des archives
 */
router.get("/", archiveCtrl.list);

/*
 * Archivage définitif
 */
router.post(
  "/:id/archive",
  authorize("i_archive", "Admin"),
  archiveCtrl.archiveDossier,
);

module.exports = router;
