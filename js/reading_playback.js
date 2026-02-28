/* =========================================================
 * Reading mode playback / controls
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ========================================================= */


// ---------------------------------------------------------
// togglePlayPause
// ---------------------------------------------------------

        function togglePlayPause() {
            // 🗣️ 회화 모드는 vocabulary 체크 불필요
            if (currentMode !== 'dialog' && vocabulary.length === 0) {
                alert(UI_TEXT[currentUILang].loadFileFirst);
                return;
            }
            
            // 회화 모드에서 대화 파일 체크
            if (currentMode === 'dialog' && dialogScript.length === 0) {
                alert(UI_TEXT[currentUILang].loadDialogFirst);
                return;
            }
            
            if (isRunning) {
                // 일시정지
                stopApp();
            } else {
                // 🔍 독해/영작 모드 체크
                const readingMode = document.getElementById('readingMode') ? document.getElementById('readingMode').value : 'off';
                
                // 재생 (현재 위치에서)
                if (readingMode !== 'off') {
                    startReading();
                } else if (currentMode === 'quiz') {
                    startQuiz();
                } else if (currentMode === 'dialog') {
                    startApp(); // 회화 모드는 startApp 사용
                } else {
                    // engine_run.js 로드/파싱 실패 등 방어
                    if (typeof continueApp === 'function') continueApp();
                    else if (typeof startApp === 'function') startApp();
                }
            }
        }
        
        // 🔍 독해/영작 모드 UI 업데이트
// ---------------------------------------------------------
// updateReadingMode
// ---------------------------------------------------------

        function updateReadingMode() {
            const mode = document.getElementById('readingMode').value;
            const container = document.getElementById('thinkTimeContainer');
            
            if (mode === 'off') {
                container.style.display = 'none';
            } else {
                container.style.display = 'block';
            }
        }
        
        // 🔍 독해/영작 모드 시작
// ---------------------------------------------------------
// startReading
// ---------------------------------------------------------

        function startReading() {
            const p = currentMode === 'srs' ? getSRSItems() : getFiltered();
            if (p.length === 0) {
                alert(UI_TEXT[currentUILang].noWordsMatch);
                return;
            }
            
            isRunning = true;
            currentPool = p;
            window.readingStep = 0;
            document.getElementById('playPauseBtn').textContent = '⏸';
            
            // 수동 답보기 버튼 표시
            document.getElementById('manualAnswerBtn').style.display = 'block';
            
            // 🔆 화면 꺼짐 방지
            try { WakeLock.acquire(); } catch (e) { /* ignore */ }
            
            runReadingMobile();
        }
        
        // 👁️ 수동 답보기 함수
// ---------------------------------------------------------
// runReadingMobile
// ---------------------------------------------------------

        function runReadingMobile() {
            if (!isRunning || currentIndex >= currentPool.length) {
                stopApp();
                return;
            }
            
            updateDisplay();
            
            const readingMode = document.getElementById('readingMode').value;
            const thinkTime = parseFloat(document.getElementById('thinkTime').value) * 1000;
            const answerTime = parseFloat(document.getElementById('answerTime').value) * 1000; // 설정값 사용
            
            if (window.readingStep === 0) {
                // 문제 표시
                App.Timers.setTimeout(() => {
                    if (!isRunning) return;
                    window.readingStep = 1;
                    runReadingMobile();
                }, thinkTime);
            } else {
                // 답 표시 (설정된 시간)
                App.Timers.setTimeout(() => {
                    if (!isRunning) return;
                    window.readingStep = 0;
                    currentIndex++;
                    logStudy(1);
                    runReadingMobile();
                }, answerTime);
            }
        }

        // 처음부터 시작