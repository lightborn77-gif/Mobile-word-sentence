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

function selectMode(mode, ev, btnEl) {
            currentMode = mode;
            // stopApp() touches many DOM ids; keep mode switching resilient.
            try { stopApp(); } catch (e) { console.warn('[selectMode] stopApp error ignored:', e); }
            
            // Update mode button highlight robustly (do not rely on event object).
            // Update mode-btn highlight
            document.querySelectorAll('.mode-btn').forEach(btn => {
                btn.classList.toggle('active', (btn.getAttribute('data-mode') === mode));
            });
            // Fullscreen quick modebar buttons (optional highlight)
            document.querySelectorAll('.fs-modebtn').forEach(btn => {
                btn.classList.toggle('active', (btn.getAttribute('data-mode') === mode));
            });
            
            document.getElementById('studyControls').style.display = 'none';
            document.getElementById('quizControls').style.display = 'none';
            document.getElementById('srsControls').style.display = 'none';
            document.getElementById('dialogControls').style.display = 'none';
            
            if (mode === 'study') {
                document.getElementById('studyControls').style.display = 'flex';
            } else if (mode === 'quiz') {
                document.getElementById('quizControls').style.display = 'flex';
            } else if (mode === 'srs') {
                document.getElementById('srsControls').style.display = 'flex';
            } else if (mode === 'dialog') {
                document.getElementById('dialogControls').style.display = 'flex';
            }

            // 🔁 쉐도잉 반복 플로팅 버튼 상태/표시 업데이트
            try { refreshShadowLoopFloatingVisibility(); } catch (e) { /* ignore */ }
            try { syncShadowLoopFloatingBtn(); } catch (e) { /* ignore */ }
            
            try { updateDisplay(); } catch (e) { console.warn('[selectMode] updateDisplay error ignored:', e); }
        }

        // ---------------------------------------------------------
        // Shadowing loop floating button helpers (mobile UX)
        // ---------------------------------------------------------

