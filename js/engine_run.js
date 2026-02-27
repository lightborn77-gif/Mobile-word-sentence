/* =========================================================
 * Main engine flow (start/stop/next/prev/modes)
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ---------------------------------------------------------
 * [P3-MOB-1] 2026-02-27 — App.State 전환
 *   전역변수 직접 참조 → App.State getter/setter API 사용으로 교체.
 *   isRunning, currentPool, currentIndex, currentMode,
 *   vocabulary, dialogScript, settings.* 모두 전환 완료.
 *   backward compatibility 레이어(app_state.js defineProperties)에
 *   더 이상 의존하지 않으므로, 추후 레이어 제거 시에도 안전.
 * ========================================================= */


// 쉐도잉 관련 전역 변수 (모바일 슬림 버전 호환)
let shadowTimer = null;
let shadowStopFlag = false;
let shadowFinishFlag = false;



// ---------------------------------------------------------
// playNext (global single definition)
// ---------------------------------------------------------
function playNext() {
    if (!App.State.getIsRunning()) return;

    updateDisplay();

    const speed = App.State.getSetting('speed') * 1000;

    if (App.State.getSetting('autoSpeak')) {
        const pool = App.State.getCurrentPool();
        const idx  = App.State.getCurrentIndex();
        const word = pool[idx].word;

        speakWordWithCallback(word, () => {
            App.Timers.setTimeout(() => {
                if (!App.State.getIsRunning()) return;

                const currentMode = App.State.getCurrentMode();
                if (currentMode === 'srs') {
                    const currentPool = App.State.getCurrentPool();
                    const currentIndex = App.State.getCurrentIndex();
                    const it = currentPool[currentIndex];
                    if (it.m) updateSRS(it, true);
                }

                const pool = App.State.getCurrentPool();
                App.State.setCurrentIndex(
                    (App.State.getCurrentIndex() + 1) % pool.length
                );
                logStudy(1);
                playNext();
            }, 500);
        });
    } else {
        App.Timers.setTimeout(() => {
            if (!App.State.getIsRunning()) return;

            const currentMode = App.State.getCurrentMode();
            if (currentMode === 'srs') {
                const currentPool = App.State.getCurrentPool();
                const currentIndex = App.State.getCurrentIndex();
                const it = currentPool[currentIndex];
                if (it.m) updateSRS(it, true);
            }

            const pool = App.State.getCurrentPool();
            App.State.setCurrentIndex(
                (App.State.getCurrentIndex() + 1) % pool.length
            );
            logStudy(1);
            playNext();
        }, speed);
    }
}


// ---------------------------------------------------------
// continueApp (resume from current position)
// ---------------------------------------------------------

function continueApp() {
    const currentMode = App.State.getCurrentMode();
    const p = currentMode === 'srs' ? getSRSItems() : getFiltered();
    if (p.length === 0) {
        alert(currentMode === 'srs' ? UI_TEXT[currentUILang].noSRSToday : UI_TEXT[currentUILang].noWordsMatch);
        return;
    }

    App.State.setIsRunning(true);
    App.State.setCurrentPool(p);

    const pp = document.getElementById('playPauseBtn');
    if (pp) pp.textContent = '⏸';

    // 🔁 쉐도잉 반복 플로팅 버튼 표시/상태 업데이트
    try { refreshShadowLoopFloatingVisibility(); } catch (e) { /* ignore */ }
    try { syncShadowLoopFloatingBtn(); } catch (e) { /* ignore */ }

    // 🔆 화면 꺼짐 방지
    try { WakeLock.acquire(); } catch (e) { /* ignore */ }

    playNext();
}


// ---------------------------------------------------------
// startApp
// ---------------------------------------------------------

function startApp() {
    const currentMode = App.State.getCurrentMode();

    // 🗣️ 회화 모드 - 최우선 체크
    if (currentMode === 'dialog') {
        const dialogScript = App.State.getDialogScript();
        if (dialogScript.length === 0) {
            alert(((typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']?.loadDialogFirst) || '대화 파일을 먼저 로드해 주세요'));
            return;
        }
        App.State.setIsRunning(true);
        if (App.State.getCurrentIndex() >= dialogScript.length) {
            App.State.setCurrentIndex(0);
        }
        document.getElementById('playPauseBtn').textContent = '⏸';
        // 🔁 쉐도잉 반복 플로팅 버튼 표시/상태 업데이트
        try { refreshShadowLoopFloatingVisibility(); } catch (e) { /* ignore */ }
        try { syncShadowLoopFloatingBtn(); } catch (e) { /* ignore */ }
        // 🔆 화면 꺼짐 방지
        try { WakeLock.acquire(); } catch (e) { /* ignore */ }
        runDialog();
        return;
    }

    // 기존 단어장 모드 - vocabulary 필요
    if (App.State.getVocabulary().length === 0) {
        alert(UI_TEXT[currentUILang].loadWordFileFirst);
        return;
    }

    if (currentMode === 'quiz') {
        startQuiz();
        return;
    }

    const p = currentMode === 'srs' ? getSRSItems() : getFiltered();
    if (p.length === 0) {
        alert(currentMode === 'srs' ? UI_TEXT[currentUILang].noSRSToday : UI_TEXT[currentUILang].noWordsMatch);
        return;
    }

    App.State.setIsRunning(true);
    App.State.setCurrentPool(p);
    App.State.setCurrentIndex(0);
    updateDisplay();

    document.getElementById('playPauseBtn').textContent = '⏸';

    // 🔁 쉐도잉 반복 플로팅 버튼 표시/상태 업데이트
    try { refreshShadowLoopFloatingVisibility(); } catch (e) { /* ignore */ }
    try { syncShadowLoopFloatingBtn(); } catch (e) { /* ignore */ }

    // 🔆 화면 꺼짐 방지
    try { WakeLock.acquire(); } catch (e) { /* ignore */ }

    playNext();
}


// ---------------------------------------------------------
// stopApp
// ---------------------------------------------------------

function stopApp() {
    App.State.setIsRunning(false);
    try { if (window.App && App.dispatch) App.dispatch('STOP_ALL'); } catch (e) {}
    try { if (window.App && App.TTS && App.TTS.cancel) App.TTS.cancel(); else speechSynthesis.cancel(); } catch (e) {} // 음성 중지
    window.readingStep = undefined; // 🔍 독해모드 상태 초기화

    // 🔆 화면 꺼짐 방지 해제 (재생 중단)
    try { WakeLock.release(); } catch (e) { /* ignore */ }

    // 수동 답보기 버튼 숨기기
    const manualBtn = document.getElementById('manualAnswerBtn');
    if (manualBtn) manualBtn.style.display = 'none';

    // 🎧 쉐도잉 정리
    shadowStopFlag = true;
    if (shadowTimer) {
        App.Timers.clearTimeout(shadowTimer);
        shadowTimer = null;
    }
    const btn = document.getElementById('shadowFinishBtn');
    if (btn) btn.style.display = 'none';

    const pp = document.getElementById('playPauseBtn');
    if (pp) pp.textContent = '▶';

    // 🔁 쉐도잉 반복 플로팅 버튼 숨김
    try { refreshShadowLoopFloatingVisibility(); } catch (e) { /* ignore */ }
    const qopt = document.getElementById('quizOpt');
    if (qopt) qopt.style.display = 'none';
    try { updateDisplay(); } catch (e) { console.warn('[stopApp] updateDisplay error ignored:', e); }
}
