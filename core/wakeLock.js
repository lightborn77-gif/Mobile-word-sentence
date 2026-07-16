/**
 * core/wakeLock.js
 *
 * 화면 자동 꺼짐 방지(Screen Wake Lock API) 공용 유틸.
 * flashcard/sentenceMode/conversationMode 등 자동 재생 중인 화면
 * (세션 03~05에서 실제 연결)이 재생을 시작할 때 request(), 재생을
 * 멈추거나 끝날 때 release()를 호출하는 방식으로 사용한다.
 *
 * ── 이 모듈이 하는 일 ────────────────────────────────────────
 * - navigator.wakeLock.request('screen')을 감싸 Promise<boolean>으로
 *   단순화한다.
 * - 브라우저가 Wake Lock을 지원하지 않으면(구형 iOS Safari 등) 조용히
 *   무시한다 — isSupported()가 false를 반환할 뿐, 에러를 던지거나
 *   콘솔을 어지럽히지 않는다. "지원 안 함"을 사용자에게 안내할지는
 *   호출부가 isSupported()를 보고 결정한다(ttsEngine.isSupported()와
 *   동일한 패턴).
 * - 탭이 백그라운드로 갔다가 다시 포그라운드로 돌아오면 iOS/Android
 *   공통으로 브라우저가 Wake Lock을 자동 해제해버릴 수 있다. 이 모듈은
 *   document의 visibilitychange를 내부에서 직접 구독해, 문서가 다시
 *   보이는 시점에 "지금 재생 중이어야 하는 상태"라면 자동으로 다시
 *   request()를 호출해준다(enableAutoReacquire 참고).
 *
 * ── 설계 원칙 ──────────────────────────────────────────────
 * - 이 모듈은 "언제 wake lock을 걸고 언제 풀지"를 스스로 판단하지 않는다
 *   (ttsEngine이 "언제 말할지"를 판단하지 않는 것과 동일한 원칙). 각
 *   재생 모듈이 재생 시작/정지 시점에 명시적으로 request()/release()를
 *   부른다.
 * - 자동 재요청 여부 판단에 필요한 "지금 재생 중인지" 정보도 이 모듈이
 *   직접 알지 못한다. enableAutoReacquire(isCurrentlyPlaying)로 호출부가
 *   콜백을 넘겨주면, 그 콜백의 반환값만 보고 재요청 여부를 결정한다.
 * - 여러 모듈이 번갈아 wake lock을 쓸 수 있으므로 내부에 sentinel(현재
 *   요청 객체) 하나만 유지하는 단순한 싱글턴 상태로 관리한다. 두 화면이
 *   동시에 wake lock을 걸 일은 없다는 전제(앱이 한 번에 화면 하나만
 *   보여주는 구조)를 따른다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.wakeLockUtil = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  let sentinel = null;
  // enableAutoReacquire()로 등록된 "지금 재생 중인지" 콜백. null이면
  // 자동 재요청 기능이 꺼져 있는 것과 같다.
  let isCurrentlyPlayingCallback = null;
  let visibilityListenerAttached = false;

  function isSupported() {
    return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  }

  function isActive() {
    return sentinel !== null;
  }

  /**
   * 화면이 자동으로 꺼지지 않도록 wake lock을 요청한다.
   * 이미 활성 상태이면 다시 요청하지 않고 true를 반환한다.
   *
   * @returns {Promise<boolean>} 성공(또는 이미 활성 상태)이면 true,
   *          미지원이거나 요청이 실패하면 false. 절대 reject하지 않는다
   *          (호출부가 매번 try/catch를 두지 않아도 되도록).
   */
  function request() {
    if (!isSupported()) {
      return Promise.resolve(false);
    }
    if (sentinel !== null) {
      return Promise.resolve(true);
    }

    return navigator.wakeLock.request('screen').then((newSentinel) => {
      sentinel = newSentinel;

      // 브라우저가 (배터리 절약 정책, 탭 최소화 등) 스스로 wake lock을
      // 해제했을 때도 내부 상태를 반드시 동기화한다. 그러지 않으면
      // isActive()가 실제와 다르게 true를 반환하게 된다.
      sentinel.addEventListener('release', () => {
        if (sentinel === newSentinel) {
          sentinel = null;
        }
      });

      ensureVisibilityListener();
      return true;
    }).catch(() => {
      // 권한 정책(예: 탭이 보이지 않는 상태에서 요청) 등으로 실패할 수
      // 있다. 에러를 조용히 삼키고 false만 알린다 — 호출부는 대개
      // "화면 꺼짐 방지가 안 걸렸다" 정도로만 알면 충분하다.
      sentinel = null;
      return false;
    });
  }

  /**
   * 현재 wake lock을 해제한다. 활성 상태가 아니면 아무 일도 하지 않는다.
   * @returns {Promise<void>}
   */
  function release() {
    if (sentinel === null) {
      return Promise.resolve();
    }
    const current = sentinel;
    sentinel = null;
    return current.release().catch(() => {
      // 이미 브라우저 쪽에서 해제된 뒤라 release()가 실패하는 경우가
      // 있을 수 있다. 어차피 목표(잠금 해제)는 달성된 상태이므로 무시.
    });
  }

  /**
   * 문서가 다시 보이는 상태가 될 때(visibilitychange) "지금 재생
   * 중이어야 하는지"를 등록된 콜백에게 물어보고, true면 wake lock을
   * 다시 요청한다. 리스너는 모듈 전체에서 단 한 번만 등록한다.
   */
  function ensureVisibilityListener() {
    if (visibilityListenerAttached) return;
    if (typeof document === 'undefined') return;

    visibilityListenerAttached = true;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (typeof isCurrentlyPlayingCallback !== 'function') return;
      if (!isCurrentlyPlayingCallback()) return;

      // 이미 활성 상태면(드물게 브라우저가 해제하지 않은 경우) 다시
      // 요청할 필요가 없다. request()가 알아서 이 경우를 처리한다.
      request();
    });
  }

  /**
   * 탭이 백그라운드에서 포그라운드로 돌아왔을 때 wake lock을 자동으로
   * 재요청할 수 있게 설정한다. 재생 모듈(flashcard 등)이 재생을 시작할
   * 때 한 번 호출해두면, 이후 화면이 꺼졌다 켜져도 이 모듈이 알아서
   * 재요청한다.
   *
   * 참고: 이 함수는 "지금 이 순간" wake lock을 걸지 않는다. 오직
   * visibilitychange 시점에 사용할 콜백만 등록한다. 실제 재생 시작
   * 시점의 wake lock 요청은 호출부가 request()를 직접 불러야 한다.
   *
   * @param {() => boolean} isCurrentlyPlaying - 문서가 다시 보이는
   *        시점에 호출되어, 지금 재생이 계속되고 있어야 하면 true를
   *        반환해야 하는 콜백.
   */
  function enableAutoReacquire(isCurrentlyPlaying) {
    isCurrentlyPlayingCallback = typeof isCurrentlyPlaying === 'function'
      ? isCurrentlyPlaying
      : null;
    ensureVisibilityListener();
  }

  /**
   * enableAutoReacquire로 등록한 콜백을 해제한다. 재생 모듈이
   * unmount()될 때 호출해, 이미 사라진 모듈의 "재생 중인지" 콜백이
   * 계속 불리는 일이 없게 한다.
   */
  function disableAutoReacquire() {
    isCurrentlyPlayingCallback = null;
  }

  return {
    isSupported,
    isActive,
    request,
    release,
    enableAutoReacquire,
    disableAutoReacquire,
  };
});
