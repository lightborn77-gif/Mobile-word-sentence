/* =========================================================
 * Quiz engine
 * Generated: 2026-02-10 20:55:40
 * Refactored: 2026-02-27 — 전역변수 직접 참조 → App.State API 전환 (P3-MOB-1)
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ========================================================= */


// ---------------------------------------------------------
// startQuiz
// ---------------------------------------------------------

        function startQuiz() {
            const p = getFiltered();
            if (p.length === 0) {
                alert(UI_TEXT[currentUILang].noWordsMatch);
                return;
            }

            const s = App.State.getSettings();

            const count = Math.min(s.quizCount, p.length);
            let basePool = s.quizShuffle ? 
                p.sort(() => Math.random() - 0.5).slice(0, count) : 
                p.slice(0, count);
            
            // 🔄 오답 복습 로직
            let revivePool = [];
            if (s.wrongRevive) {
                const maxDays = s.wrongDays;
                const today = new Date().getTime();
                const cutoffTime = today - (maxDays * 86400000);
                
                const baseNums = new Set(basePool.map(v => v.num));
                const vocab = App.State.getVocabulary();
                
                revivePool = vocab.filter(v => {
                    if (baseNums.has(v.num)) return false;
                    
                    return v.wrongDates && v.wrongDates.some(dateStr => {
                        const wrongTime = new Date(dateStr).getTime();
                        return wrongTime >= cutoffTime;
                    });
                }).sort(() => Math.random() - 0.5);
            }
            
            const pool = [...basePool, ...revivePool];
            App.State.setQuizPool(pool);
            App.State.setCurrentPool(pool);
            App.State.setCurrentIndex(0);
            App.State.setQuizHistory([]);
            App.State.setIsRunning(true);
            
            document.getElementById('playPauseBtn').textContent = '⏸';
            
            showQuizQuestion();
        }

        // 퀴즈 문제
