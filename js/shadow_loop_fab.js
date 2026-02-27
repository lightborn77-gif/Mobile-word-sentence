/* =========================================================
 * Main engine flow (start/stop/next/prev/modes)
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ========================================================= */


// ---------------------------------------------------------
// selectMode
// ---------------------------------------------------------

function syncShadowLoopFloatingBtn() {
            const btn = document.getElementById('shadowLoopFloatingBtn');
            const cb = document.getElementById('shadowLoop');
            if (!btn || !cb) return;
            const on = !!cb.checked;
            btn.classList.toggle('on', on);
            btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        }

function refreshShadowLoopFloatingVisibility() {
            const btn = document.getElementById('shadowLoopFloatingBtn');
            if (!btn) return;
            const sh = document.getElementById('shadowingMode');
            const enabled = (currentMode === 'dialog') && !!(sh && sh.checked) && !!isRunning;
            btn.style.display = enabled ? 'flex' : 'none';
        }

function toggleShadowLoopFloating() {
            const cb = document.getElementById('shadowLoop');
            if (!cb) return;
            cb.checked = !cb.checked;
            syncShadowLoopFloatingBtn();
        }

        // 팝업 제어
// ---------------------------------------------------------
// restartFromBeginning
// ---------------------------------------------------------
