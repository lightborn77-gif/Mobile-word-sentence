/* =========================================================
 * UI Bindings (event wiring)
 * Refactor: split from legacy/ui_settings.js
 * Generated: 2026-02-11
 * ========================================================= */

/**
 * Some UI uses inline onclick in HTML. This file wires only the parts
 * that should be safe to attach programmatically.
 */
function initUIBindings(){
  // Keep idempotent.
  const root = document.documentElement;
  if (root.getAttribute('data-ui-bound') === '1') return;
  root.setAttribute('data-ui-bound', '1');

  // Example: Enter key in range inputs triggers applyRange
  const start = document.getElementById('startIdx');
  const end = document.getElementById('endIdx');
  const onKey = (e) => {
    if (e.key === 'Enter') {
      try { applyRange(); } catch(err){}
    }
  };
  if (start) start.addEventListener('keydown', onKey);
  if (end) end.addEventListener('keydown', onKey);
}

document.addEventListener('DOMContentLoaded', () => {
  try { initUIBindings(); } catch(e){}
});
