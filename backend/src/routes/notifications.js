const express = require('express');
const notifCtrl = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.get('/', notifCtrl.list);
router.get('/unread-count', notifCtrl.unreadCount);
router.patch('/read-all', notifCtrl.markAllRead);
router.patch('/:id/read', notifCtrl.markRead);

module.exports = router;
