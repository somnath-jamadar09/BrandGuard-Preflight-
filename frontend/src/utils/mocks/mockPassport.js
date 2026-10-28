export const MOCK_PASSPORT = {
  _id: 'pp-mock-1',
  assetName: 'Campaign Draft — Oct 2025',
  draftId: 'draft-mock-1',
  createdAt: new Date(Date.now() - 3600000).toISOString(),
  rulesVersion: '2.4.1',
  aiUsed: true,
  contentHash: 'a3f8b2c1d9e47f6b8a0c2d5e9f1b3a7c4d6e8f0a2b4c6d8e0f2a4b6c8d0e2f4',
  checksRun: [
    'Banned term detection',
    'Unqualified superlative check',
    'NLI entailment against uploaded sources',
    'Claim shelf-life verification',
    'Alt-text absence check',
    'Entity watch-list scan',
  ],
  approvers: [
    { name: 'Priya Mehta', role: 'manager' },
  ],
};
