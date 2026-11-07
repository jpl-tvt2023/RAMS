const router = require('express').Router();
const auth = require('../middleware/auth');
const { requirePermission } = require('../middleware/permission');
const c = require('../controllers/ledgers.controller');

// Ledgers: seeing the statement is ledgers.view, recording debit and credit
// notes is ledgers.entry, the settings are ledgers.settings. Admin and Owner
// hold all three.
const view = requirePermission('ledgers.view');
const entry = requirePermission('ledgers.entry');
const settings = requirePermission('ledgers.settings');

router.get('/parties', auth, view, c.parties);
router.get('/statement', auth, view, c.statement);
router.get('/party', auth, view, c.party);
router.post('/entries', auth, entry, c.createEntry);
router.put('/entries/:id', auth, entry, c.updateEntry);
router.delete('/entries/:id', auth, entry, c.deleteEntry);
router.get('/settings', auth, view, c.getSettings);
router.put('/settings', auth, settings, c.updateSettings);

module.exports = router;
