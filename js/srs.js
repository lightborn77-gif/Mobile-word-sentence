/* =========================================================
 * SRS core
 * Generated: 2026-02-10 20:55:40
 * Notes:
 * - This file is part of the "split/annotated" refactor.
 * - Functions/variables are kept global (non-module) to avoid breaking behavior.
 * [P3-MOB-1 / P3-MOB-2] 2026-02-27
 *   - settings 전역변수 직접 참조 → App.State.getSetting() 으로 전환
 *   - vocabulary 전역변수 직접 참조 → App.State.getVocabulary() 로 전환
 *   - clearCache() → App.State.clearCache() 로 전환
 *   - saveLocal/getSettingsHash 는 data_unified.js 전역 래퍼 유지
 * ========================================================= */


// ---------------------------------------------------------
// getFiltered
// ---------------------------------------------------------

        function getFiltered() {
            const hash       = getSettingsHash();
            const stateCache = App.State.getCache();
            const stateHash  = App.State.getCurrentSettingsHash();
            if (stateCache.filtered && stateHash === hash) {
                return stateCache.filtered;
            }

            const vocabulary = App.State.getVocabulary();
            const start = parseInt(document.getElementById('startIdx').value) - 1;
            const end   = parseInt(document.getElementById('endIdx').value);
            let pool = vocabulary.slice(start, end);

            const unmem = App.State.getSetting('unmem');
            const star  = App.State.getSetting('star');
            const safe  = App.State.getSetting('safe');

            if (unmem || star || safe) {
                pool = pool.filter(v =>
                    (unmem && v.quizCount === 0) ||
                    (star  && v.w > 0)           ||
                    (safe  && v.isSafe)
                );
            }

            App.State.setCurrentSettingsHash(hash);
            const updatedCache = App.State.getCache();
            updatedCache.filtered = pool;
            App.State.setCache(updatedCache);
            return pool;
        }

        // SRS 아이템 가져오기
// ---------------------------------------------------------
// getSRSItems
// ---------------------------------------------------------

        function getSRSItems() {
            const today       = new Date().toISOString().slice(0, 10);
            const vocabulary  = App.State.getVocabulary();
            const start       = parseInt(document.getElementById('startIdx').value) - 1;
            const end         = parseInt(document.getElementById('endIdx').value);

            const srsNewOnly  = App.State.getSetting('srsNewOnly');
            const srsHardOnly = App.State.getSetting('srsHardOnly');

            let pool = vocabulary.filter(v => {
                if (v.num <= start || v.num > end) return false;
                if (!v.lastSeen) return srsNewOnly;

                const daysSince = Math.floor((new Date(today) - new Date(v.lastSeen)) / 86400000);
                let due = daysSince >= v.interval;

                if (srsHardOnly && v.w >= 3) return true;
                if (v.w >= 1) due = due || daysSince >= Math.max(1, Math.floor(v.interval / 2));
                if (!v.m) return true;

                return due;
            });

            pool.sort((a, b) => {
                const aLast = a.lastSeen ? new Date(a.lastSeen).getTime() : 0;
                const bLast = b.lastSeen ? new Date(b.lastSeen).getTime() : 0;
                return aLast - bLast;
            });

            return pool;
        }

        // SRS 업데이트
// ---------------------------------------------------------
// updateSRS
// ---------------------------------------------------------

        function updateSRS(item, correct) {
            const today     = new Date().toISOString().slice(0, 10);
            const easeMode  = App.State.getSetting('easeMode');
            const lapseMode = App.State.getSetting('lapseMode');

            item.lastSeen  = today;
            item.quizCount = (item.quizCount || 0) + 1;

            if (correct) {
                item.interval = Math.max(1, Math.round((item.interval || 1) * easeMode));
                item.m = true;
                item.correctStreak = (item.correctStreak || 0) + 1;
                item.totalCorrect  = (item.totalCorrect  || 0) + 1;

                // 안정권 조건: 연속 5회 또는 총 10회 정답
                if (item.correctStreak >= 5 || item.totalCorrect >= 10) {
                    item.isSafe = true;
                    item.w = 0;
                } else {
                    item.w = Math.max(0, item.w - 1);
                }
            } else {
                if (lapseMode === 0.0) {
                    item.interval = 1;
                } else {
                    item.interval = Math.max(1, Math.round(item.interval * lapseMode));
                }
                item.w++;
                item.correctStreak = 0;
                item.isSafe = false;

                // 오답 날짜 기록
                const todayIso = new Date().toISOString().slice(0, 10);
                if (!item.wrongDates) item.wrongDates = [];
                if (!item.wrongDates.includes(todayIso)) {
                    item.wrongDates.push(todayIso);
                }
            }
            saveLocal();
            App.State.clearCache();
        }

        // 화면 업데이트
