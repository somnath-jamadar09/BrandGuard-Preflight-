/**
 * seed.js — BrandGuard Preflight Demo Data Seeder.
 *
 * Implements NFR-D-04:
 *   Loads all demo data for Stellara Brands on first startup:
 *     - Tenant Organisation: Stellara Brands (with watchlists and settings)
 *     - Users: Priya Sharma (creator), Marcus Vance (manager), Legal (reviewer), Admin
 *     - Sources: Stellara Returns Policy v4 (.pdf)
 *     - Facts: Approved return policy statements
 *     - Demo Draft & Version 1 with content hash
 *     - 3 Seeded Findings (contradiction + superlative + outdated/supported)
 *
 * Can be executed standalone:
 *   node src/utils/seed.js
 * or invoked programmatically during server startup:
 *   const { seedDemoDataIfEmpty } = require('./utils/seed');
 */

'use strict';

require('dotenv').config();
const crypto = require('crypto');
const mongoose = require('mongoose');

const Org = require('../models/Org');
const User = require('../models/User');
const Source = require('../models/Source');
const Fact = require('../models/Fact');
const Draft = require('../models/Draft');
const DraftVersion = require('../models/DraftVersion');
const Finding = require('../models/Finding');
const { connectDB } = require('./db');

function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

const STELLARA_ORG_ID = new mongoose.Types.ObjectId('662b10000000000000000001');

