const express = require('express');
const archiveCtrl = require('../controllers/archiveController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/', archiveCtrl.list);

module.exports = router;
