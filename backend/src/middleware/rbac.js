// The RAMS role set. MIRRORED in frontend/src/utils/roles.js (ROLES, ALL_ROLES,
// ADMIN_ONLY) and in the user_roles CHECK (migration 022, which rebuilt 002's)
// -- change all three together; the parity tests in tests/roles.test.js and
// frontend utils/__tests__/roles.test.js pin them. A user may hold several.
//   Admin / Owner   -- everything, including Users and the Audit Log.
//   Accountant      -- works the accounts (exceptions, applying Tally values).
//   Viewer          -- reads only.
//   Purchase Head   -- add-on roles (022): each holds one approval step on
//   Accountant Head    Purchase Reports, set on Admin -> Roles & permissions.
const ALL_ROLES = ['Admin', 'Owner', 'Accountant', 'Viewer', 'Purchase Head', 'Accountant Head'];
const ADMIN_ROLES = ['Admin', 'Owner'];

// Applied at route-definition time, always after `auth`.
const allowRoles = (...allowed) => (req, res, next) => {
  const userRoles = req.user?.roles || [];
  if (!userRoles.some((r) => allowed.includes(r))) {
    return res.status(403).json({ message: 'Access denied' });
  }
  next();
};

module.exports = { allowRoles, ALL_ROLES, ADMIN_ROLES };
