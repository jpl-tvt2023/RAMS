const router = require('express').Router();
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const c = require('../controllers/ledgers.controller');

// Ledgers: seeing the statement is ledgers.view, the settings are
// ledgers.settings (Admin and Owner hold both). Every row is Tally's -- nothing
// is typed here -- and files on the rows are /api/files (ledgers.files).
const view = requirePermission('ledgers.view');
const settings = requirePermission('ledgers.settings');

router.get('/parties', auth, view, c.parties);
router.get('/statement', auth, view, c.statement);
router.get('/party', auth, view, c.party);
router.get('/settings', auth, view, c.getSettings);
router.put('/settings', auth, settings, c.updateSettings);

module.exports = router;
