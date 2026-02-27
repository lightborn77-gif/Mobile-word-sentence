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

function toggleMem() {
            const p = isRunning ? currentPool : (currentMode === 'srs' ? getSRSItems() : getFiltered());
            const it = p[currentIndex];
            if (it) {
                it.m = !it.m;
                if (currentMode === 'srs') updateSRS(it, it.m);
                saveLocal();
                updateDisplay();
            }
        }
// ---------------------------------------------------------
// toggleStar
// ---------------------------------------------------------

function toggleStar() {
            const p = isRunning ? currentPool : (currentMode === 'srs' ? getSRSItems() : getFiltered());
            const it = p[currentIndex];
            if (it) {
                it.star = !it.star;
                saveLocal();
                updateDisplay();
            }
        }

        // 저장/불러오기
