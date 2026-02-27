/* =========================================================
 * Render + stats + report
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ========================================================= */


// ---------------------------------------------------------
// updateDisplay
// ---------------------------------------------------------

        function updateDisplay() {
            // 🗣️ 회화 모드
            if (currentMode === 'dialog') {
                if (dialogScript.length === 0) {
                    document.getElementById('cardWord').textContent = (typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']?.loadDialogFirst) || '대화 파일을 로드해 주세요';
                    document.getElementById('cardMeaning').textContent = '';
                    document.getElementById('cardNumber').textContent = '#-';
                    document.getElementById('cardStatus').textContent = '-';
                    document.getElementById('progressFill').style.width = '0%';
                    return;
                }
                
                if (currentIndex >= dialogScript.length) {
                    document.getElementById('cardWord').textContent = (typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']?.dialogComplete) || '대화 완료!';
                    document.getElementById('cardMeaning').textContent = '';
                    document.getElementById('cardNumber').textContent = `#${dialogScript.length}`;
                    document.getElementById('cardStatus').textContent = '✓';
                    document.getElementById('progressFill').style.width = '100%';
                    return;
                }
                
                const item = dialogScript[currentIndex];
                const roleA = document.getElementById('dialogRoleA').value;
                const isCompTurn = item.role === roleA;
                
                // 역할에 따른 색상 변경
                const color = isCompTurn ? 
                    getComputedStyle(document.documentElement).getPropertyValue('--color-dialog-a') :
                    getComputedStyle(document.documentElement).getPropertyValue('--color-dialog-b');
                
                const _langMap = {
                    'en': 'english', 'es': 'spanish', 'fr': 'french', 'de': 'german',
                    'it': 'italian', 'pt': 'portuguese', 'ru': 'russian',
                    'zh': 'chinese', 'ja': 'japanese', 'ar': 'arabic', 'hi': 'hindi',
                    'ko': 'korean'
                };
                const _studyLangEl = document.getElementById('studyLangSelect');
                const _studyLang = _studyLangEl ? (_studyLangEl.value || 'en') : 'en';
                const _ygLang = _langMap[_studyLang] || 'english';
                const youglishUrl = 'https://youglish.com/pronounce/' + encodeURIComponent(item.text) + '/' + _ygLang;
                document.getElementById('cardWord').innerHTML = 
                    `<span style="font-size:0.6em; margin-right:10px;">[${item.role}]</span> ${item.text}` +
                    ` <a href="${youglishUrl}" target="_blank" onclick="event.stopPropagation()" ` +
                    `style="font-size:0.4em; vertical-align:middle; text-decoration:none; opacity:0.5; margin-left:8px;" title="Youglish">🎬</a>`;
                document.getElementById('cardWord').style.color = color;
                document.getElementById('cardWord').style.fontSize = settings.fontSize + 'px';
                
                // 번역 표시
                if (item.translation) {
                    document.getElementById('cardMeaning').textContent = item.translation;
                    document.getElementById('cardMeaning').style.fontSize = (settings.fontSize * 0.7) + 'px';
                } else {
                    document.getElementById('cardMeaning').textContent = '';
                }
                
                document.getElementById('cardNumber').textContent = `${currentIndex + 1}/${dialogScript.length}`;
                { const _tUI = (typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']) || {}; document.getElementById('cardStatus').textContent = isCompTurn ? ('💻 ' + (_tUI.compTurn || '컴퓨터')) : ('👤 ' + (_tUI.userTurn || '사용자')); }
                document.getElementById('progressFill').style.width = `${((currentIndex + 1) / dialogScript.length) * 100}%`;
                return;
            }
            
            // 기존 단어장 모드
            const p = isRunning ? currentPool : (currentMode === 'srs' ? getSRSItems() : getFiltered());
            
            if (p.length === 0) {
                if (vocabulary.length === 0) {
                    // 파일이 없을 때 - 초기 화면 유지
                    return;
                } else {
                    // 파일은 있는데 조건에 맞는 단어가 없을 때
                    document.getElementById('cardWord').textContent = currentMode === 'srs' ? UI_TEXT[currentUILang].noSRSToday : UI_TEXT[currentUILang].noWordsMatch;
                }
                document.getElementById('cardMeaning').textContent = '';
                document.getElementById('cardNumber').textContent = '#-';
                document.getElementById('cardStatus').textContent = '-';
                document.getElementById('progressFill').style.width = '0%';
                return;
            }
            
            currentIndex = Math.max(0, Math.min(currentIndex, p.length - 1));
            const it = p[currentIndex];
            
            // 🔍 독해/영작 모드 체크
            const readingMode = document.getElementById('readingMode') ? document.getElementById('readingMode').value : 'off';
            
            if (readingMode !== 'off' && window.readingStep !== undefined) {
                // 독해/영작 모드 표시
                if (readingMode === 'eng-kor') {
                    // 독해모드: 앞→뒤
                    document.getElementById('cardWord').textContent = window.readingStep === 0 ? it.word : it.meaning;
                } else if (readingMode === 'kor-eng') {
                    // 영작모드: 뒤→앞
                    document.getElementById('cardWord').textContent = window.readingStep === 0 ? it.meaning : it.word;
                }
                document.getElementById('cardMeaning').textContent = '';
                document.getElementById('quizOpt').style.display = 'none';
            } else if (currentMode !== 'quiz' || !isRunning) {
                const _dictLangEl = document.getElementById('studyLangSelect');
                const _dictLang = _dictLangEl ? (_dictLangEl.value || 'en') : 'en';
                const _dictUrlMap = {
                    'en': 'https://dict.naver.com/search.nhn?query=',
                    'ja': 'https://jdict.naver.com/search?query=',
                    'zh': 'https://zh.dict.naver.com/search?query=',
                    'fr': 'https://frdict.naver.com/search?query=',
                    'es': 'https://esdict.naver.com/search?query=',
                    'de': 'https://dedict.naver.com/search?query=',
                };
                const _dictBase = _dictUrlMap[_dictLang] || ('https://www.google.com/search?q=' + encodeURIComponent(_dictLang + ' dictionary '));
                const naverUrl = _dictBase + encodeURIComponent(it.word);
                const _dictTitle = _dictUrlMap[_dictLang] ? '사전' : 'Google Dictionary';
                document.getElementById('cardWord').innerHTML = 
                    it.word + 
                    ` <a href="${naverUrl}" target="_blank" onclick="event.stopPropagation()" ` +
                    `style="font-size:0.45em; vertical-align:middle; text-decoration:none; opacity:0.5; margin-left:8px;" title="${_dictTitle}">📖</a>`;
                document.getElementById('cardMeaning').textContent = it.meaning;
                document.getElementById('quizOpt').style.display = 'none';
            }
            
            // 🎨 컬러 강조 시스템
            let displayColor = 'var(--text-primary)';
            
            if (it.isSafe && settings.colorSafe) {
                displayColor = 'var(--color-safe)';
            } else if (it.w > 0 && settings.colorWrong) {
                displayColor = 'var(--color-wrong)';
            } else if (settings.colorLearning) {
                displayColor = 'var(--color-learning)';
            }
            
            document.getElementById('cardWord').style.color = displayColor;
            
            // 상태 표시에 안정권 아이콘 추가
            const _star = (typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']?.starWords) || '별표';
            let statusText = `${it.m ? '⭐' : '❌'} ${_star}${it.w}${it.star ? ' ★' : ''}`; 
            if (it.isSafe) {
                statusText += ' ✅';
            }
            document.getElementById('cardNumber').textContent = `#${it.num}`;
            document.getElementById('cardStatus').textContent = statusText;
            document.getElementById('progressFill').style.width = `${((currentIndex + 1) / p.length) * 100}%`;
        }

        // 음성
// ---------------------------------------------------------
// updateStats
// ---------------------------------------------------------

        function updateStats() {
            if (vocabulary.length === 0) return;

            const today = new Date().toISOString().slice(0,10);
            const safeCount = vocabulary.filter(v => v.isSafe).length;
            const memRate = Math.round(safeCount / vocabulary.length * 100) || 0;

            const todayCount = studyLog[today] || 0;
            let weekCount = 0;
            for (let i = 0; i < 7; i++) {
                const d = new Date(Date.now() - i * 86400000).toISOString().slice(0,10);
                weekCount += studyLog[d] || 0;
            }

            const recentQuiz = totalQuizHistory.filter(h => {
                const diffDays = (Date.now() - new Date(h.date).getTime()) / 86400000;
                return diffDays < 30;
            });
            const correct = recentQuiz.filter(h => h.ok).length;
            const quizRate = recentQuiz.length > 0 ? Math.round(correct / recentQuiz.length * 100) : 0;

            document.getElementById('statToday').textContent = todayCount;
            document.getElementById('statWeek').textContent = weekCount;
            document.getElementById('statMemRate').textContent = memRate + '%';
            document.getElementById('statQuizRate').textContent = quizRate + '%';
        }
// ---------------------------------------------------------
// logStudy
// ---------------------------------------------------------


        function logStudy(count = 1) {
            const today = new Date().toISOString().slice(0,10);
            studyLog[today] = (studyLog[today] || 0) + count;
            Storage.setJSON('studyLog', studyLog);
            updateStats();
        }
// ---------------------------------------------------------
// showStatsModal
// ---------------------------------------------------------


        function showStatsModal() {
            updateStats();
            document.getElementById('statsModal').classList.add('show');
        }
// ---------------------------------------------------------
// showReportModal
// ---------------------------------------------------------


        function showReportModal() {
            if (quizHistory.length === 0) {
                alert(UI_TEXT[currentUILang].noQuiz);
                return;
            }

            const correct = quizHistory.filter(h => h.ok).length;
            const total = quizHistory.length;
            const rate = Math.round(correct / total * 100);

            let html = `
                <div style="text-align:center; margin:20px 0;">
                    <div style="font-size:48px; font-weight:bold; color:var(--accent-color);">${rate}%</div>
                    <div style="font-size:18px; color:var(--text-secondary); margin-top:8px;">${(typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']?.quizScore) || '정답'} ${correct} / ${total}</div>
                </div>
            `;

            quizHistory.forEach(h => {
                const icon = h.ok ? '✓' : '✗';
                const color = h.ok ? 'var(--success-color)' : 'var(--danger-color)';
                html += `
                    <div class="report-row">
                        <div class="report-word">
                            <div class="report-word-eng">${h.word}</div>
                            <div class="report-word-kor">${h.meaning}</div>
                        </div>
                        <div style="color:${color}; font-size:20px; margin-right:12px;">${icon}</div>
                        <button class="speaker-btn" onclick="speakWord('${h.word}')">🔊</button>
                    </div>
                `;
            });

            document.getElementById('reportContent').innerHTML = html;
            document.getElementById('reportModal').classList.add('show');
            closePopup('menuPopup');
        }

        // 제스처
        let touchStartX = 0;
        let touchStartTime = 0;
        let lastTapTime = 0;

        const card = document.getElementById('flashCard');

        // ✅ 풀스크린 퀵 모드바(롱프레스) - 기존 탭/스와이프 로직과 충돌 방지
        const fsModeBar = document.getElementById('fsModeBar');
        let __lpTimer = null;
        let __lpTriggered = false;
        let __fsHideTimer = null;