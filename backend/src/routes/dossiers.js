const express = require('express');
const dossierCtrl = require('../controllers/dossierController');
const { authenticate, authorize } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

const router = express.Router();

router.use(authenticate);

router.get('/', dossierCtrl.list);
router.get('/:id', dossierCtrl.getOne);
router.post('/', authorize('Dispatch', 'Admin'), upload.single('fichier'), dossierCtrl.create);
router.post('/:id/comment', dossierCtrl.comment);
router.post('/:id/send-validateur', authorize('Verificateur', 'Admin'), dossierCtrl.sendToValidateur);
router.post('/:id/decide', authorize('Validateur', 'Admin'), dossierCtrl.decide);
router.post('/:id/admin-action', authorize('Admin'), dossierCtrl.adminAction);
router.post('/:id/retour-dispatch', dossierCtrl.returnToDispatch);
router.get('/:id/export', dossierCtrl.exportDossier);
router.get('/:id/download', dossierCtrl.downloadFile);

module.exports = router;
