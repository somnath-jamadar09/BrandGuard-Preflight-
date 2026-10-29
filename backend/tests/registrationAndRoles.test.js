/**
 * registrationAndRoles.test.js
 *
 * Verifies self-service registration with roles (creator, brand_manager, knowledge_owner)
 * and fresh workspace provisioning without opening network sockets.
 */

'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret-very-secure-32chars';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const authRouter = require('../src/routes/auth');
const User = require('../src/models/User');
const Org = require('../src/models/Org');
const { hasRole, CAN_APPROVE, CAN_MANAGE_FACTS, CAN_SUBMIT_DRAFT } = require('../src/middleware/rbac');

// Helper to invoke Express route handlers in-memory
function invokePostRegister(body) {
  return new Promise((resolve, reject) => {
    const layer = authRouter.stack.find((l) => l.route?.path === '/register' && l.route?.methods?.post);
    if (!layer) return reject(new Error('POST /register route not found'));

    const handler = layer.route.stack[0].handle;

    const req = { body };
    let statusCode = 200;
    const res = {
      status(code) {
        statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: statusCode, body: data });
      },
    };

    handler(req, res, reject).catch?.(reject);
  });
}

test.describe('Registration Roles and Fresh Workspace Suite', () => {
  test('User model accepts creator, brand_manager, knowledge_owner, manager, owner', () => {
    const roles = User.ROLES;
    assert.ok(roles.includes('creator'), 'ROLES should include creator');
    assert.ok(roles.includes('brand_manager'), 'ROLES should include brand_manager');
    assert.ok(roles.includes('knowledge_owner'), 'ROLES should include knowledge_owner');
    assert.ok(roles.includes('manager'), 'ROLES should include manager');
    assert.ok(roles.includes('owner'), 'ROLES should include owner');
  });

  test('RBAC hasRole correctly handles brand_manager and knowledge_owner permissions', () => {
    assert.ok(hasRole('brand_manager', CAN_APPROVE), 'brand_manager should satisfy CAN_APPROVE');
    assert.ok(hasRole('knowledge_owner', CAN_MANAGE_FACTS), 'knowledge_owner should satisfy CAN_MANAGE_FACTS');
    assert.ok(hasRole('creator', CAN_SUBMIT_DRAFT), 'creator satisfies CAN_SUBMIT_DRAFT');
    assert.strictEqual(hasRole('creator', CAN_APPROVE), false, 'creator should not satisfy CAN_APPROVE');
  });

  test('POST /v1/auth/register registers a creator by default with fresh workspace', async () => {
    const createdUsers = [];
    const createdOrgs = [];

    const origFindOneUser = User.findOne;
    const origFindOneOrg = Org.findOne;
    const origSaveUser = User.prototype.save;
    const origSaveOrg = Org.prototype.save;
    const origFindById = User.findById;

    User.findOne = async () => null;
    Org.findOne = async () => null;

    Org.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      createdOrgs.push(this);
      return this;
    };

    User.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      createdUsers.push(this);
      return this;
    };

    User.findById = (id) => ({
      populate: async () => {
        const u = createdUsers.find((cu) => cu._id.toString() === id.toString()) || createdUsers[0];
        u.orgId = createdOrgs[0] || { _id: new mongoose.Types.ObjectId(), name: 'Test Org' };
        return u;
      },
    });

    try {
      const res = await invokePostRegister({
        name: 'New Writer',
        email: 'writer@acme.com',
        password: 'password123',
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.role, 'creator');
      assert.strictEqual(res.body.user.passwordHash, undefined);
      assert.match(createdOrgs[0].name, /New Writer's Workspace/);

      // Verify token payload contains creator role
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      assert.strictEqual(decoded.role, 'creator');
    } finally {
      User.findOne = origFindOneUser;
      Org.findOne = origFindOneOrg;
      Org.prototype.save = origSaveOrg;
      User.prototype.save = origSaveUser;
      User.findById = origFindById;
    }
  });

  test('POST /v1/auth/register registers a brand_manager with a fresh workspace', async () => {
    const createdUsers = [];
    const createdOrgs = [];

    const origFindOneUser = User.findOne;
    const origFindOneOrg = Org.findOne;
    const origSaveUser = User.prototype.save;
    const origSaveOrg = Org.prototype.save;
    const origFindById = User.findById;

    User.findOne = async () => null;
    Org.findOne = async () => null;

    Org.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      createdOrgs.push(this);
      return this;
    };

    User.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      createdUsers.push(this);
      return this;
    };

    User.findById = (id) => ({
      populate: async () => {
        const u = createdUsers.find((cu) => cu._id.toString() === id.toString()) || createdUsers[0];
        u.orgId = createdOrgs[0] || { _id: new mongoose.Types.ObjectId(), name: 'Test Org' };
        return u;
      },
    });

    try {
      const res = await invokePostRegister({
        name: 'Elena Rostova',
        email: 'elena.new@acme.com',
        password: 'password123',
        role: 'brand_manager',
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.role, 'brand_manager');
      assert.strictEqual(res.body.user.name, 'Elena Rostova');

      // Verify fresh org was created (not Stellara Brands)
      assert.ok(createdOrgs.length > 0);
      assert.match(createdOrgs[0].name, /Elena Rostova's Workspace/);
      assert.notStrictEqual(createdOrgs[0].slug, 'stellara-brands');

      // Verify token payload
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      assert.strictEqual(decoded.role, 'brand_manager');
    } finally {
      User.findOne = origFindOneUser;
      Org.findOne = origFindOneOrg;
      Org.prototype.save = origSaveOrg;
      User.prototype.save = origSaveUser;
      User.findById = origFindById;
    }
  });

  test('POST /v1/auth/register registers a knowledge_owner with a fresh workspace', async () => {
    const createdUsers = [];
    const createdOrgs = [];

    const origFindOneUser = User.findOne;
    const origFindOneOrg = Org.findOne;
    const origSaveUser = User.prototype.save;
    const origSaveOrg = Org.prototype.save;
    const origFindById = User.findById;

    User.findOne = async () => null;
    Org.findOne = async () => null;

    Org.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      createdOrgs.push(this);
      return this;
    };

    User.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      createdUsers.push(this);
      return this;
    };

    User.findById = (id) => ({
      populate: async () => {
        const u = createdUsers.find((cu) => cu._id.toString() === id.toString()) || createdUsers[0];
        u.orgId = createdOrgs[0] || { _id: new mongoose.Types.ObjectId(), name: 'Test Org' };
        return u;
      },
    });

    try {
      const res = await invokePostRegister({
        name: 'Marcus Lee',
        email: 'marcus.new@acme.com',
        password: 'password123',
        role: 'knowledge_owner',
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.ok(res.body.token);
      assert.strictEqual(res.body.user.role, 'knowledge_owner');
      assert.match(createdOrgs[0].name, /Marcus Lee's Workspace/);

      // Verify token payload
      const decoded = jwt.verify(res.body.token, process.env.JWT_SECRET);
      assert.strictEqual(decoded.role, 'knowledge_owner');
    } finally {
      User.findOne = origFindOneUser;
      Org.findOne = origFindOneOrg;
      Org.prototype.save = origSaveOrg;
      User.prototype.save = origSaveUser;
      User.findById = origFindById;
    }
  });

  test('POST /v1/auth/register with explicit orgName creates named org', async () => {
    const createdUsers = [];
    const createdOrgs = [];

    const origFindOneUser = User.findOne;
    const origFindOneOrg = Org.findOne;
    const origSaveUser = User.prototype.save;
    const origSaveOrg = Org.prototype.save;
    const origFindById = User.findById;

    User.findOne = async () => null;
    Org.findOne = async () => null;

    Org.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      createdOrgs.push(this);
      return this;
    };

    User.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      createdUsers.push(this);
      return this;
    };

    User.findById = (id) => ({
      populate: async () => {
        const u = createdUsers.find((cu) => cu._id.toString() === id.toString()) || createdUsers[0];
        u.orgId = createdOrgs[0];
        return u;
      },
    });

    try {
      const res = await invokePostRegister({
        name: 'Custom Team User',
        email: 'custom@acme.com',
        password: 'password123',
        orgName: 'Acme Global Ventures',
        role: 'brand_manager',
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(createdOrgs[0].name, 'Acme Global Ventures');
      assert.strictEqual(createdOrgs[0].slug, 'acme-global-ventures');
    } finally {
      User.findOne = origFindOneUser;
      Org.findOne = origFindOneOrg;
      Org.prototype.save = origSaveOrg;
      User.prototype.save = origSaveUser;
      User.findById = origFindById;
    }
  });

  test('POST /v1/auth/register with joinDemoOrg: true joins stellara-brands', async () => {
    const createdUsers = [];
    const demoOrg = new Org({
      _id: new mongoose.Types.ObjectId('662b10000000000000000001'),
      name: 'Stellara Brands',
      slug: 'stellara-brands',
      active: true,
    });

    const origFindOneUser = User.findOne;
    const origFindOneOrg = Org.findOne;
    const origSaveUser = User.prototype.save;
    const origFindById = User.findById;

    User.findOne = async () => null;
    Org.findOne = async (q) => (q.slug === 'stellara-brands' ? demoOrg : null);

    User.prototype.save = async function () {
      this._id = new mongoose.Types.ObjectId();
      createdUsers.push(this);
      return this;
    };

    User.findById = (id) => ({
      populate: async () => {
        const u = createdUsers.find((cu) => cu._id.toString() === id.toString()) || createdUsers[0];
        u.orgId = demoOrg;
        return u;
      },
    });

    try {
      const res = await invokePostRegister({
        name: 'Demo Creator',
        email: 'democreator@acme.com',
        password: 'password123',
        role: 'creator',
        joinDemoOrg: true,
      });

      assert.strictEqual(res.status, 201);
      assert.strictEqual(res.body.success, true);
      assert.strictEqual(res.body.user.role, 'creator');
      const orgIdStr = (createdUsers[0].orgId._id || createdUsers[0].orgId).toString();
      assert.strictEqual(orgIdStr, demoOrg._id.toString());
    } finally {
      User.findOne = origFindOneUser;
      Org.findOne = origFindOneOrg;
      User.prototype.save = origSaveUser;
      User.findById = origFindById;
    }
  });
});
