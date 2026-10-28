import axe from 'axe-core';

export function initA11yAuditor() {
  if (typeof window === 'undefined') return;

  const runAudit = () => {
    setTimeout(() => {
      axe.run(document, {
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
        },
      })
        .then((results) => {
          if (results.violations.length > 0) {
            console.groupCollapsed(
              `[a11y] [WARNING] ${results.violations.length} Accessibility Violation(s) Detected`
            );
            results.violations.forEach((v) => {
              console.warn(`[a11y] ${v.id}: ${v.help}`, v.nodes);
            });
            console.groupEnd();
          } else {
            console.log('[a11y] [PASS] WCAG 2.2 AA automated check passed.');
          }
        })
        .catch((err) => {
          console.debug('[a11y] Audit skipped:', err.message);
        });
    }, 1000);
  };

  if (document.readyState === 'complete') {
    runAudit();
  } else {
    window.addEventListener('load', runAudit, { once: true });
  }

  window.addEventListener('popstate', runAudit);
}