// ---------------------------------------------------------
// showQuizQuestion
// ---------------------------------------------------------

        function showQuizQuestion() {
            const quizPool = App.State.getQuizPool();
            const currentIndex = App.State.getCurrentIndex();

            if (currentIndex >= quizPool.length) {
                finishQuiz();
                return;
            }

            const it = quizPool[currentIndex];
            const s = App.State.getSettings();
            
            // 퀴즈 방향 결정
            let direction = s.quizDirection;
            if (direction === 'mixed') {
                direction = Math.random() < 0.5 ? 'wordToMeaning' : 'meaningToWord';
            }
            
            // 방향에 따라 문제와 정답 설정
            let questionText, correctAnswer;
            if (direction === 'meaningToWord') {
                questionText = it.meaning;
                correctAnswer = it.word;
            } else {
                questionText = it.word;
                correctAnswer = it.meaning;
            }
            
            document.getElementById('cardWord').textContent = questionText;
            document.getElementById('cardMeaning').textContent = '';
            document.getElementById('quizOpt').style.display = 'grid';

            // 선택지 생성 (방향에 따라)
            // ✅ 중복(동일 word/meaning) 때문에 선택지가 4개를 초과해 "빈 보기/undefined"가 생기는 문제 방지
            const numberEmojis = ['①', '②', '③', '④'];
            const correctText = (direction === 'meaningToWord') ? it.word : it.meaning;

            // 후보 풀에서 정답과 다른 텍스트만 수집 (표시 텍스트 기준)
            const poolTexts = [];
            for (const v of App.State.getVocabulary()) {
                const t = (direction === 'meaningToWord') ? v.word : v.meaning;
                if (!t) continue;
                if (t === correctText) continue;
                poolTexts.push(t);
            }

            // 중복 제거 + 랜덤 셔플
            const uniq = Array.from(new Set(poolTexts));
            uniq.sort(() => Math.random() - 0.5);

            // 최종 4개 고정: [정답] + [오답 3개]
            const optsTexts = [correctText, ...uniq.slice(0, 3)];
            // 혹시 후보가 부족하면(매우 작은 데이터셋) 중복 허용하여 4개 채움
            while (optsTexts.length < 4) optsTexts.push(correctText);

            // 셔플
            optsTexts.sort(() => Math.random() - 0.5);
            const correctIndex = optsTexts.indexOf(correctText);

            document.getElementById('quizOpt').innerHTML = optsTexts.slice(0,4).map((txt, i) => {
                const prefix = numberEmojis[i] || ((i + 1) + '.');
                const safeTxt = String(txt).replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<button class="quiz-btn" onclick="checkAnswer(${i}, ${correctIndex}, '${direction}')">${prefix} ${safeTxt}</button>`;
            }).join('');

            updateDisplay();
            if (s.autoSpeak && direction === 'wordToMeaning') speakWord();
        }

        // 정답 체크
// ---------------------------------------------------------
// checkAnswer
// ---------------------------------------------------------

        function checkAnswer(selected, correct, direction) {
            const quizPool = App.State.getQuizPool();
            const currentIndex = App.State.getCurrentIndex();
            const s = App.State.getSettings();

            const it = quizPool[currentIndex];
            const originalItem = App.State.getVocabulary().find(v => v.num === it.num);
            const isCorrect = selected === correct;
            const btns = document.querySelectorAll('.quiz-btn');

            if (isCorrect) {
                btns[selected].classList.add('correct');
                // App.State.addQuizHistory: _state.quizHistory에 push (브릿지 통해 배열 참조가 아닌 setter 사용)
                App.State.addQuizHistory({ word: it.word, meaning: it.meaning, ok: true });
                // App.State.addTotalQuizHistory: push + Storage.setJSON 내부 처리
                App.State.addTotalQuizHistory({ word: it.word, ok: true, date: new Date().toISOString() });
                
                // 안정권 시스템 적용
                if (originalItem) {
                    originalItem.quizCount = (originalItem.quizCount || 0) + 1;
                    
                    if (App.State.getCurrentMode() === 'srs') {
                        updateSRS(originalItem, true);
                    } else {
                        originalItem.m = true;
                        originalItem.correctStreak = (originalItem.correctStreak || 0) + 1;
                        originalItem.totalCorrect = (originalItem.totalCorrect || 0) + 1;
                        
                        if (originalItem.correctStreak >= 5 || originalItem.totalCorrect >= 10) {
                            originalItem.isSafe = true;
                            originalItem.w = 0;
                        } else {
                            originalItem.w = Math.max(0, originalItem.w - 1);
                        }
                        saveLocal();
                        App.State.clearCache();
                    }
                }
                
                logStudy(1);
                
                // 뒤→앞 모드에서 자동발음 체크되어 있으면 정답 발음
                if (direction === 'meaningToWord' && s.autoSpeak) {
                    App.Timers.setTimeout(() => speakWord(), 100);
                }
                
                App.Timers.setTimeout(() => {
                    App.State.setCurrentIndex(App.State.getCurrentIndex() + 1);
                    showQuizQuestion();
                }, 800);
            } else {
                btns[selected].classList.add('wrong');
                if (s.quizHint) {
                    btns[correct].classList.add('correct');
                }
                
                // 안정권 시스템 적용
                if (originalItem) {
                    originalItem.quizCount = (originalItem.quizCount || 0) + 1;
                    
                    if (App.State.getCurrentMode() === 'srs') {
                        updateSRS(originalItem, false);
                    } else {
                        originalItem.w++;
                        originalItem.correctStreak = 0;
                        originalItem.isSafe = false;
                        
                        // 오답 날짜 기록
                        const todayIso = new Date().toISOString().slice(0, 10);
                        if (!originalItem.wrongDates) originalItem.wrongDates = [];
                        if (!originalItem.wrongDates.includes(todayIso)) {
                            originalItem.wrongDates.push(todayIso);
                        }
                        saveLocal();
                        App.State.clearCache();
                    }
                }
                
                App.State.addQuizHistory({ word: it.word, meaning: it.meaning, ok: false });
                App.State.addTotalQuizHistory({ word: it.word, ok: false, date: new Date().toISOString() });
                
                logStudy(1);
                
                // 뒤→앞 모드에서 오답시에도 정답 발음
                if (direction === 'meaningToWord' && s.autoSpeak) {
                    App.Timers.setTimeout(() => speakWord(), 100);
                }
                
                App.Timers.setTimeout(() => {
                    App.State.setCurrentIndex(App.State.getCurrentIndex() + 1);
                    showQuizQuestion();
                }, s.quizDelay * 1000);
            }
            updateStats();
        }

        // 퀴즈 완료
// ---------------------------------------------------------
// finishQuiz
// ---------------------------------------------------------

        function finishQuiz() {
            stopApp();
            showReportModal();
        }

        // 이전/다음