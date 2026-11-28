const express = require('express');
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const { MAX_UPLOAD_BYTES, TOO_BIG } = require('../services/files');
const c = require('../controllers/purchases.controller');

// Purchase Reports -> Warehouse and Stitching. Seeing the pages, a record and
// its files is purchases.view. The bill check, and adding or removing files,
// is purchases.check. Each head's approval -- approve, or send back with a
// reason -- is that head's own permission. Admin and Owner hold every one.
const router = express.Router();
const view = requirePermission('purchases.view');
const checker = requirePermission('purchases.check');
const purchaseHead = requirePermission('purchases.approve_purchase');
const accountsHead = requirePermission('purchases.approve_accounts');

// The file is the request body, as on /api/files.
const parseFile = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });
const rawFile = (req, res, next) => parseFile(req, res, (err) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ message: TOO_BIG });
  return next(err);
});

router.post('/refresh', auth, view, c.refresh);
router.get('/records/:id', auth, view, c.one);
router.post('/check', auth, checker, c.checkMany);
router.post('/records/:id/check', auth, checker, c.check);
router.post('/records/:id/files', auth, checker, rawFile, c.uploadFile);
router.get('/files/:id', auth, view, c.downloadFile);
router.delete('/files/:id', auth, checker, c.removeFile);
router.post('/purchase-head/approve', auth, purchaseHead, c.approvePurchase);
router.post('/records/:id/purchase-head/send-back', auth, purchaseHead, c.sendBackPurchase);
router.post('/accounts-head/approve', auth, accountsHead, c.approveAccounts);
router.post('/records/:id/accounts-head/send-back', auth, accountsHead, c.sendBackAccounts);
router.get('/:page/records', auth, view, c.list);

module.exports = router;
