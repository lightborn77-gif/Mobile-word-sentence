/* =========================================================
 * Wake Lock Manager
 * TTS/자동재생 중 화면 꺼짐 방지
 * ========================================================= */

const WakeLock = (() => {
    let _sentinel = null;
    let _acquired = false;

    async function acquire() {
        // 이미 보유 중이면 중복 요청 안 함
        if (_acquired && _sentinel) return;

        if (!('wakeLock' in navigator)) {
            console.info('[WakeLock] Wake Lock API 미지원 브라우저');
            return;
        }

        try {
            _sentinel = await navigator.wakeLock.request('screen');
            _acquired = true;
            console.info('[WakeLock] 화면 잠금 획득 - 재생 중 화면 꺼짐 방지');

            // 화면이 숨겨졌다가 다시 보이면(예: 다른 앱 갔다 복귀) 자동 재획득
            _sentinel.addEventListener('release', () => {
                _acquired = false;
                _sentinel = null;
                console.info('[WakeLock] 잠금 해제됨');
                // isRunning 상태이면 재획득 시도
                if (typeof isRunning !== 'undefined' && isRunning) {
                    acquire();
                }
            });
        } catch (err) {
            console.warn('[WakeLock] 획득 실패:', err.message);
        }
    }

    async function release() {
        if (_sentinel) {
            try {
                await _sentinel.release();
            } catch (err) {
                console.warn('[WakeLock] 해제 실패:', err.message);
            }
            _sentinel = null;
        }
        _acquired = false;
        console.info('[WakeLock] 화면 잠금 해제 - 정상 절전 복귀');
    }

    // 페이지가 다시 visible 상태가 되면 재획득 (화면 잠금 후 복귀 시)
    document.addEventListener('visibilitychange', async () => {
        if (document.visibilityState === 'visible') {
            if (typeof isRunning !== 'undefined' && isRunning && !_acquired) {
                await acquire();
            }
        }
    });

    return { acquire, release };
})();
