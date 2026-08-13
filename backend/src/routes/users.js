const express = require('express');
const userCtrl = require('../controllers/userController');
const { authenticate } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();

router.get('/roles', userCtrl.listRoles);
router.get('/', authenticate, userCtrl.listUsers);
router.put('/profile', authenticate, upload.single('image'), userCtrl.updateProfile);

module.exports = router;
