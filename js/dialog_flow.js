/* =========================================================
 * Dialog Flow (run/next)
 * Refactor: split from legacy/dialog_shadow.js
 * Generated: 2026-02-11
 * ========================================================= */

function runDialog() {
            // 🎧 쉐도잉 모드가 활성화되어 있으면 쉐도잉 함수 실행
            if (document.getElementById('shadowingMode') && document.getElementById('shadowingMode').checked) {
                runShadowing();
                return;
            }
            
            if (!isRunning || currentIndex >= dialogScript.length) {
                stopApp();
                return;
            }
            
            updateDisplay();
            
            const item = dialogScript[currentIndex];
            const roleA = document.getElementById('dialogRoleA').value;
            const isCompTurn = item.role === roleA;
            
            const compSpeed = parseFloat(document.getElementById('dialogCompSpeed').value) || 0;
            const userSpeed = parseFloat(document.getElementById('dialogUserSpeed').value) || 0;
            
            const waitTime = isCompTurn ? compSpeed : userSpeed;
            
            if (waitTime > 0) {
                // 자동 모드
                if (isCompTurn && settings.autoSpeak) {
                    speakWord(item.text);
                }
                
                App.Timers.setTimeout(() => {
                    if (!isRunning) return;
                    currentIndex++;
                    logStudy(1);
                    runDialog();
                }, waitTime * 1000);
            } else {
                // 수동 모드 - Enter 키로 넘김
                if (isCompTurn && settings.autoSpeak) {
                    speakWord(item.text);
                }
            }
        }

function nextDialogLine() {
            if (currentMode !== 'dialog' || !isRunning) return;
            
            currentIndex++;
            logStudy(1);
            runDialog();
        }
