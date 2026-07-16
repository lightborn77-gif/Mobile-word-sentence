/**
 * core/touchGesture.js
 *
 * 좌우 스와이프 감지 공용 유틸. 순수 바닐라 JS(touchstart/touchmove/touchend,
 * 선택적으로 mousedown/mousemove/mouseup)로 구현하며 외부 라이브러리를
 * 쓰지 않는다. flashcard/sentenceMode/conversationMode 등 카드형 화면
 * (세션 03~05에서 실제 연결)이 이 모듈을 통해 "왼쪽/오른쪽으로 스와이프
 * 했다"는 사실만 전달받고, 그 스와이프를 "다음/이전 카드로 넘긴다"는
 * 의미로 해석하는 것은 항상 호출부의 책임이다.
 *
 * ── 이 모듈이 하는 일 ────────────────────────────────────────
 * - 지정한 element에 터치(및 선택적으로 마우스) 이벤트를 붙여 드래그
 *   시작점~끝점 사이의 이동 거리/시간/방향을 계산한다.
 * - 아래 조건을 모두 만족할 때만 스와이프로 인정하고 onSwipeLeft 또는
 *   onSwipeRight 콜백을 호출한다.
 *   1) 수평 이동 거리가 minDistance 이상
 *   2) 걸린 시간이 maxDurationMs 이하 (너무 느린 드래그는 스크롤/선택
 *      동작과 구분하기 위해 스와이프로 치지 않는다)
 *   3) 수직 이동 거리가 수평 이동 거리의 maxVerticalRatio를 넘지 않음
 *      (세로 스크롤과 스와이프를 구분한다)
 *
 * ── 설계 원칙 ──────────────────────────────────────────────
 * - "스와이프 방향이 무엇을 의미하는지"(다음 카드/이전 카드/탭 전환 등)는
 *   이 모듈이 판단하지 않는다. 항상 호출부가 onSwipeLeft/onSwipeRight
 *   콜백 안에서 원하는 동작(예: 기존 engine.goTo() 재호출)을 연결한다.
 * - 세로 스크롤을 방해하지 않는 것을 최우선으로 한다. touchmove에서
 *   preventDefault()는 "이번 제스처가 수평 방향임이 이미 확실할 때만"
 *   호출한다. 그렇지 않으면 카드 화면에서 세로 스크롤이 막혀버린다.
 * - 여러 요소에 동시에 attachSwipe()를 붙일 수 있으며, 반환되는
 *   destroy()를 모듈의 unmount() 시점에 호출해 이벤트 리스너가 누수되지
 *   않게 한다(기존 모듈들이 document.removeEventListener로 keydown을
 *   정리하는 것과 동일한 패턴).
 * - 이 모듈 자체는 아무 상태도 전역으로 두지 않는다. attachSwipe()를
 *   호출할 때마다 독립된 클로저 상태(시작 좌표, 시각 등)를 새로 만든다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.touchGesture = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DEFAULT_MIN_DISTANCE = 50;
  const DEFAULT_MAX_DURATION_MS = 600;
  const DEFAULT_MAX_VERTICAL_RATIO = 0.5;

  /**
   * element에 좌우 스와이프 감지를 붙인다.
   *
   * @param {HTMLElement} element - 스와이프를 감지할 대상 요소
   * @param {object} [options]
   * @param {() => void} [options.onSwipeLeft] - 왼쪽으로 스와이프했을 때 호출
   * @param {() => void} [options.onSwipeRight] - 오른쪽으로 스와이프했을 때 호출
   * @param {number} [options.minDistance=50] - 스와이프로 인정할 최소 수평 이동 거리(px)
   * @param {number} [options.maxDurationMs=600] - 스와이프로 인정할 최대 소요 시간(ms).
   *        이보다 느리게 이동하면 스크롤/드래그로 보고 무시한다.
   * @param {number} [options.maxVerticalRatio=0.5] - 수직 이동 거리가 수평 이동
   *        거리의 이 비율을 넘으면 스와이프를 취소한다(세로 스크롤과 구분).
   * @returns {{ destroy: () => void }} 이벤트 리스너를 해제하는 destroy 함수
   */
  function attachSwipe(element, options) {
    if (!element || typeof element.addEventListener !== 'function') {
      // 잘못된 element가 넘어와도 앱 전체가 죽지 않도록 아무 일도 하지
      // 않는 destroy만 반환한다(다른 core 모듈의 "미지원 환경 조용히 무시"
      // 원칙과 동일).
      return { destroy: function () {} };
    }

    const opts = options || {};
    const minDistance = Number.isFinite(Number(opts.minDistance)) && Number(opts.minDistance) > 0
      ? Number(opts.minDistance)
      : DEFAULT_MIN_DISTANCE;
    const maxDurationMs = Number.isFinite(Number(opts.maxDurationMs)) && Number(opts.maxDurationMs) > 0
      ? Number(opts.maxDurationMs)
      : DEFAULT_MAX_DURATION_MS;
    const maxVerticalRatio = Number.isFinite(Number(opts.maxVerticalRatio)) && Number(opts.maxVerticalRatio) >= 0
      ? Number(opts.maxVerticalRatio)
      : DEFAULT_MAX_VERTICAL_RATIO;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let tracking = false;
    // touchmove 도중 "이번 제스처는 수평 스와이프다"라고 이미 판단했는지.
    // 한 번 true가 되면 이후 move에서 계속 preventDefault()를 호출해
    // 스크롤이 중간에 끼어들지 않게 한다.
    let horizontalLockedIn = false;

    function reset() {
      tracking = false;
      horizontalLockedIn = false;
    }

    function handleStart(x, y) {
      tracking = true;
      horizontalLockedIn = false;
      startX = x;
      startY = y;
      startTime = Date.now();
    }

    /**
     * 이동 중 호출된다. 아직 스와이프 종료 여부는 판단하지 않고, 오직
     * "지금 이 제스처가 수평 방향으로 확실히 기울었는지"만 판단해
     * horizontalLockedIn을 세운다. 이 값이 true일 때만 호출부가
     * preventDefault()를 호출해도 되는지 알려주는 판단 근거로 쓰인다.
     * @param {number} x
     * @param {number} y
     * @returns {boolean} 지금 시점에 preventDefault를 호출해야 하면 true
     */
    function handleMove(x, y) {
      if (!tracking) return false;

      const deltaX = x - startX;
      const deltaY = y - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);

      if (!horizontalLockedIn) {
        // 아직 방향이 애매하면(이동량이 너무 작으면) 판단을 보류한다.
        // 이동량이 어느 정도 쌓였고, 수평이 수직보다 명확히 크면 그때
        // 비로소 "이건 가로 스와이프다"라고 확정한다.
        if (absX > 10 && absX > absY) {
          horizontalLockedIn = true;
        }
      }

      return horizontalLockedIn;
    }

    /**
     * 제스처가 끝났을 때 호출된다. 조건을 모두 만족하면 onSwipeLeft/
     * onSwipeRight 중 해당하는 콜백을 호출한다.
     * @param {number} x
     * @param {number} y
     */
    function handleEnd(x, y) {
      if (!tracking) return;

      const deltaX = x - startX;
      const deltaY = y - startY;
      const absX = Math.abs(deltaX);
      const absY = Math.abs(deltaY);
      const elapsed = Date.now() - startTime;

      reset();

      if (absX < minDistance) return;
      if (elapsed > maxDurationMs) return;
      if (absX * maxVerticalRatio < absY) return; // 수직 이동이 과도하면 취소

      if (deltaX < 0) {
        if (typeof opts.onSwipeLeft === 'function') opts.onSwipeLeft();
      } else {
        if (typeof opts.onSwipeRight === 'function') opts.onSwipeRight();
      }
    }

    // ── 터치 이벤트 (필수) ────────────────────────────────────
    function onTouchStart(event) {
      const touch = event.touches && event.touches[0];
      if (!touch) return;
      handleStart(touch.clientX, touch.clientY);
    }

    function onTouchMove(event) {
      const touch = event.touches && event.touches[0];
      if (!touch) return;
      const shouldPreventDefault = handleMove(touch.clientX, touch.clientY);
      // 수평 스와이프로 확정된 경우에만 preventDefault를 호출해 세로
      // 스크롤을 막는다. 그렇지 않으면(방향이 애매하거나 세로 스크롤인
      // 경우) 브라우저 기본 스크롤 동작을 그대로 둔다.
      if (shouldPreventDefault && event.cancelable) {
        event.preventDefault();
      }
    }

    function onTouchEnd(event) {
      const touch = (event.changedTouches && event.changedTouches[0])
        || (event.touches && event.touches[0]);
      if (!touch) {
        reset();
        return;
      }
      handleEnd(touch.clientX, touch.clientY);
    }

    function onTouchCancel() {
      reset();
    }

    // touchmove에서 조건부로 preventDefault()를 호출해야 하므로 passive:
    // false로 등록한다(passive:true면 preventDefault가 무시된다).
    element.addEventListener('touchstart', onTouchStart, { passive: true });
    element.addEventListener('touchmove', onTouchMove, { passive: false });
    element.addEventListener('touchend', onTouchEnd, { passive: true });
    element.addEventListener('touchcancel', onTouchCancel, { passive: true });

    // ── 마우스 이벤트 (데스크톱에서도 테스트 가능하도록, 필수는 아니지만
    //    지원. 마우스 버튼을 누른 상태로 이동 중일 때만 추적한다) ──────
    let mouseTracking = false;

    function onMouseDown(event) {
      mouseTracking = true;
      handleStart(event.clientX, event.clientY);
    }

    function onMouseMove(event) {
      if (!mouseTracking) return;
      // 마우스는 세로 스크롤과 경쟁할 일이 없으므로 preventDefault는
      // 호출하지 않는다(텍스트 드래그 선택 정도만 발생할 수 있음).
      handleMove(event.clientX, event.clientY);
    }

    function onMouseUp(event) {
      if (!mouseTracking) return;
      mouseTracking = false;
      handleEnd(event.clientX, event.clientY);
    }

    function onMouseLeave() {
      if (!mouseTracking) return;
      mouseTracking = false;
      reset();
    }

    element.addEventListener('mousedown', onMouseDown);
    // mousemove/mouseup은 요소 밖으로 마우스가 나가도 드래그가 끝까지
    // 추적되도록 element가 아닌 document에 등록한다.
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    element.addEventListener('mouseleave', onMouseLeave);

    /**
     * 등록한 모든 이벤트 리스너를 해제한다. 모듈의 unmount() 시점에
     * 반드시 호출해야 이벤트 리스너 누수가 없다.
     */
    function destroy() {
      element.removeEventListener('touchstart', onTouchStart);
      element.removeEventListener('touchmove', onTouchMove);
      element.removeEventListener('touchend', onTouchEnd);
      element.removeEventListener('touchcancel', onTouchCancel);

      element.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      element.removeEventListener('mouseleave', onMouseLeave);
    }

    return { destroy };
  }

  return {
    attachSwipe,
  };
});
