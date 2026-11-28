const { db } = require('./helpers/db');
const { logAction } = require('../src/services/auditLog.service');
const { lastChanges } = require('../src/services/lastChange');

let accountant;
let admin;

const userId = async (username) => Number((await db.execute({ sql: 'SELECT id FROM users WHERE username = ?', args: [username] })).rows[0].id);

beforeAll(async () => {
  accountant = await userId('accountant');
  admin = await userId('admin');
});

describe('lastChanges: the last change a person made to each record', () => {
  test('by id: the newest row a person wrote, with their name; the Connector and sign-ins never count', async () => {
    const type = 'lc_thing';
    await logAction({ userId: accountant, actionType: 'THING_UPDATE', description: 'first', entityType: type, entityId: 1 });
    await logAction({ userId: admin, actionType: 'THING_UPDATE', description: 'second', entityType: type, entityId: 1 });
    await logAction({ actionType: 'THING_SEEN', description: 'by the Connector', entityType: type, entityId: 1 });
    await logAction({ userId: accountant, actionType: 'LOGIN', description: 'a sign-in', entityType: type, entityId: 1 });
    await logAction({ userId: accountant, actionType: 'THING_UPDATE', description: 'other', entityType: type, entityId: 2 });
    await logAction({ actionType: 'THING_SEEN', description: 'only the Connector', entityType: type, entityId: 3 });

    const out = await lastChanges(db, type, [1, 2, 3, 4]);
    expect(out.get('1')).toMatchObject({ user_name: 'Test Admin', action_type: 'THING_UPDATE', description: 'second' });
    expect(out.get('1').at).toMatch(/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    expect(out.get('2')).toMatchObject({ user_name: 'Test Accountant', description: 'other' });
    expect(out.has('3')).toBe(false);
    expect(out.has('4')).toBe(false);
  });

  test('by ref: text keys, and another entity type with the same key is not mixed in', async () => {
    await logAction({ userId: accountant, actionType: 'VENDOR_THING', description: 'Blinkit', entityType: 'lc_vendor', entityRef: 'Blinkit' });
    await logAction({ userId: admin, actionType: 'OTHER', description: 'not a vendor', entityType: 'lc_other', entityRef: 'Blinkit' });
    const out = await lastChanges(db, 'lc_vendor', ['Blinkit', 'Zepto'], { by: 'ref' });
    expect(out.get('Blinkit')).toMatchObject({ user_name: 'Test Accountant', description: 'Blinkit' });
    expect(out.has('Zepto')).toBe(false);
  });

  test('more keys than one query takes, and empty input', async () => {
    const type = 'lc_many';
    await logAction({ userId: accountant, actionType: 'MANY', entityType: type, entityId: 950 });
    const keys = Array.from({ length: 1000 }, (_, i) => i + 1);
    const out = await lastChanges(db, type, keys);
    expect([...out.keys()]).toEqual(['950']);
    expect((await lastChanges(db, type, [])).size).toBe(0);
    expect((await lastChanges(db, type, [null, undefined])).size).toBe(0);
  });
});
