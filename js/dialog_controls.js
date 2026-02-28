/* =========================================================
 * Dialog Controls (shadowing)
 * Refactor: split from legacy/dialog_shadow.js
 * Generated: 2026-02-11
 * ========================================================= */

function finishShadowing() {
            shadowFinishFlag = true;
            const btn = document.getElementById('shadowFinishBtn');
            if (btn) btn.style.display = 'none';
        }

function speakShadowing(text, rateOverride, callback) {
            if (!text) {
                if (callback) callback();
                return;
            }

            const voices = window.speechSynthesis.getVoices();
            const selectedVoice = document.getElementById('voiceSelect')?.value;
            let voice = voices.find(v => v.name === selectedVoice);
            
            if (!voice) {
                const langVoices = voices.filter(v => v.lang.startsWith(currentStudyLang));
                voice = langVoices[0] || voices[0];
            }

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.voice = voice;
            utterance.rate = rateOverride || parseFloat(document.getElementById('speed')?.value) || 1.0;
            utterance.pitch = parseFloat(document.getElementById('pitch')?.value) || 1.0;

            utterance.onend = () => {
                if (callback) callback();
            };

            window.speechSynthesis.speak(utterance);
        }

function runShadowing() {
            if (!isRunning) return;
            if (!dialogScript || dialogScript.length < 2) {
                alert(((typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']?.loadDialogFirst) || '대화 파일을 먼저 로드해 주세요.'));
                return;
            }

            shadowStopFlag = false;
            shadowFinishFlag = false;
            
            // 마무리 버튼 표시
            const btn = document.getElementById('shadowFinishBtn');
            if (btn) btn.style.display = 'block';

            // 음성 큐 정리
            window.speechSynthesis.cancel();

            const mySec = parseFloat(document.getElementById('shadowMyTime').value);
            const myDelay = (isNaN(mySec) ? 0 : mySec) * 1000;
            const shadowRateEl = document.getElementById('shadowRate');
            const rate = shadowRateEl ? (parseFloat(shadowRateEl.value) || 1.0) : 1.0;
            const rateA = rate;
            const rateB = rate;
            const systemRest = 250; // 시스템 대기 시간

            let pairBase = currentIndex - (currentIndex % 2);
            let pairRepeatCount = 0;

            function loopEnabled() {
                const el = document.getElementById('shadowLoop');
                return el ? el.checked : false;
            }
            function getLoopCount() {
                const el = document.getElementById('shadowLoopCount');
                const v = el ? parseInt(el.value) : 2;
                return isNaN(v) || v < 0 ? 2 : v;
            }

            function ensurePair() {
                if (pairBase < 0) pairBase = 0;
                if (pairBase >= dialogScript.length) return false;
                return !!(dialogScript[pairBase] && dialogScript[pairBase + 1]);
            }

            function stepA(isRepeat) {
                if (shadowStopFlag) return;
                if (!ensurePair()) { stopApp(); return; }
                if (!isRepeat) pairRepeatCount = 0;

                const A = dialogScript[pairBase];

                currentIndex = pairBase;
                updateDisplay();

                speakShadowing(A.text, rateA, () => {
                    if (shadowStopFlag) return;
                    shadowTimer = App.Timers.setTimeout(() => {
                        if (shadowStopFlag) return;
                        shadowTimer = App.Timers.setTimeout(() => {
                            if (!shadowStopFlag) stepB();
                        }, myDelay);
                    }, systemRest);
                });
            }

            function stepB() {
                if (shadowStopFlag) return;
                if (!ensurePair()) { stopApp(); return; }

                const B = dialogScript[pairBase + 1];

                currentIndex = pairBase + 1;
                updateDisplay();

                speakShadowing(B.text, rateB, () => {
                    if (shadowStopFlag) return;
                    shadowTimer = App.Timers.setTimeout(() => {
                        if (shadowStopFlag) return;
                        shadowTimer = App.Timers.setTimeout(() => {
                            if (shadowStopFlag) return;

                            if (shadowFinishFlag) {
                                stopApp();
                                return;
                            }

                            if (loopEnabled()) {
                                const maxCount = getLoopCount();
                                pairRepeatCount++;
                                if (maxCount === 0 || pairRepeatCount < maxCount) {
                                    // 무한(0) 또는 횟수 남음 → 현재 세트 반복
                                    shadowTimer = App.Timers.setTimeout(() => {
                                        if (!shadowStopFlag) stepA(true);
                                    }, systemRest);
                                } else {
                                    // 횟수 완료 → 다음 세트로
                                    pairBase += 2;
                                    shadowTimer = App.Timers.setTimeout(() => {
                                        if (!shadowStopFlag) stepA(false);
                                    }, systemRest);
                                }
                            } else {
                                // 반복 없음 → 바로 다음 세트
                                pairBase += 2;
                                shadowTimer = App.Timers.setTimeout(() => {
                                    if (!shadowStopFlag) stepA(false);
                                }, systemRest);
                            }
                        }, myDelay);
                    }, systemRest);
                });
            }

            stepA(false);
        }
