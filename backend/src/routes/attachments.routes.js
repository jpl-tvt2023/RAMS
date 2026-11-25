const router = require('express').Router();
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const c = require('../controllers/attachments.controller');

// Tally Reports -> Attachments: seeing it is attachments.view (Admin and Owner
// hold every permission). Files on its rows are /api/files: adding and
// removing them is statements.files, downloading attachments.view too.
const view = requirePermission('attachments.view');

router.get('/months', auth, view, c.months);
router.get('/vouchers', auth, view, c.vouchers);

module.exports = router;
