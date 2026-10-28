export const MOCK_COMMENTS = [
  {
    _id: 'c1',
    authorName: 'Priya Mehta',
    authorRole: 'manager',
    text: 'The superlative claim needs to be removed before I can approve.',
    type: 'changes-requested',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    _id: 'c2',
    authorName: 'Rohan Das',
    authorRole: 'creator',
    text: 'Updated the copy — removed "best returns policy" and corrected the 14-day window.',
    type: 'comment',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    _id: 'c3',
    authorName: 'Priya Mehta',
    authorRole: 'manager',
    text: 'Priya Mehta approved this draft.',
    type: 'approved',
    createdAt: new Date(Date.now() - 900000).toISOString(),
  },
];

export const MOCK_VERSIONS = [
  { _id: 'v1', version: 1, status: 'draft', authorName: 'Rohan Das', createdAt: new Date(Date.now() - 7200000).toISOString(), diff: null },
  { _id: 'v2', version: 2, status: 'in-review', authorName: 'Rohan Das', createdAt: new Date(Date.now() - 3600000).toISOString(), diff: [
    { type: 'removed', text: 'We offer the best returns policy in India, giving customers peace of mind.' },
    { type: 'added',   text: 'We offer a 30-day returns policy, giving customers peace of mind.' },
    { type: 'removed', text: 'Our 14-day return window is designed to be fair and hassle-free.' },
    { type: 'added',   text: 'Our 30-day return window is designed to be fair and hassle-free.' },
    { type: 'unchanged', text: 'Returns are processed free of charge with no hidden fees.' },
  ]},
  { _id: 'v3', version: 3, status: 'approved', authorName: 'Priya Mehta', createdAt: new Date(Date.now() - 900000).toISOString(), diff: null },
];
