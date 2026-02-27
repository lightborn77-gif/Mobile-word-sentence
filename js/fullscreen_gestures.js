/* =========================================================
 * Fullscreen Gestures (bindings)
 * Refactor: split from legacy/fullscreen.js
 * Generated: 2026-02-11
 * ========================================================= */
card.addEventListener('touchstart', (e) => {
            touchStartX = e.touches[0].clientX;
            touchStartTime = Date.now();

            __lpTriggered = false;
            try { (window.App && App.Timers ? App.Timers.clearTimeout(__lpTimer) : clearTimeout(__lpTimer)); } catch(e) { try{clearTimeout(__lpTimer);}catch(_){} }

            // 롱프레스는 풀스크린에서만 활성
            if (document.body.classList.contains('study-fullscreen')) {
                __lpTimer = (window.App && App.Timers ? App.Timers.setTimeout : setTimeout)(() => {
                    __lpTriggered = true;
                    __showFsModeBar();
                }, 380);
            }
        });

        card.addEventListener('touchend', (e) => {
            // 롱프레스가 발생했으면: 기존 더블탭/스와이프 동작을 막고 종료
            if (__lpTimer) {
                try { (window.App && App.Timers ? App.Timers.clearTimeout(__lpTimer) : clearTimeout(__lpTimer)); } catch(e) { try{clearTimeout(__lpTimer);}catch(_){} }
                __lpTimer = null;
            }
            if (__lpTriggered) {
                __lpTriggered = false;
                e.preventDefault();
                return;
            }

            const touchEndX = e.changedTouches[0].clientX;
            const touchEndTime = Date.now();
            
            const diffX = touchEndX - touchStartX;
            const diffTime = touchEndTime - touchStartTime;
            
            // 더블탭
            if (Math.abs(diffX) < 10 && diffTime < 300) {
                if (touchEndTime - lastTapTime < 300) {
                    toggleMem();
                }
                lastTapTime = touchEndTime;
            }
            
            // 스와이프
            if (Math.abs(diffX) > 50 && diffTime < 500) {
                if (diffX > 0) {
                    nextWord();
                } else {
                    prevWord();
                }
            }
        });

        // 🎤 TTS 음성 목록 로드
// ---------------------------------------------------------
// toggleStudyFullscreen
// ---------------------------------------------------------

        
