export const isMockEnabled = () =>
  import.meta.env.VITE_USE_MOCK_DATA === 'true' ||
  import.meta.env.VITE_USE_MOCK_FINDINGS === 'true' ||
  import.meta.env.VITE_REVIEW_USE_MOCK === 'true';

export const USE_MOCK = isMockEnabled();
