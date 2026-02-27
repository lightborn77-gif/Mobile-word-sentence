/* =========================================================
 * I18N + Study Language + TTS Lang helpers
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ========================================================= */


// ---------------------------------------------------------
// toggleLanguage
// ---------------------------------------------------------

        function toggleLanguage() {
            currentUILang = currentUILang === 'ko' ? 'en' : 'ko';
            Storage.set('uiLang', currentUILang);
            updateUILanguage();
        }
        
        // UI 텍스트 업데이트
// ---------------------------------------------------------
// updateUILanguage
// ---------------------------------------------------------

        function updateUILanguage() {
            const text = UI_TEXT[currentUILang];
            document.title = text.title;
            
            // 초기 화면
            const loadFileMessage = document.getElementById('loadFileMessage');
            if (loadFileMessage) loadFileMessage.textContent = text.loadFileMessage;
            
            const fileSelectBtn = document.getElementById('fileSelectBtn');
            if (fileSelectBtn) fileSelectBtn.textContent = text.fileSelectBtn;
            
            // 팝업 타이틀들
            const titles = {
                'titleRange': text.popupRange,
                'titleSpeed': text.popupSpeed,
                'titleSize': text.popupSize,
                'titleQuizSettings': text.popupQuizSettings,
                'titleFilter': text.popupFilter,
                'titleSRS': text.popupSRS,
                'titleDialog': text.popupDialog,
                'titleTTS': text.popupTTS,
                'titleReading': text.popupReading
            };
            for (let id in titles) {
                const el = document.getElementById(id);
                if (el) el.textContent = titles[id];
            }
            
            // 공통 버튼
            const btnAll = document.getElementById('btnAll');
            if (btnAll) btnAll.textContent = text.all;
            
            const btnApply1 = document.getElementById('btnApply1');
            if (btnApply1) btnApply1.textContent = text.apply;
            
            // 속도 텍스트
            const textFast = document.getElementById('textFast');
            if (textFast) textFast.textContent = text.fast;
            
            const textNormal = document.getElementById('textNormal');
            if (textNormal) textNormal.textContent = text.normal;
            
            const textSlow = document.getElementById('textSlow');
            if (textSlow) textSlow.textContent = text.slow;
            
            // 초 텍스트
            ['secText1', 'secText2', 'secText3'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = text.seconds;
            });
            
            // 모드 선택 버튼
            const modeStudy = document.getElementById('modeStudyText');
            if (modeStudy) modeStudy.textContent = text.modeStudy;
            
            const modeQuiz = document.getElementById('modeQuizText');
            if (modeQuiz) modeQuiz.textContent = text.modeQuiz;
            
            const modeSRS = document.getElementById('modeSRSText');
            if (modeSRS) modeSRS.textContent = text.modeSRS;
            
            const modeDialog = document.getElementById('modeDialogText');
            if (modeDialog) modeDialog.textContent = text.modeDialog;
            
            // 컨트롤 칩
            const readingChip = document.getElementById('readingChip');
            if (readingChip) readingChip.textContent = '🎓 ' + text.reading;
            
            const filterChip1 = document.getElementById('filterChip1');
            if (filterChip1) filterChip1.textContent = '🔍 ' + text.filter;
            
            const filterChip2 = document.getElementById('filterChip2');
            if (filterChip2) filterChip2.textContent = '🔍 ' + text.filter;
            
            const restartChip1 = document.getElementById('restartChip1');
            if (restartChip1) restartChip1.textContent = '🔄 ' + text.restart;
            
            const restartChip2 = document.getElementById('restartChip2');
            if (restartChip2) restartChip2.textContent = '🔄 ' + text.restart;
            
            const quizSettingsChip = document.getElementById('quizSettingsChip');
            if (quizSettingsChip) quizSettingsChip.textContent = '⚙️ ' + text.quizSettings;
            
            const startChip = document.getElementById('startChip');
            if (startChip) startChip.textContent = '▶ ' + text.start;
            
            const startChip2 = document.getElementById('startChip2');
            if (startChip2) startChip2.textContent = '▶ ' + text.start;
            
            const srsSettingsChip = document.getElementById('srsSettingsChip');
            if (srsSettingsChip) srsSettingsChip.textContent = '🔄 ' + text.srsSettings;
            
            const dialogSettingsChip = document.getElementById('dialogSettingsChip');
            if (dialogSettingsChip) dialogSettingsChip.textContent = '💬 ' + text.dialogSettings;
            
            const ttsSettingsChip = document.getElementById('ttsSettingsChip');
            if (ttsSettingsChip) ttsSettingsChip.textContent = '🎤 ' + text.ttsSettings;
            
            const problemsText = document.getElementById('problemsText');
            if (problemsText) problemsText.textContent = text.problems;
            
            // 메뉴 팝업 버튼들
            const btnFileLoad = document.getElementById('btnFileLoad');
            if (btnFileLoad) btnFileLoad.textContent = text.fileLoad;
            
            const btnDataSave = document.getElementById('btnDataSave');
            if (btnDataSave) btnDataSave.textContent = text.dataSave;
            
            const btnDataLoad = document.getElementById('btnDataLoad');
            if (btnDataLoad) btnDataLoad.textContent = text.dataLoad;
            
            const btnQuizReport = document.getElementById('btnQuizReport');
            if (btnQuizReport) btnQuizReport.textContent = text.quizReport;
            
            // 설정 모달의 학습 언어 라벨
            const studyLangLabel = document.querySelector('label[for="studyLangSelect"]');
            if (studyLangLabel) studyLangLabel.textContent = text.studyLang;
            
            // 모달/팝업 타이틀
            const menuTitle = document.querySelector('#menuPopup .popup-title');
            if (menuTitle) menuTitle.textContent = text.menu;
            
            const statsTitle = document.querySelector('#statsModal .modal-title');
            if (statsTitle) statsTitle.textContent = text.stats;

            // ============================================
            // 퀴즈 설정 팝업 내부 텍스트
            // ============================================
            const labelQuizDirection = document.getElementById('labelQuizDirection');
            if (labelQuizDirection) labelQuizDirection.textContent = text.labelQuizDirection;
            
            const textEngToKor = document.getElementById('textEngToKor');
            if (textEngToKor) textEngToKor.textContent = text.directionFrontBack || text.engToKor;
            
            const textKorToEng = document.getElementById('textKorToEng');
            if (textKorToEng) textKorToEng.textContent = text.directionBackFront || text.korToEng;
            
            const textMixed = document.getElementById('textMixed');
            if (textMixed) textMixed.textContent = text.directionMixed || text.mixed;
            
            const labelWrongDelay = document.getElementById('labelWrongDelay');
            if (labelWrongDelay) labelWrongDelay.textContent = text.labelWrongDelay;
            
            const delayFastText = document.getElementById('delayFastText');
            if (delayFastText) delayFastText.textContent = text.delayFast || text.fast;
            const delayNormalText = document.getElementById('delayNormalText');
            if (delayNormalText) delayNormalText.textContent = text.delayNormal || text.normal;
            const delaySlowText = document.getElementById('delaySlowText');
            if (delaySlowText) delaySlowText.textContent = text.delaySlow || text.slow;
            
            ['secDelayText1','secDelayText2','secDelayText3'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = text.seconds;
            });
            
            const labelStarReview = document.getElementById('labelStarReview');
            if (labelStarReview) labelStarReview.textContent = text.labelStarReview;
            
            const textWrongRevive = document.getElementById('textWrongRevive');
            if (textWrongRevive) textWrongRevive.textContent = text.wrongReviveLabel || text.excludeFromReview;
            
            const labelWrongDaysBasis = document.getElementById('labelWrongDaysBasis');
            if (labelWrongDaysBasis) labelWrongDaysBasis.textContent = text.wrongDaysBasis || '기준:';
            
            const labelWrongDaysUnit = document.getElementById('labelWrongDaysUnit');
            if (labelWrongDaysUnit) labelWrongDaysUnit.textContent = text.wrongDaysUnit || '일 전';
            
            // 날짜 버튼 - 한국어는 "3일", 영어는 "3 days"
            const isKo = currentUILang === 'ko';
            const dayUnit = isKo ? '일' : ' days';
            [3,7,14,30].forEach(n => {
                const el = document.getElementById('wrongDays' + n + 'Text');
                if (el) el.textContent = n + dayUnit;
            });
            
            const labelOtherOptionsQuiz = document.getElementById('labelOtherOptionsQuiz');
            if (labelOtherOptionsQuiz) labelOtherOptionsQuiz.textContent = text.otherOptions || text.labelOtherOptions;
            
            const textQuizHint = document.getElementById('textQuizHint');
            if (textQuizHint) textQuizHint.textContent = text.quizHintLabel || text.hint;
            
            const textQuizShuffle = document.getElementById('textQuizShuffle');
            if (textQuizShuffle) textQuizShuffle.textContent = text.shuffleLabel || text.shuffle;
            
            // ============================================
            // 필터 팝업 내부 텍스트
            // ============================================
            const labelWordFilter = document.getElementById('labelWordFilter');
            if (labelWordFilter) labelWordFilter.textContent = text.labelWordFilter;
            
            const textUntested = document.getElementById('textUntested');
            if (textUntested) textUntested.textContent = text.untestedLabel || text.untested;
            
            const textStarOnly = document.getElementById('textStarOnly');
            if (textStarOnly) textStarOnly.textContent = text.starOnlyLabel || text.starOnly;
            
            const textSafeOnly = document.getElementById('textSafeOnly');
            if (textSafeOnly) textSafeOnly.textContent = text.safeOnlyLabel || text.safeOnly;
            
            const labelColorHighlight = document.getElementById('labelColorHighlight');
            if (labelColorHighlight) labelColorHighlight.textContent = text.labelColorHighlight;
            
            const textLearningWords = document.getElementById('textLearningWords');
            if (textLearningWords) textLearningWords.textContent = text.learningWordsLabel || text.learningWords;
            
            const textStarWords = document.getElementById('textStarWords');
            if (textStarWords) textStarWords.textContent = text.starWordsLabel || text.starWords;
            
            const textSafeWords = document.getElementById('textSafeWords');
            if (textSafeWords) textSafeWords.textContent = text.safeWordsLabel || text.safeWords;
            
            const labelOtherOptionsFilter = document.getElementById('labelOtherOptionsFilter');
            if (labelOtherOptionsFilter) labelOtherOptionsFilter.textContent = text.otherOptions || text.labelOtherOptions;
            
            const textAutoSpeak = document.getElementById('textAutoSpeak');
            if (textAutoSpeak) textAutoSpeak.textContent = text.autoSpeakLabel || text.autoSpeak;
            
            const textFilterShuffle = document.getElementById('textFilterShuffle');
            if (textFilterShuffle) textFilterShuffle.textContent = text.shuffleLabel || text.shuffle;
            
            // ============================================
            // SRS 설정 팝업 내부 텍스트
            // ============================================
            const labelReviewTarget = document.getElementById('labelReviewTarget');
            if (labelReviewTarget) labelReviewTarget.textContent = text.labelReviewTarget;
            
            const textSrsNewOnly = document.getElementById('textSrsNewOnly');
            if (textSrsNewOnly) textSrsNewOnly.textContent = text.srsNewOnlyLabel || text.newOnly;
            
            const textSrsHardOnly = document.getElementById('textSrsHardOnly');
            if (textSrsHardOnly) textSrsHardOnly.textContent = text.srsHardOnlyLabel || text.hardOnly;
            
            const labelIntervalMultiplier = document.getElementById('labelIntervalMultiplier');
            if (labelIntervalMultiplier) labelIntervalMultiplier.textContent = text.labelIntervalMultiplier;
            
            const easeFastText = document.getElementById('easeFastText');
            if (easeFastText) easeFastText.textContent = text.delayFast || text.fast;
            const easeNormalText = document.getElementById('easeNormalText');
            if (easeNormalText) easeNormalText.textContent = text.standardLabel || '표준';
            const easeSlowText = document.getElementById('easeSlowText');
            if (easeSlowText) easeSlowText.textContent = text.delaySlow || text.slow;
            
            const labelFailureReduction = document.getElementById('labelFailureReduction');
            if (labelFailureReduction) labelFailureReduction.textContent = text.labelFailureReduction;
            
            const lapseResetText = document.getElementById('lapseResetText');
            if (lapseResetText) lapseResetText.textContent = text.lapseResetLabel || '리셋';
            const lapseResetSub = document.getElementById('lapseResetSub');
            if (lapseResetSub) lapseResetSub.textContent = text.lapseResetSub || '(1일로)';
            const lapse20Text = document.getElementById('lapse20Text');
            if (lapse20Text) lapse20Text.textContent = text.keepLabel || '유지';
            const lapse50Text = document.getElementById('lapse50Text');
            if (lapse50Text) lapse50Text.textContent = text.keepLabel || '유지';
            
            // ============================================
            // 회화 설정 팝업 내부 텍스트
            // ============================================
            const labelRoleSettings = document.getElementById('labelRoleSettings');
            if (labelRoleSettings) labelRoleSettings.textContent = text.labelRoleSettings;
            
            const labelRoleA = document.getElementById('labelRoleA');
            if (labelRoleA) labelRoleA.textContent = text.roleALabel || text.roleA + ' (Computer)';
            
            const labelRoleB = document.getElementById('labelRoleB');
            if (labelRoleB) labelRoleB.textContent = text.roleBLabel || text.roleB + ' (Me)';
            
            const labelWaitTime = document.getElementById('labelWaitTime');
            if (labelWaitTime) labelWaitTime.textContent = text.labelWaitTime;
            
            const labelCompWait = document.getElementById('labelCompWait');
            if (labelCompWait) labelCompWait.textContent = text.compWaitLabel || (isKo ? '컴퓨터 대기 (초)' : 'Computer Wait (sec)');
            
            const labelUserWait = document.getElementById('labelUserWait');
            if (labelUserWait) labelUserWait.textContent = text.userWaitLabel || (isKo ? '사용자 대기 (초)' : 'User Wait (sec)');
            
            // ============================================
            // TTS 설정 팝업 내부 텍스트
            // ============================================
            const labelVoice = document.getElementById('labelVoice');
            if (labelVoice) labelVoice.textContent = text.voiceLabel || text.labelVoice;
            
            const labelTTSSpeed = document.getElementById('labelTTSSpeed');
            if (labelTTSSpeed) labelTTSSpeed.textContent = text.speedLabel || text.labelSpeed;
            
            const labelTTSPitch = document.getElementById('labelTTSPitch');
            if (labelTTSPitch) labelTTSPitch.textContent = text.pitchLabel || text.labelPitch;
            
            // ============================================
            // 독해/영작 설정 팝업 내부 텍스트
            // ============================================
            const labelStudyMode = document.getElementById('labelStudyMode');
            if (labelStudyMode) labelStudyMode.textContent = text.labelStudyMode;
            
            const readingOff = document.getElementById('readingOff');
            if (readingOff) readingOff.textContent = text.readingOffLabel || text.off;
            
            const readingEngKor = document.getElementById('readingEngKor');
            if (readingEngKor) readingEngKor.textContent = text.readingEngKorLabel || text.readingMode;
            
            const readingKorEng = document.getElementById('readingKorEng');
            if (readingKorEng) readingKorEng.textContent = text.readingKorEngLabel || text.writingMode;
            
            const labelThinkTime = document.getElementById('labelThinkTime');
            if (labelThinkTime) labelThinkTime.textContent = text.labelThinkTime;
            
            const labelAnswerTime = document.getElementById('labelAnswerTime');
            if (labelAnswerTime) labelAnswerTime.textContent = text.labelAnswerTime;

            // ============================================
            // 독해/영작 설명 텍스트
            // ============================================
            const readingDescription = document.getElementById('readingDescription');
            if (readingDescription) readingDescription.innerHTML = text.readingDescription || (isKo
                ? '💡 <strong>사용 방법:</strong><br>1. 단어 파일 로드 (번호 매칭 파일)<br>2. 모드 선택 (독해/영작)<br>3. 생각 시간 &amp; 답보는 시간 설정<br>4. 시작 버튼 클릭'
                : '💡 <strong>How to use:</strong><br>1. Load word file (numbered matching file)<br>2. Select mode (Reading/Writing)<br>3. Set think time &amp; answer view time<br>4. Click Start');

            // ============================================
            // 퀴즈 테스트지 출력
            // ============================================
            const labelTestPrint = document.getElementById('labelTestPrint');
            if (labelTestPrint) labelTestPrint.textContent = text.labelTestPrint || (isKo ? '📝 테스트지 출력' : '📝 Print Test');

            const btnTestQuestion = document.getElementById('btnTestQuestion');
            if (btnTestQuestion) btnTestQuestion.textContent = text.btnTestQuestion || (isKo ? '📄 문제지' : '📄 Question Sheet');

            const btnTestAnswer = document.getElementById('btnTestAnswer');
            if (btnTestAnswer) btnTestAnswer.textContent = text.btnTestAnswer || (isKo ? '✅ 정답지' : '✅ Answer Sheet');

            // ============================================
            // 쉐도잉 설정
            // ============================================
            const labelShadowingMode = document.getElementById('labelShadowingMode');
            if (labelShadowingMode) labelShadowingMode.textContent = text.labelShadowingMode || (isKo ? '🎧 쉐도잉 모드' : '🎧 Shadowing Mode');

            const textShadowingActivate = document.getElementById('textShadowingActivate');
            if (textShadowingActivate) textShadowingActivate.textContent = text.textShadowingActivate || (isKo ? '쉐도잉 활성화 (AB 모두 컴퓨터가 읽음)' : 'Activate Shadowing (Computer reads both A & B)');

            const labelShadowMyTime = document.getElementById('labelShadowMyTime');
            if (labelShadowMyTime) labelShadowMyTime.textContent = text.labelShadowMyTime || (isKo ? '내 따라읽기 시간 (초)' : 'My Follow-Read Time (sec)');

            const labelShadowABLoop = document.getElementById('labelShadowABLoop');
            if (labelShadowABLoop) labelShadowABLoop.textContent = text.labelShadowABLoop || (isKo ? '🔁 A-B 반복횟수' : '🔁 A-B Repeat Count');

            const textShadowLoopUse = document.getElementById('textShadowLoopUse');
            if (textShadowLoopUse) textShadowLoopUse.textContent = text.textShadowLoopUse || (isKo ? '반복 사용' : 'Use Repeat');

            const textShadowLoopUnit = document.getElementById('textShadowLoopUnit');
            if (textShadowLoopUnit) textShadowLoopUnit.textContent = text.textShadowLoopUnit || (isKo ? '회 (0=무한)' : 'times (0=∞)');

            const textShadowLoopDesc = document.getElementById('textShadowLoopDesc');
            if (textShadowLoopDesc) textShadowLoopDesc.textContent = text.textShadowLoopDesc || (isKo ? '체크 OFF=반복없음 / 0=무한 / 숫자=해당 횟수만큼 반복 후 다음 세트' : 'OFF=no repeat / 0=infinite / number=repeat N times then next set');

            const labelShadowRate = document.getElementById('labelShadowRate');
            if (labelShadowRate) labelShadowRate.textContent = text.labelShadowRate || (isKo ? '읽기 속도' : 'Reading Speed');

            const textShadowingTip = document.getElementById('textShadowingTip');
            if (textShadowingTip) textShadowingTip.innerHTML = text.textShadowingTip || (isKo
                ? '💡 쉐도잉 ON이면 A와 B를 모두 컴퓨터가 읽습니다.<br>화면 표시(AB 동시/순차)는 기존 설정을 사용합니다.'
                : '💡 When Shadowing is ON, the computer reads both A and B.<br>Screen display (simultaneous/sequential) uses existing settings.');

            const btnShadowFinish = document.getElementById('shadowFinishBtn');
            if (btnShadowFinish && !btnShadowFinish._shadowFinishUserEdited) btnShadowFinish.textContent = text.btnShadowFinish || (isKo ? '마무리' : 'Finish');

            // ============================================
            // 깜박이 속도 chip 텍스트 (현재 선택된 속도에 맞게 갱신)
            // ============================================
            const speedTextEl = document.getElementById('speedText');
            if (speedTextEl && typeof settings !== 'undefined') {
                const spd = settings.speed;
                speedTextEl.textContent = spd === 1.0 ? text.fast : spd === 3.0 ? text.slow : text.normal;
            }
        }
        
        // 학습 언어 변경
// ---------------------------------------------------------
// changeStudyLanguage
// ---------------------------------------------------------

        function changeStudyLanguage(lang) {
            currentStudyLang = lang;
            Storage.set('studyLang', lang);
            updateVoiceList();
        }
        
        // TTS 언어 코드 반환
// ---------------------------------------------------------
// getTTSLang
// ---------------------------------------------------------

        function getTTSLang() {
            return STUDY_LANG_CONFIG[currentStudyLang]?.ttsLang || 'en-US';
        }
        
        // TTS 스킵 여부 판단
// ---------------------------------------------------------
// shouldSkipTTS
// ---------------------------------------------------------

        function shouldSkipTTS(text) {
            // 한글이 포함되어 있으면 스킵
            return /[가-힣]/.test(text);
        }
        
        // 음성 목록 업데이트