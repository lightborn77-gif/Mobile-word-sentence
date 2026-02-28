/* =========================================================
 * UI Handlers (logic + state updates)
 * Refactor: split from legacy/ui_settings.js
 * Generated: 2026-02-11
 * =========================================================
 * UI popups + settings handlers
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ========================================================= */


// ---------------------------------------------------------
// showRangePopup
// ---------------------------------------------------------

        function showRangePopup() {
            uiShowPopup('rangePopup');
        }
// ---------------------------------------------------------
// showSpeedPopup
// ---------------------------------------------------------


        function showSpeedPopup() {
            uiShowPopup('speedPopup');
        }
// ---------------------------------------------------------
// showSizePopup
// ---------------------------------------------------------


        function showSizePopup() {
            uiShowPopup('sizePopup');
        }
// ---------------------------------------------------------
// showReadingPopup
// ---------------------------------------------------------


        function showReadingPopup() {
            uiShowPopup('readingPopup');
        }
// ---------------------------------------------------------
// showQuizSettingsPopup
// ---------------------------------------------------------


        function showQuizSettingsPopup() {
            uiShowPopup('quizSettingsPopup');
        }
// ---------------------------------------------------------
// showFilterPopup
// ---------------------------------------------------------


        function showFilterPopup() {
            uiShowPopup('filterPopup');
        }
// ---------------------------------------------------------
// showSRSSettingsPopup
// ---------------------------------------------------------


        function showSRSSettingsPopup() {
            uiShowPopup('srsSettingsPopup');
        }
// ---------------------------------------------------------
// showDialogSettingsPopup
// ---------------------------------------------------------

        
        function showDialogSettingsPopup() {
            uiShowPopup('dialogSettingsPopup');
        }
// ---------------------------------------------------------
// showTTSSettingsPopup
// ---------------------------------------------------------

        
        function showTTSSettingsPopup() {
            uiShowPopup('ttsSettingsPopup');
        }
// ---------------------------------------------------------
// showMenu
// ---------------------------------------------------------


        function showMenu() {
            uiShowPopup('menuPopup');
        }
// ---------------------------------------------------------
// closePopup
// ---------------------------------------------------------


        function closePopup(id) {
            uiHidePopup(id);
        }
// ---------------------------------------------------------
// closeModal
// ---------------------------------------------------------


        function closeModal(id) {
            uiHidePopup(id);
        }

        // 범위 설정
// ---------------------------------------------------------
// setRange
// ---------------------------------------------------------

        function setRange(start, end, btn) {
            document.getElementById('startIdx').value = start;
            document.getElementById('endIdx').value = end;
            document.querySelectorAll('#rangePopup .option-btn').forEach(btn => btn.classList.remove('active'));
            if (btn && btn.classList) { btn.classList.add('active'); }
}
// ---------------------------------------------------------
// setRangeAll
// ---------------------------------------------------------


        function setRangeAll(btn) {
            document.getElementById('startIdx').value = 1;
            document.getElementById('endIdx').value = vocabulary.length || 300;
            document.querySelectorAll('#rangePopup .option-btn').forEach(btn => btn.classList.remove('active'));
            if (btn && btn.classList) { btn.classList.add('active'); }
}
// ---------------------------------------------------------
// applyRange
// ---------------------------------------------------------


        function applyRange() {
            const start = document.getElementById('startIdx').value;
            const end = document.getElementById('endIdx').value;
            uiUpdateRangeLabels(start, end);
            closePopup('rangePopup');
            if (!isRunning) updateDisplay();
        }

        // 속도 설정
