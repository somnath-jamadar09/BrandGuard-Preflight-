const mongoose = require('mongoose');
const Source = require('../models/Source');

function snapshot(claim, source) {
  const evidence = claim.evidence || {};
  return {
    passageId: evidence.passageId || null,
    sourceId: source?._id ? String(source._id) : null,
    fileName: source?.fileName || evidence.fileName || '',
    page: evidence.page ?? null,
    version: source?.version || evidence.version || '',
    expiryDate: source?.expiryDate || evidence.expiryDate || null,
    ownerName: source?.ownerName || evidence.ownerName || '',
    passage: evidence.passage || '',
  };
}

async function findSource(filter) {
  const query = Source.findOne(filter);
  return typeof query.lean === 'function' ? query.lean() : query;
}


async function resolveFindingEvidence({ claim, orgId, demoMode = process.env.DEMO_MODE === 'true' }) {
  if (!claim?.proofPassageId || !claim.evidence) {
    return { proofPassageId: null, evidence: null };
  }

  if (mongoose.Types.ObjectId.isValid(claim.proofPassageId)) {
    const source = await findSource({ _id: claim.proofPassageId, orgId });
    if (source) {
      return { proofPassageId: source._id, evidence: snapshot(claim, source) };
    }
  }

  if (!demoMode) {
    return { proofPassageId: null, evidence: null };
  }

  const evidence = claim.evidence;
  const storageRef = `demo://brandguard/${evidence.passageId}`;
  let source = await findSource({ orgId, storageRef });
  if (!source) {
    source = await Source.create({
      orgId,
      fileName: evidence.fileName || 'Stellara synthetic source',
      storageRef,
      fileSize: 0,
      mimeType: 'application/pdf',
      type: 'guideline',
      ownerName: evidence.ownerName || 'BrandGuard demo fixture',
      version: evidence.version || '1.0',
      expiryDate: evidence.expiryDate || null,
      status: 'active',
    });
  }
  return { proofPassageId: source._id, evidence: snapshot(claim, source) };
}

module.exports = { resolveFindingEvidence, snapshot };
