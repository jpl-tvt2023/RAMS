const express = require('express');
const auth = require('../middleware/auth');
const { requirePermission, requireAnyPermission } = require('../middleware/permission');
const { allowRoles, ADMIN_ROLES } = require('../middleware/rbac');
const { MAX_UPLOAD_BYTES, TOO_BIG } = require('../services/files');
const c = require('../controllers/files.controller');

// Files on Tally vouchers, added on Party Statements and Attachments. Adding and
// removing is statements.files; viewing and downloading, statements.view,
// attachments.view or reports.view (Bills Receivable shows an invoice's files);
// the storage figures, Admin and Owner.
const router = express.Router();
const attach = requirePermission('statements.files');
const see = requireAnyPermission('statements.view', 'attachments.view', 'reports.view');

// The file is the request body, whatever type the browser says it is (the
// server checks its first bytes). Only this route reads a body this large.
const parseFile = express.raw({ type: () => true, limit: MAX_UPLOAD_BYTES });
const rawFile = (req, res, next) => parseFile(req, res, (err) => {
  if (err && err.type === 'entity.too.large') return res.status(413).json({ message: TOO_BIG });
  return next(err);
});

router.post('/', auth, attach, rawFile, c.upload);
router.get('/usage', auth, allowRoles(...ADMIN_ROLES), c.usage);
router.get('/:id', auth, see, c.download);
router.delete('/:id', auth, attach, c.remove);

module.exports = router;
