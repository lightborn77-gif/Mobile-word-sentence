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

function prevWord() {
            // 🗣️ 회화 모드
            if (currentMode === 'dialog') {
                if (currentIndex > 0) {
                    currentIndex--;
                    updateDisplay();
                }
                return;
            }
            
            // 기존 단어장 모드
            const p = isRunning ? currentPool : (currentMode === 'srs' ? getSRSItems() : getFiltered());
            if (p.length === 0) return;
            currentIndex = (currentIndex - 1 + p.length) % p.length;
            updateDisplay();
        }
// ---------------------------------------------------------
// nextWord
// ---------------------------------------------------------

function nextWord() {
            // 🗣️ 회화 모드
            if (currentMode === 'dialog') {
                if (isRunning) {
                    nextDialogLine();
                } else {
                    if (currentIndex < dialogScript.length - 1) {
                        currentIndex++;
                        updateDisplay();
                    }
                }
                return;
            }
            
            // 기존 단어장 모드
            const p = isRunning ? currentPool : (currentMode === 'srs' ? getSRSItems() : getFiltered());
            if (p.length === 0) return;
            
            if (currentMode === 'srs' && isRunning) {
                const it = p[currentIndex];
                if (it.m) updateSRS(it, true);
            }
            
            currentIndex = (currentIndex + 1) % p.length;
            if (isRunning) logStudy(1);
            updateDisplay();
        }

        // 외움/별표
// ---------------------------------------------------------
// toggleMem
// ---------------------------------------------------------
