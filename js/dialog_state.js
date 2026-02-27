/* =========================================================
 * Dialog State (shared helpers)
 * Refactor: split from legacy/dialog_shadow.js
 * Generated: 2026-02-11
 * ========================================================= */

function loopEnabled() {
                const el = document.getElementById('shadowLoop');
                return el ? el.checked : false;
            }

function ensurePair() {
                if (pairBase < 0) pairBase = 0;
                if (pairBase >= dialogScript.length) return false;
                return !!(dialogScript[pairBase] && dialogScript[pairBase + 1]);
            }