async function seedDemoData({ force = false } = {}) {
  const existingOrg = await Org.findOne({ $or: [{ _id: STELLARA_ORG_ID }, { slug: 'stellara-brands' }] });
  if (existingOrg && !force) {
    const userCount = await User.countDocuments({ orgId: existingOrg._id });
    if (userCount > 0) {
      console.log(`[seed] Demo data already exists for Stellara Brands (${userCount} users). Skipping.`);
      return { skipped: true, org: existingOrg };
    }
  }

  console.log('[seed] Seeding BrandGuard Preflight demo data…');

  // 1. Create or update Organisation
  let org = existingOrg;
  if (!org) {
    org = new Org({
      _id: STELLARA_ORG_ID,
      name: 'Stellara Brands',
      slug: 'stellara-brands',
      active: true,
      watchlist: [
        'Stellara Secret',
        'Project Falcon',
        'Acquisition Alpha',
        'internal only',
        'confidential',
      ],
      settings: {
        confidenceThresholds: {
          Contradicted: 0.85,
          Unclear: 0.60,
        },
        rules: [
          { ruleId: 'rule.superlative.unqualified', enabled: true, severity: 'violation' },
          { ruleId: 'rule.date.outdated', enabled: true, severity: 'violation' },
          { ruleId: 'rule.cost.claim', enabled: true, severity: 'violation' },
        ],
      },
    });
    await org.save();
    console.log(`[seed] Created tenant Org: "${org.name}" (${org._id})`);
  }

  // 2. Seed Users
  const userDefs = [
    {
      _id: new mongoose.Types.ObjectId('662b20000000000000000001'),
      name: 'Priya Sharma',
      email: 'priya@stellara.com',
      role: 'creator',
      orgId: org._id,
      active: true,
    },
    {
      _id: new mongoose.Types.ObjectId('662b20000000000000000002'),
      name: 'Marcus Vance',
      email: 'marcus@stellara.com',
      role: 'manager',
      orgId: org._id,
      active: true,
    },
    {
      _id: new mongoose.Types.ObjectId('662b20000000000000000003'),
      name: 'Reviewer Legal',
      email: 'reviewer@stellara.com',
      role: 'reviewer',
      orgId: org._id,
      active: true,
    },
    {
      _id: new mongoose.Types.ObjectId('662b20000000000000000004'),
      name: 'Admin User',
      email: 'admin@stellara.com',
      role: 'admin',
      orgId: org._id,
      active: true,
    },
    {
      _id: new mongoose.Types.ObjectId('662b20000000000000000005'),
      name: 'Guest Viewer',
      email: 'viewer@stellara.com',
      role: 'viewer',
      orgId: org._id,
      active: true,
    },
    // Acme demo aliases for cross-compatibility with UI demo buttons
    {
      _id: new mongoose.Types.ObjectId('662b20000000000000000011'),
      name: 'Priya Sharma (Acme)',
      email: 'priya@acme.com',
      role: 'creator',
      orgId: org._id,
      active: true,
    },
    {
      _id: new mongoose.Types.ObjectId('662b20000000000000000012'),
      name: 'Elena Rostova',
      email: 'elena@acme.com',
      role: 'manager',
      orgId: org._id,
      active: true,
    },
    {
      _id: new mongoose.Types.ObjectId('662b20000000000000000013'),
      name: 'Marcus Lee',
      email: 'marcus@acme.com',
      role: 'manager',
      orgId: org._id,
      active: true,
    },
    {
      _id: new mongoose.Types.ObjectId('662b20000000000000000014'),
      name: 'Ava Admin',
      email: 'admin@acme.com',
      role: 'admin',
      orgId: org._id,
      active: true,
    },
    {
      _id: new mongoose.Types.ObjectId('662b20000000000000000015'),
      name: 'Sam Auditor',
      email: 'audit@acme.com',
      role: 'viewer',
      orgId: org._id,
      active: true,
    },
  ];

  // Demo password map — any of these passwords work for the matching user
  const DEMO_PASSWORDS = {
    'priya@stellara.com':    'creator123',
    'marcus@stellara.com':   'manager123',
    'reviewer@stellara.com': 'reviewer123',
    'admin@stellara.com':    'admin1234',
    'viewer@stellara.com':   'viewer123',
    'priya@acme.com':        'creator123',
    'elena@acme.com':        'manager123',
    'marcus@acme.com':       'owner123',
    'admin@acme.com':        'admin1234',
    'audit@acme.com':        'viewer123',
  };

  const seededUsers = {};
  for (const u of userDefs) {
    let user = await User.findOne({ email: u.email });
    if (!user) {
      user = new User(u);
      const pwd = DEMO_PASSWORDS[u.email];
      if (pwd) await user.setPassword(pwd);
      await user.save();
      console.log(`[seed] Created user: ${user.name} <${user.email}> [${user.role}]`);
    } else if (!user.passwordHash) {
      // Backfill password for existing users that had no password set
      const pwd = DEMO_PASSWORDS[u.email];
      if (pwd) {
        await user.setPassword(pwd);
        await user.save();
        console.log(`[seed] Backfilled password for: ${user.email}`);
      }
    }
    seededUsers[u.role] = user;
  }

  // 3. Seed Source Document (Stellara Returns Policy v4)
  let source = await Source.findOne({ orgId: org._id, fileName: 'Stellara_Returns_Policy_v4.pdf' });
  const policyText = [
    'Customers may return eligible items within 30 days of the delivery date.',
    'No comparison to competitor return policies has been independently validated.',
    'The policy does not guarantee superiority over any other retailer.',
    'As of Q1 2026 the standard return window is 30 days.',
    'Prior policy documents referencing a 14-day window are superseded.',
    'Returns are processed free of charge with no hidden fees.',
  ].join(' ');

  if (!source) {
    source = new Source({
      _id: new mongoose.Types.ObjectId('662b30000000000000000001'),
      orgId: org._id,
      title: 'Stellara Returns Policy v4',
      fileName: 'Stellara_Returns_Policy_v4.pdf',
      type: 'guideline',
      version: '4.0',
      ownerName: 'Compliance and Legal',
      owner: seededUsers.admin?._id,
      status: 'ready',
      effectiveDate: new Date('2026-01-01'),
      expiryDate: new Date('2027-06-30'),
      storageRef: `sources/${org._id}/Stellara_Returns_Policy_v4.pdf`,
      fileHash: sha256(policyText),
      fileSize: 102400,
      parsedSections: [
        {
          page: 3,
          heading: 'Superlatives & Comparisons',
          content: 'Customers may return eligible items within 30 days of the delivery date. No comparison to competitor return policies has been independently validated. The policy does not guarantee superiority over any other retailer.',
        },
        {
          page: 5,
          heading: 'Standard Return Window',
          content: 'As of Q1 2026 the standard return window is 30 days. Prior policy documents referencing a 14-day window are superseded. Returns are processed free of charge with no hidden fees.',
        },
      ],
    });
    await source.save();
    console.log(`[seed] Created Source: "${source.title}" (v${source.version})`);
  }

  // 4. Seed Facts
  const factDefs = [
    {
      orgId: org._id,
      label: 'Standard Return Window',
      statement: 'As of Q1 2026 the standard return window is 30 days.',
      category: 'compliance',
      status: 'active',
      expiresAt: new Date('2027-06-30'),
      sourceRef: 'Stellara_Returns_Policy_v4.pdf (Page 5)',
      ownerId: seededUsers.admin?._id,
    },
    {
      orgId: org._id,
      label: 'Zero Return Fees',
      statement: 'Returns are processed free of charge with no hidden fees.',
      category: 'pricing',
      status: 'active',
      expiresAt: new Date('2027-06-30'),
      sourceRef: 'Stellara_Returns_Policy_v4.pdf (Page 5)',
      ownerId: seededUsers.admin?._id,
    },
  ];

  for (const f of factDefs) {
    const existingFact = await Fact.findOne({ orgId: org._id, label: f.label });
    if (!existingFact) {
      const fact = new Fact(f);
      await fact.save();
      console.log(`[seed] Created Fact: "${fact.label}"`);
    }
  }

  // 5. Seed Demo Draft & Version 1
  const draftContent = [
    'Stellara Brands offers the best returns policy in the market, giving customers total peace of mind.',
    'Our 14-day return window is designed to be fair and hassle-free.',
    'Returns are processed free of charge with no hidden fees.',
    'Simply contact our support team within 14 days of delivery.',
  ].join(' ');

  let draft = await Draft.findOne({ orgId: org._id, title: 'Stellara Brands Returns Policy Draft' });
  if (!draft) {
    draft = new Draft({
      _id: new mongoose.Types.ObjectId('662b40000000000000000001'),
      orgId: org._id,
      title: 'Stellara Brands Returns Policy Draft',
      format: 'text',
      status: 'checked',
      author: seededUsers.creator?._id,
      intent: {
        purpose: 'Customer email announcement',
        audience: 'Existing & prospective retail customers',
        mustSay: ['peace of mind', 'fair and hassle-free'],
      },
    });
    await draft.save();

    const v1 = new DraftVersion({
      _id: new mongoose.Types.ObjectId('662b50000000000000000001'),
      draftId: draft._id,
      orgId: org._id,
      versionNumber: 1,
      content: draftContent,
      contentHash: sha256(draftContent),
      diff: '',
    });
    await v1.save();
    console.log(`[seed] Created Draft & v1: "${draft.title}" (hash: ${v1.contentHash.slice(0, 12)}…)`);

    // 6. Seed the 3 Demo Findings
    const findingsData = [
      {
        draftId: draft._id,
        draftVersionId: v1._id,
        orgId: org._id,
        index: 1,
        total: 3,
        type: 'violation',
        ruleId: 'rule.superlative.unqualified',
        verdict: 'Contradicted',
        confidence: 0.94,
        draftSpan: 'best returns policy in the market',
        draftContext: 'Stellara Brands offers the best returns policy in the market, giving customers total peace of mind.',
        proof: {
          fileName: 'Stellara_Returns_Policy_v4.pdf',
          page: 3,
          version: '4.0',
          expiryDate: '2027-06-30',
          ownerName: 'Compliance and Legal',
          passage: 'Customers may return eligible items within 30 days of the delivery date. No comparison to competitor return policies has been independently validated.',
        },
        reason: 'The source states no comparison to competitor policies has been validated and does not support a "best" superlative claim.',
        suggestedFix: 'We offer a 30-day returns policy, giving customers total peace of mind.',
        meaningCheck: {
          kept: ['peace of mind'],
          changed: ['"best returns policy in the market" → "30-day returns policy"'],
          dropped: [],
        },
        status: 'open',
      },
      {
        draftId: draft._id,
        draftVersionId: v1._id,
        orgId: org._id,
        index: 2,
        total: 3,
        type: 'violation',
        ruleId: 'rule.date.outdated',
        verdict: 'Outdated',
        confidence: 0.89,
        draftSpan: '14-day return window',
        draftContext: 'Our 14-day return window is designed to be fair and hassle-free.',
        proof: {
          fileName: 'Stellara_Returns_Policy_v4.pdf',
          page: 5,
          version: '4.0',
          expiryDate: '2027-06-30',
          ownerName: 'Compliance and Legal',
          passage: 'As of Q1 2026 the standard return window is 30 days. Prior policy documents referencing a 14-day window are superseded.',
        },
        reason: 'The draft states a 14-day window. The uploaded source (v4.0, Q1 2026) confirms this was updated to 30 days.',
        suggestedFix: 'Our 30-day return window is designed to be fair and hassle-free.',
        meaningCheck: {
          kept: ['hassle-free', 'fair'],
          changed: ['14-day → 30-day'],
          dropped: [],
        },
        status: 'open',
      },
      {
        draftId: draft._id,
        draftVersionId: v1._id,
        orgId: org._id,
        index: 3,
        total: 3,
        type: 'violation',
        ruleId: 'rule.cost.claim',
        verdict: 'Supported',
        confidence: 0.97,
        draftSpan: 'free of charge with no hidden fees',
        draftContext: 'Returns are processed free of charge with no hidden fees.',
        proof: {
          fileName: 'Stellara_Returns_Policy_v4.pdf',
          page: 5,
          version: '4.0',
          expiryDate: '2027-06-30',
          ownerName: 'Compliance and Legal',
          passage: 'Returns are processed free of charge with no hidden fees.',
        },
        reason: 'The claim "free of charge with no hidden fees" is directly supported by the uploaded Stellara returns policy.',
        suggestedFix: '',
        meaningCheck: {
          kept: ['free of charge', 'no hidden fees'],
          changed: [],
          dropped: [],
        },
        status: 'open',
      },
    ];

    for (const f of findingsData) {
      if (!f.span && f.draftSpan) {
        const start = draftContent.indexOf(f.draftSpan);
        f.span = {
          start: start >= 0 ? start : 0,
          end: start >= 0 ? start + f.draftSpan.length : f.draftSpan.length,
        };
      }
      const finding = new Finding(f);
      await finding.save();
    }
    console.log(`[seed] Created 3 seeded findings for draft "${draft.title}"`);
  }

  console.log('[seed] Seeding completed successfully ✓');
  return { success: true, org, users: seededUsers, source, draft };
}

async function seedDemoDataIfEmpty() {
  try {
    const userCount = await User.countDocuments();
    if (userCount === 0) {
      console.log('[seed] Database is empty. Running initial demo seed…');
      await seedDemoData();
    }
  } catch (err) {
    console.warn('[seed] Auto-seed check failed (non-fatal):', err.message);
  }
}

// Standalone execution: node src/utils/seed.js
if (require.main === module) {
  (async () => {
    try {
      console.log('[seed] Connecting to MongoDB…');
      await connectDB();
      await seedDemoData({ force: process.argv.includes('--force') });
      await mongoose.disconnect();
      console.log('[seed] Done.');
      process.exit(0);
    } catch (err) {
      console.error('[seed] Fatal error:', err);
      process.exit(1);
    }
  })();
}

module.exports = {
  seedDemoData,
  seedDemoDataIfEmpty,
  STELLARA_ORG_ID,
  sha256,
};
