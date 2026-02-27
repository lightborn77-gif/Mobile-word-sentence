/* =========================================================
 * TTS playback
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ========================================================= */


// ---------------------------------------------------------
// speakWord
// ---------------------------------------------------------

        function speakWord(word) {
            // word 파라미터가 명시적으로 전달된 경우만 사용
            if (word && typeof word === 'string') {
                // 리포트 등에서 직접 단어를 전달한 경우
                // 일단 그대로 유지
            } else {
                // 카드 클릭 시 - vocabulary 데이터에서 직접 가져오기
                if (currentMode === 'dialog' && dialogScript.length > 0) {
                    word = dialogScript[currentIndex].text;
                } else {
                    const p = isRunning ? currentPool : (currentMode === 'srs' ? getSRSItems() : getFiltered());
                    if (p.length === 0) return;
                    word = p[currentIndex].word; // vocabulary 데이터의 word 필드
                }
            }
            
            // ✅ 한글 감지: shouldSkipTTS 함수 사용
            if (shouldSkipTTS(word)) {
                console.debug('한글이 포함된 텍스트는 TTS로 읽지 않습니다:', word);
                return;
            }
            
            // 한글이나 특수문자 제거 (영어, 숫자, 공백, 하이픈만 유지)
            word = word.replace(/[^a-zA-Z0-9\s\-]/g, '').trim();
            
            if (!word || word.length === 0) return;
            
            if ('speechSynthesis' in window) {
                speechSynthesis.cancel(); // 이전 음성 중지
                
                App.Timers.setTimeout(() => {
                    const utterance = new SpeechSynthesisUtterance(word);
                    utterance.lang = getTTSLang(); // 다국어 지원
                    
                    // TTS 설정 반영
                    const voiceSelect = document.getElementById('voiceSelect');
                    const voices = window.speechSynthesis.getVoices();
                    const selectedVoice = voices.find(v => v.name === voiceSelect.value);
                    if (selectedVoice) {
                        utterance.voice = selectedVoice;
                    }
                    
                    const ttsRate = document.getElementById('ttsRate');
                    const ttsPitch = document.getElementById('ttsPitch');
                    
                    utterance.rate = ttsRate ? parseFloat(ttsRate.value) : 0.9;
                    utterance.pitch = ttsPitch ? parseFloat(ttsPitch.value) : 1.0;
                    utterance.volume = 1.0;
                    
                    utterance.onerror = function(event) {
                        console.error('Speech synthesis error:', event);
                    };
                    
                    speechSynthesis.speak(utterance);
                }, 50);
            }
        }

        // 콜백 있는 발음 함수
// ---------------------------------------------------------
// speakWordWithCallback
// ---------------------------------------------------------

        
        function speakWordWithCallback(word, callback) {
            // 한글 감지
            if (shouldSkipTTS(word)) {
                if (callback) callback();
                return;
            }

            word = (word || '').replace(/[^a-zA-Z0-9\s\-]/g, '').trim();
            if (!word) {
                if (callback) callback();
                return;
            }

            if (!('speechSynthesis' in window)) {
                if (callback) callback();
                return;
            }

            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                try { clearTimeout(watchdog); } catch {}
                if (callback) callback();
            };

            const maxMs = Math.min(8000, Math.max(1800, word.length * 120));
            const watchdog = setTimeout(() => {
                try { speechSynthesis.cancel(); } catch {}
                finish();
            }, maxMs);

            try {
                speechSynthesis.cancel();
                const utterance = new SpeechSynthesisUtterance(word);
                utterance.lang = getTTSLang();
                utterance.rate = 0.9;
                utterance.onend = () => finish();
                utterance.onerror = () => finish();
                speechSynthesis.speak(utterance);
            } catch (e) {
                finish();
            }
        }

        // 재생/일시정지 토글