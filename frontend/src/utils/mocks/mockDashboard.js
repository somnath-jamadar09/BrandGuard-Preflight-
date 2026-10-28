export const SAMPLE_DRAFTS = [
  {
    _id: 'draft-stellara-01',
    title: 'Stellara Returns Policy & Warranty Update',
    format: 'pdf',
    status: 'in-review',
    updatedAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    owner: { name: 'Priya Sharma', email: 'priya@stellara.com' },
  },
  {
    _id: 'draft-stellara-02',
    title: 'Project Nova Product Launch Announcement',
    format: 'docx',
    status: 'draft',
    updatedAt: new Date(Date.now() - 1000 * 60 * 120).toISOString(),
    owner: { name: 'Priya Sharma', email: 'priya@stellara.com' },
  },
  {
    _id: 'draft-stellara-03',
    title: 'Spring 2026 Skincare Ingredient Factsheet',
    format: 'text',
    status: 'approved',
    passportId: 'pass-stellara-03',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    owner: { name: 'Marcus Vance', email: 'marcus@stellara.com' },
  },
  {
    _id: 'draft-stellara-04',
    title: 'Q2 Promotional Email Blast — Claims Verification',
    format: 'markdown',
    status: 'blocked',
    updatedAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    owner: { name: 'Aisha Patel', email: 'aisha@stellara.com' },
  },
];

export const SAMPLE_MISTAKES = [
  {
    category: 'Unqualified superlative claim',
    count: 14,
    topExample: 'Stellara Brands offers the best returns policy in the market, giving customers total peace of mind.',
  },
  {
    category: 'Contradicted temporal claim',
    count: 9,
    topExample: 'Our 14-day return window is designed to be fair and hassle-free.',
  },
  {
    category: 'Unverified cost claim',
    count: 6,
    topExample: 'Returns are processed free of charge with zero restocking fees.',
  },
  {
    category: 'Substantiation absence',
    count: 4,
    topExample: 'Independently tested by top consumer labs with highest customer satisfaction ratings.',
  },
];

export const SAMPLE_RULES = [
  {
    ruleId: 'rule.superlative.unqualified',
    description: 'Comparative superlatives must specify a verified benchmark or qualify scope.',
    count: 18,
    suggestedRewording:
      'We offer an industry-aligned 30-day return window, giving customers peace of mind.',
  },
  {
    ruleId: 'rule.date.outdated',
    description: 'Return duration cannot reference superseded 14-day policy.',
    count: 11,
    suggestedRewording:
      'Our 30-day return window applies to all eligible purchases.',
  },
  {
    ruleId: 'rule.cost.claim',
    description: 'Free-of-charge claims require citing active shipping & returns fee schedule.',
    count: 7,
    suggestedRewording:
      'Free return phrasing is allowed only for domestic orders with original packaging intact.',
  },
];

export const SAMPLE_SOURCES = [
  {
    _id: 'source-stellara-01',
    fileName: 'Stellara_Returns_Policy_v4.pdf',
    title: 'Stellara Returns Policy & Guidelines v4.0',
    type: 'guideline',
    version: '4.0',
    ownerName: 'Elena Rostova',
    status: 'ready',
    fileSize: 102400,
    effectiveDate: '2026-01-01T00:00:00.000Z',
    expiryDate: '2026-12-31T23:59:59.000Z',
  },
  {
    _id: 'source-stellara-02',
    fileName: 'Stellara_Brand_Glossary_2026.docx',
    title: 'Stellara Brand Glossary & Terminology 2026',
    type: 'glossary',
    version: '2.1',
    ownerName: 'Marcus Vance',
    status: 'ready',
    fileSize: 54200,
    effectiveDate: '2026-01-15T00:00:00.000Z',
    expiryDate: '2026-12-31T23:59:59.000Z',
  },
  {
    _id: 'source-stellara-03',
    fileName: 'Skincare_Ingredients_FactSheet.pdf',
    title: 'Spring 2026 Skincare Ingredient Specifications',
    type: 'fact-sheet',
    version: '1.0',
    ownerName: 'Priya Sharma',
    status: 'ready',
    fileSize: 81920,
    effectiveDate: '2026-02-01T00:00:00.000Z',
    expiryDate: '2027-02-01T00:00:00.000Z',
  },
];
