const router = require('express').Router();
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const c = require('../controllers/statements.controller');

// Party Statements: seeing the statement is statements.view, the settings are
// statements.settings (Admin and Owner hold both). Every row is Tally's -- nothing
// is typed here -- and files on the rows are /api/files (statements.files).
const view = requirePermission('statements.view');
const settings = requirePermission('statements.settings');

router.get('/parties', auth, view, c.parties);
router.get('/', auth, view, c.statement);
router.get('/party', auth, view, c.party);
router.get('/settings', auth, view, c.getSettings);
router.put('/settings', auth, settings, c.updateSettings);

module.exports = router;
