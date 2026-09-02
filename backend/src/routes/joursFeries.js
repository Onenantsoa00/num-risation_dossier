const express = require("express");
const jourFerierCtrl = require("../controllers/jourFerierController");
const { authenticate, authorize } = require("../middleware/auth");

const router = express.Router();

router.use(authenticate);

router.get("/", jourFerierCtrl.list);
router.post("/", authorize("Admin", "super_admin"), jourFerierCtrl.create);
router.delete("/:id", authorize("Admin", "super_admin"), jourFerierCtrl.remove);

module.exports = router;
