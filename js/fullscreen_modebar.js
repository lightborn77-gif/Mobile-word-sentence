/* =========================================================
 * Fullscreen Mode Bar (render)
 * Refactor: split from legacy/fullscreen.js
 * Generated: 2026-02-11
 * ========================================================= */
/* =========================================================
 * Fullscreen + quick mode bar (long press)
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ========================================================= */


// ---------------------------------------------------------
// __setFsActive
// ---------------------------------------------------------


        
function __setFsActive(mode){
            if (!fsModeBar) return;
            fsModeBar.querySelectorAll('.fs-modebtn').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-mode') === mode);
            });
        }

function __showFsModeBar(){
            if (!fsModeBar) return;
            if (!document.body.classList.contains('study-fullscreen')) return;
            fsModeBar.classList.remove('hidden');
            fsModeBar.setAttribute('aria-hidden', 'false');
            // 현재 모드 강조 (currentMode가 없으면 버튼 강조는 생략)
            try { __setFsActive(window.currentMode || 'study'); } catch(e) {}
            try { (window.App && App.Timers ? App.Timers.clearTimeout(__fsHideTimer) : clearTimeout(__fsHideTimer)); } catch(e) { try{clearTimeout(__fsHideTimer);}catch(_){} }
            __fsHideTimer = (window.App && App.Timers ? App.Timers.setTimeout : setTimeout)(() => {
                fsModeBar.classList.add('hidden');
                fsModeBar.setAttribute('aria-hidden', 'true');
            }, 3000);
        }