// ---------------------------------------------------------
// setSpeed
// ---------------------------------------------------------

        function setSpeed(speed) {
            settings.speed = speed;
            const _t = (typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']) || {};
            const text = speed === 1.0 ? (_t.fast || '빠름') : speed === 2.0 ? (_t.normal || '보통') : (_t.slow || '느림');
            document.getElementById('speedText').textContent = text;
            // 모든 버튼 비활성화
            document.getElementById('speedFast').classList.remove('active');
            document.getElementById('speedNormal').classList.remove('active');
            document.getElementById('speedSlow').classList.remove('active');
            // 선택된 버튼만 활성화
            if (speed === 1.0) {
                document.getElementById('speedFast').classList.add('active');
            } else if (speed === 2.0) {
                document.getElementById('speedNormal').classList.add('active');
            } else if (speed === 3.0) {
                document.getElementById('speedSlow').classList.add('active');
            }
            closePopup('speedPopup');
        }

        // 크기 설정
// ---------------------------------------------------------
// updateFontSize
// ---------------------------------------------------------

        function updateFontSize(size) {
            settings.fontSize = parseInt(size);
            uiUpdateFontSize(size);
        }

        // 퀴즈 문항수
// ---------------------------------------------------------
// adjustQuizCount
// ---------------------------------------------------------

        function adjustQuizCount(delta) {
            const maxCount = vocabulary.length > 0 ? vocabulary.length : 100;
            settings.quizCount = Math.max(5, Math.min(maxCount, settings.quizCount + delta));
            uiUpdateQuizCountLabel(settings.quizCount);
        }
// ---------------------------------------------------------
// setQuizCount
// ---------------------------------------------------------


        function setQuizCount(count, btn) {
            const maxCount = vocabulary.length > 0 ? vocabulary.length : 100;
            settings.quizCount = Math.min(count, maxCount);
            uiUpdateQuizCountLabel(settings.quizCount);
            document.querySelectorAll('#quizCountPopup .option-btn').forEach(btn => btn.classList.remove('active'));
            if (btn && btn.classList) { btn.classList.add('active'); }
closePopup('quizCountPopup');
        }

        // 퀴즈 지연 시간 설정
// ---------------------------------------------------------
// setQuizDelay
// ---------------------------------------------------------

        function setQuizDelay(delay) {
            settings.quizDelay = delay;
            // 모든 버튼 비활성화
            document.getElementById('delayFast').classList.remove('active');
            document.getElementById('delayNormal').classList.remove('active');
            document.getElementById('delaySlow').classList.remove('active');
            // 선택된 버튼만 활성화
            if (delay === 0.5) {
                document.getElementById('delayFast').classList.add('active');
            } else if (delay === 1.0) {
                document.getElementById('delayNormal').classList.add('active');
            } else if (delay === 1.5) {
                document.getElementById('delaySlow').classList.add('active');
            }
        }

        // 퀴즈 방향 설정
// ---------------------------------------------------------
// setQuizDirection
// ---------------------------------------------------------

        function setQuizDirection(direction) {
            settings.quizDirection = direction;
            // 모든 버튼 비활성화
            document.getElementById('dirEngToKor').classList.remove('active');
            document.getElementById('dirKorToEng').classList.remove('active');
            document.getElementById('dirMixed').classList.remove('active');
            // 선택된 버튼만 활성화
            if (direction === 'wordToMeaning') {
                document.getElementById('dirEngToKor').classList.add('active');
            } else if (direction === 'meaningToWord') {
                document.getElementById('dirKorToEng').classList.add('active');
            } else if (direction === 'mixed') {
                document.getElementById('dirMixed').classList.add('active');
            }
        }

        // 퀴즈 설정 토글
// ---------------------------------------------------------
// toggleQuizSetting
// ---------------------------------------------------------

        function toggleQuizSetting(type) {
            if (type === 'hint') {
                settings.quizHint = !settings.quizHint;
                document.getElementById('quizHint').classList.toggle('checked');
            } else if (type === 'shuffle') {
                settings.quizShuffle = !settings.quizShuffle;
                document.getElementById('quizShuffle').classList.toggle('checked');
            } else if (type === 'wrongRevive') {
                settings.wrongRevive = !settings.wrongRevive;
                document.getElementById('quizWrongRevive').classList.toggle('checked');
                clearCache();
            }
        }

        // 필터 토글
// ---------------------------------------------------------
// toggleFilter
// ---------------------------------------------------------

        function toggleFilter(type) {
            settings[type] = !settings[type];
            const checkbox = document.getElementById('filter' + type.charAt(0).toUpperCase() + type.slice(1));
            if (checkbox) checkbox.classList.toggle('checked');
            
            // 필터가 바뀌면 캐시 클리어
            if (['unmem', 'star', 'safe'].includes(type)) {
                clearCache();
            }
            
            if (!isRunning) updateDisplay();
        }

        // SRS 필터 토글
// ---------------------------------------------------------
// toggleSRSFilter
// ---------------------------------------------------------

        function toggleSRSFilter(type) {
            settings[type] = !settings[type];
            const checkbox = document.getElementById(type);
            checkbox.classList.toggle('checked');
        }

        // SRS 간격 배율 설정
// ---------------------------------------------------------
// setEaseMode
// ---------------------------------------------------------

        function setEaseMode(ease) {
            settings.easeMode = ease;
            // 모든 버튼 비활성화
            document.getElementById('easeFast').classList.remove('active');
            document.getElementById('easeNormal').classList.remove('active');
            document.getElementById('easeSlow').classList.remove('active');
            // 선택된 버튼만 활성화
            if (ease === 2.0) {
                document.getElementById('easeFast').classList.add('active');
            } else if (ease === 2.5) {
                document.getElementById('easeNormal').classList.add('active');
            } else if (ease === 3.0) {
                document.getElementById('easeSlow').classList.add('active');
            }
        }

        // SRS 실패 감소율 설정
// ---------------------------------------------------------
// setLapseMode
// ---------------------------------------------------------

        function setLapseMode(lapse) {
            settings.lapseMode = lapse;
            // 모든 버튼 비활성화
            document.getElementById('lapseReset').classList.remove('active');
            document.getElementById('lapse20').classList.remove('active');
            document.getElementById('lapse50').classList.remove('active');
            // 선택된 버튼만 활성화
            if (lapse === 0.0) {
                document.getElementById('lapseReset').classList.add('active');
            } else if (lapse === 0.2) {
                document.getElementById('lapse20').classList.add('active');
            } else if (lapse === 0.5) {
                document.getElementById('lapse50').classList.add('active');
            }
        }
        
        // 오답 복습 기준일 설정
// ---------------------------------------------------------
// setWrongDays
// ---------------------------------------------------------

        function setWrongDays(days) {
            settings.wrongDays = days;
            // 입력 필드도 업데이트
            const input = document.getElementById('wrongDaysInput');
            if (input) input.value = days;
            // 모든 버튼 비활성화
            ['wrongDays3', 'wrongDays7', 'wrongDays14', 'wrongDays30'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.classList.remove('active');
            });
            // 선택된 버튼만 활성화
            const selectedBtn = document.getElementById(`wrongDays${days}`);
            if (selectedBtn) selectedBtn.classList.add('active');
            clearCache();
        }
        
        // 입력 필드에서 직접 일수 설정
