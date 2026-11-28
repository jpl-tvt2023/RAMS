const fs = require('fs');
const path = require('path');
const request = require('supertest');
const app = require('../app');
const { ALL_ROLES, ADMIN_ROLES } = require('../src/middleware/rbac');

// The role set lives in three places that must agree: rbac.js, the user_roles
// CHECK (migration 022 rebuilt 002's), and the frontend's utils/roles.js (whose
// own test asserts these same values).
describe('the RAMS role set', () => {
  test('is Admin, Owner, Accountant, Viewer and the two heads, with Admin and Owner as the admins', () => {
    expect(ALL_ROLES).toEqual(['Admin', 'Owner', 'Accountant', 'Viewer', 'Purchase Head', 'Accountant Head']);
    expect(ADMIN_ROLES).toEqual(['Admin', 'Owner']);
  });

  test('matches the user_roles CHECK constraint (migration 022)', () => {
    const sql = fs.readFileSync(path.resolve(__dirname, '../src/migrations/022_purchase_reports.sql'), 'utf8');
    const table = sql.slice(sql.indexOf('CREATE TABLE user_roles_new'));
    const inList = /CHECK \(role IN \(([^)]*)\)\)/.exec(table)[1];
    expect(inList.split(',').map((s) => s.trim().replace(/'/g, ''))).toEqual(ALL_ROLES);
  });
});

describe('GET /api/health', () => {
  test('answers ok without a login', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
