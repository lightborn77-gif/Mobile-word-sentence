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

function restartFromBeginning() {
            if (vocabulary.length === 0) {
                alert(UI_TEXT[currentUILang].loadFileFirst);
                return;
            }
            currentIndex = 0;
            stopApp();
            updateDisplay();
            App.Timers.setTimeout(() => togglePlayPause(), 100);
        }

        // 퀴즈 시작 (컨트롤에서)
// ---------------------------------------------------------
// startQuizFromControl
// ---------------------------------------------------------

function startQuizFromControl() {
            if (vocabulary.length === 0) {
                alert(UI_TEXT[currentUILang].loadFileFirst);
                return;
            }
            currentIndex = 0;
            stopApp();
            startQuiz();
        }

        // 계속 재생
// ---------------------------------------------------------
// continueApp
// ---------------------------------------------------------
