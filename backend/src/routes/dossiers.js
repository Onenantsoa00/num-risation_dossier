const express = require("express");
const dossierCtrl = require("../controllers/dossierController");
const { authenticate, authorize } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

const router = express.Router();

router.use(authenticate);

router.get("/", dossierCtrl.list);
router.get("/check-duplicate", dossierCtrl.checkDuplicate);
router.post(
  "/",
  authorize("Dispatch", "Admin", "super_admin"),
  upload.single("fichier"),
  dossierCtrl.create,
);
router.post(
  "/:id/confirm-reimport",
  authorize("Dispatch", "Admin", "super_admin"),
  upload.single("fichier"),
  dossierCtrl.confirmReimport,
);
router.post(
  "/:id/assign-verificateur",
  authorize("Admin", "super_admin"),
  dossierCtrl.assignVerificateur,
);
router.post(
  "/:id/reupload",
  authorize("Dispatch", "Admin", "super_admin"),
  upload.single("fichier"),
  dossierCtrl.reuploadVersion,
);
router.get("/:id", dossierCtrl.getOne);
router.post("/:id/comment", dossierCtrl.comment);
router.post(
  "/:id/send-validateur",
  authorize("Verificateur", "Admin", "super_admin"),
  dossierCtrl.sendToValidateur,
);
router.post(
  "/:id/decide",
  authorize("Validateur", "Admin", "super_admin"),
  dossierCtrl.decide,
);
router.post(
  "/:id/delete-old-linked",
  authorize("Validateur", "Admin", "super_admin"),
  dossierCtrl.deleteOldLinked,
);
router.delete(
  "/:id",
  authorize("Admin", "super_admin"),
  dossierCtrl.deleteDossier,
);
router.post(
  "/:id/admin-action",
  authorize("Admin", "super_admin"),
  dossierCtrl.adminAction,
);
router.post("/:id/retour-dispatch", dossierCtrl.returnToDispatch);
router.get("/:id/export", dossierCtrl.exportDossier);
router.get("/:id/preview-version/:version", dossierCtrl.previewVersion);
router.get("/:id/preview", dossierCtrl.previewFile);
router.get("/:id/download", dossierCtrl.downloadFile);

module.exports = router;