// ---------------------------------------------------------
// setWrongDaysFromInput
// ---------------------------------------------------------

        function setWrongDaysFromInput() {
            const input = document.getElementById('wrongDaysInput');
            if (input) {
                let days = parseInt(input.value);
                if (days < 1) days = 1;
                if (days > 365) days = 365;
                input.value = days;
                settings.wrongDays = days;
                
                // 버튼 활성화 해제 (커스텀 값이므로)
                ['wrongDays3', 'wrongDays7', 'wrongDays14', 'wrongDays30'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.classList.remove('active');
                });
                
                // 만약 프리셋 값이면 해당 버튼 활성화
                if ([3, 7, 14, 30].includes(days)) {
                    const btn = document.getElementById(`wrongDays${days}`);
                    if (btn) btn.classList.add('active');
                }
                
                clearCache();
            }
        }
        
        // 💡 캐시 클리어 함수
// ---------------------------------------------------------
// showManualAnswer
// ---------------------------------------------------------

        function showManualAnswer() {
            if (!isRunning || window.readingStep === undefined) return;
            
            // 문제 표시 상태(step=0)일 때만 답을 보여줌
            if (window.readingStep === 0) {
                window.readingStep = 1;
                updateDisplay();
            }
        }
        
        // 🔍 독해/영작 모드 실행 (모바일)