const express = require("express");
const userCtrl = require("../controllers/userController");
const { authenticate, authorize } = require("../middleware/auth");
const { upload } = require("../middleware/upload");

const router = express.Router();

// Les rôles peuvent être utilisés par l'interface authentifiée
router.get("/roles", authenticate, userCtrl.listRoles);

// Liste des utilisateurs
router.get("/", authenticate, userCtrl.listUsers);

// Création d'un utilisateur : Admin uniquement
router.post(
  "/",
  authenticate,
  authorize("Admin"),
  upload.single("image"),
  userCtrl.createUser,
);

// Profil de l'utilisateur connecté
router.put(
  "/profile",
  authenticate,
  upload.single("image"),
  userCtrl.updateProfile,
);

router.patch(
  "/:id/status",
  authenticate,
  authorize("Admin"),
  userCtrl.toggleUserStatus,
);

router.post(
  "/:id/conge",
  authenticate,
  authorize("Admin", "super_admin"),
  userCtrl.setConge,
);

router.delete(
  "/:id/conge",
  authenticate,
  authorize("Admin", "super_admin"),
  userCtrl.clearConge,
);

router.post("/presence", authenticate, userCtrl.heartbeat);
router.get("/presence", authenticate, userCtrl.presenceList);

module.exports = router;
