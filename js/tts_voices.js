/* =========================================================
 * TTS voice list / load voices
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ========================================================= */


// ---------------------------------------------------------
// updateVoiceList
// ---------------------------------------------------------

        function updateVoiceList() {
            const voiceSelect = document.getElementById('voiceSelect');
            if (!voiceSelect) return;
            
            const voices = window.speechSynthesis.getVoices();
            const targetLang = getTTSLang().split('-')[0]; // 'en-US' -> 'en'
            
            voiceSelect.innerHTML = '';
            
            // 현재 학습 언어에 맞는 음성 필터링
            const langVoices = voices.filter(voice => voice.lang.startsWith(targetLang));
            
            if (langVoices.length === 0) {
                // 해당 언어 음성이 없으면 모든 음성 표시
                voices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    voiceSelect.appendChild(option);
                });
            } else {
                // 해당 언어 음성만 표시
                langVoices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    voiceSelect.appendChild(option);
                });
            }
            
            // 저장된 음성 복원
            const savedVoice = Storage.get('selectedVoice_' + currentStudyLang);
            if (savedVoice && voiceSelect.querySelector(`option[value="${savedVoice}"]`)) {
                voiceSelect.value = savedVoice;
            }
        }

        // ============================================
        // 🌙 다크모드 토글 함수
        // ============================================
        // 다크모드
// ---------------------------------------------------------
// loadVoices
// ---------------------------------------------------------

        function loadVoices() {
            const voiceSelect = document.getElementById('voiceSelect');
            const voices = window.speechSynthesis.getVoices();
            
            voiceSelect.innerHTML = '';
            
            const enVoices = voices.filter(voice => voice.lang.startsWith('en'));
            
            if (enVoices.length === 0) {
                voices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    voiceSelect.appendChild(option);
                });
            } else {
                enVoices.forEach(voice => {
                    const option = document.createElement('option');
                    option.value = voice.name;
                    option.textContent = `${voice.name} (${voice.lang})`;
                    voiceSelect.appendChild(option);
                });
            }
        }
        
        // TTS 음성 초기화
        updateVoiceList();
        if (window.speechSynthesis.onvoiceschanged !== undefined) {
            window.speechSynthesis.onvoiceschanged = updateVoiceList;
        }
        
        // 역할 변경 이벤트
        document.getElementById('dialogRoleA').addEventListener('change', function() {
            const role = this.value;
            document.getElementById('dialogRoleB').value = role === 'A' ? 'B' : 'A';
        });
        
        document.getElementById('dialogRoleB').addEventListener('change', function() {
            const role = this.value;
            document.getElementById('dialogRoleA').value = role === 'A' ? 'B' : 'A';
        });

        // 초기화
        if (typeof updateStats === 'function') {
            updateStats();
        }
        if (typeof updateUILanguage === 'function') {
            updateUILanguage();
        }

        // 📱 학습창 풀스크린 토글