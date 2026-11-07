const router = require('express').Router();
const auth = require('../middleware/auth');
const { allowRoles, ALL_ROLES, ADMIN_ROLES } = require('../middleware/rbac');
const { requirePermission } = require('../middleware/permission');
const c = require('../controllers/settings.controller');
const permissions = require('../controllers/permissions.controller');

router.get('/sync', auth, allowRoles(...ALL_ROLES), c.getSync);
router.put('/sync', auth, requirePermission('sync.schedule'), c.updateSync);

// Which Tally records need a narration (narration.settings).
router.get('/narration', auth, allowRoles(...ALL_ROLES), c.getNarration);
router.put('/narration', auth, requirePermission('narration.settings'), c.updateNarration);

// Who may do what: Admin/Owner only, and never grantable, so no role can
// give itself more.
router.get('/permissions', auth, allowRoles(...ADMIN_ROLES), permissions.get);
router.put('/permissions', auth, allowRoles(...ADMIN_ROLES), permissions.update);

module.exports = router;
