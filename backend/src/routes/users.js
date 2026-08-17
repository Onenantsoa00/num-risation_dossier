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

module.exports = router;
