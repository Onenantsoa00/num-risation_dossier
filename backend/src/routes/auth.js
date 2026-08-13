const express = require('express');
const authCtrl = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.post('/signup', authCtrl.signup);
router.post('/login', authCtrl.login);
router.get('/me', authenticate, authCtrl.me);

module.exports = router;
