/* =========================================================
 * Theme (dark mode, UI appearance)
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * ========================================================= */


// ---------------------------------------------------------
// toggleDarkMode
// ---------------------------------------------------------

        function toggleDarkMode() {
            document.body.classList.toggle('dark-mode');
            const isDark = document.body.classList.contains('dark-mode');
            Storage.set('darkMode', isDark ? 'enabled' : 'disabled');
            document.getElementById('themeBtn').textContent = isDark ? '☀️' : '🌙';
        }

        if (Storage.get('darkMode') === 'enabled') {
            document.body.classList.add('dark-mode');
            document.getElementById('themeBtn').textContent = '☀️';
        }
        
        // ============================================
        // 🌐 언어 설정 복원
        // ============================================
        // UI 언어 복원
        const savedUILang = Storage.get('uiLang');
        if (savedUILang) {
            currentUILang = savedUILang;
        }
        
        // 학습 언어 복원
        const savedStudyLang = Storage.get('studyLang');
        if (savedStudyLang && STUDY_LANG_CONFIG[savedStudyLang]) {
            currentStudyLang = savedStudyLang;
            const studyLangSelect = document.getElementById('studyLangSelect');
            if (studyLangSelect) {
                studyLangSelect.value = savedStudyLang;
            }
        }

        // ============================================
        // 🎯 모드 선택 함수
        // ============================================
        // 모드 선택