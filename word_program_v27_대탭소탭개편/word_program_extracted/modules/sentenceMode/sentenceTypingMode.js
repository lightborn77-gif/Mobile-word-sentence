/**
 * modules/sentenceMode/sentenceTypingMode.js
 *
 * 문장 학습 — 타이핑 모드의 실제 동작(문제 표시, 입력/제출, 내 답과 정답
 * 대조 표시, 자동/수동 다음 이동)을 담당한다.
 *
 * sentenceMode.js(오케스트레이터)가 이 모듈을 생성/구동하며, 이 모듈은
 * 순수 setTimeout 기반으로 동작하고 다른 모듈의 내부 코드는 참조하지 않는다.
 *
 * ── 이 모듈이 하는 일 ────────────────────────────────────────
 * - 문제(1단계) 표시 → 입력 → 제출 → 내 답/정답 대조 화면 표시
 * - 대조 화면에서 "자동" 설정이면 설정된 유지 시간 후 다음 문제로 자동 전환,
 *   "수동" 설정이면 "다음 문제" 버튼으로만 전환
 * - 이전/다음 수동 이동
 *
 * ── 이 모듈이 하지 않는 일 ───────────────────────────────────
 * - 범위 지정/불러오기, 방향 선택 UI, 대조 화면 유지 시간·자동/수동 입력
 *   UI 등 공통 설정 화면은 sentenceMode.js가 소유한다. 이 모듈은 "이미
 *   로드된 문장 배열"과 "현재 방향/대조 유지시간/자동여부를 알려주는 함수"를
 *   옵션으로 전달받아 사용할 뿐이다.
 * - 입눈(자동재생) 카드 렌더링은 sentenceAutoMode.js의 범위다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../core/wakeLock.js'));
  } else {
    root.sentenceTypingModeModule = factory(root.wakeLockUtil);
  }
})(typeof self !== 'undefined' ? self : this, function (wakeLockUtil) {
  'use strict';

  const DIRECTION_WRITING = 'writing'; // 영작: 해석 먼저 → 영어 문장 나중

  /**
   * 타이핑 모드 컨트롤러를 생성한다.
   *
   * @param {object} deps
   * @param {HTMLElement} deps.els - sentenceMode.js가 만든 공통 DOM 엘리먼트 모음
   *   (cardArea, emptyState, cardProgress, typingPrimaryLabel, typingPrimaryText,
   *    typingInputArea, typingInput, typingReview, typingMyAnswer,
   *    typingCorrectAnswer, typingNextButton)
   * @param {() => Array} deps.getSentences - 현재 로드된 문장 배열을 반환
   * @param {() => string} deps.getDirection - DIRECTION_READING/DIRECTION_WRITING 반환
   * @param {() => number} deps.getReviewSeconds - 대조 화면 유지 시간(초)을 반환
   * @param {() => boolean} deps.isAdvanceAuto - 대조 화면 후 자동 전환 여부
   * @param {(message: string, kind?: string) => void} deps.setStatus
   * @param {() => void} deps.updateNavButtons
   * @returns {{
   *   showItem: (index: number) => void,
   *   goTo: (index: number, opts?: { manual?: boolean }) => void,
   *   handleSubmit: () => void,
   *   handleInputKeydown: (event: KeyboardEvent) => void,
   *   clearReviewTimer: () => void,
   *   getCurrentIndex: () => number,
   *   destroy: () => void,
   * }}
   */
  function createController(deps) {
    const els = deps.els;
    const getSentences = deps.getSentences;
    const getDirection = deps.getDirection;
    const getReviewSeconds = deps.getReviewSeconds;
    const isAdvanceAuto = deps.isAdvanceAuto;
    const setStatus = deps.setStatus;
    const updateNavButtons = deps.updateNavButtons;

    let currentIndex = 0;     // 현재 보여주고 있는 문제 인덱스
    let reviewTimerId = null; // 대조 화면 유지 후 자동 다음 이동 타이머

    /**
     * index 위치의 문제를 타이핑 모드로 표시한다(1단계: 문제만, 입력창 표시).
     * @param {number} index
     */
    function showItem(index) {
      const sentences = getSentences();
      if (sentences.length === 0) return;
      clearReviewTimer();

      currentIndex = Math.max(0, Math.min(index, sentences.length - 1));
      const item = sentences[currentIndex];
      const direction = getDirection();

      els.emptyState.style.display = 'none';
      els.cardArea.style.display = 'flex';
      els.cardProgress.textContent = `${currentIndex + 1} / ${sentences.length} (${item.id}번)`;

      const englishText = item.sentence || '(문장 없음)';
      const translationText = item.translation || '(해석 없음)';

      const primaryText = direction === DIRECTION_WRITING ? translationText : englishText;
      const secondaryText = direction === DIRECTION_WRITING ? englishText : translationText;

      els.typingPrimaryText.textContent = primaryText;
      els.typingInput.value = '';
      els.typingInput.dataset.correctAnswer = secondaryText;

      els.typingInputArea.style.display = 'flex';
      els.typingReview.style.display = 'none';
      els.typingNextButton.style.display = 'none';

      updateNavButtons();
      els.typingInput.focus();
    }

    function handleInputKeydown(event) {
      // textarea이므로 Ctrl+Enter(또는 Cmd+Enter)를 명확한 제출 단축키로 쓴다.
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        handleSubmit();
      }
    }

    function handleSubmit() {
      if (getSentences().length === 0) return;
      // 이미 대조 화면이 표시된 상태라면 중복 제출을 무시한다.
      if (els.typingReview.style.display !== 'none') return;

      const myAnswer = els.typingInput.value;
      const correctAnswer = els.typingInput.dataset.correctAnswer || '';

      els.typingMyAnswer.textContent = myAnswer.trim() === '' ? '(입력 없음)' : myAnswer;
      els.typingCorrectAnswer.textContent = correctAnswer;

      els.typingInputArea.style.display = 'none';
      els.typingReview.style.display = 'flex';

      const advanceAuto = isAdvanceAuto();
      els.typingNextButton.style.display = advanceAuto ? 'none' : 'inline-block';

      if (advanceAuto) {
        armReviewTimer();
      }
    }

    /**
     * "대조 화면 다음 넘어가기: 자동" 설정일 때, 제출 직후부터 자동으로
     * 다음 문제로 넘어가기까지의 대기 시간 동안 화면이 꺼지지 않도록
     * wake lock을 건다(세션 03/자동재생 모드와 동일한 원칙 — 자동으로
     * 진행되는 대기 시간에는 화면을 계속 봐야 하므로). 이 시간이 끝나
     * advanceToNext()가 다음 문제를 보여줄 때 clearReviewTimer가 다시
     * 불리며 release되고, 다음 문제가 자동/수동 어느 쪽이든 문제 없다
     * (자동이면 showItem 이후 다시 armReviewTimer가 걸릴 때 재요청됨).
     */
    function armReviewTimer() {
      clearReviewTimer();
      const ms = getReviewSeconds() * 1000;
      wakeLockUtil.request();
      reviewTimerId = setTimeout(() => {
        reviewTimerId = null;
        wakeLockUtil.release();
        advanceToNext();
      }, ms);
    }

    function clearReviewTimer() {
      if (reviewTimerId !== null) {
        clearTimeout(reviewTimerId);
        reviewTimerId = null;
        wakeLockUtil.release();
      }
    }

    function advanceToNext() {
      const sentences = getSentences();
      if (currentIndex >= sentences.length - 1) {
        setStatus('마지막 문장까지 학습했습니다.', 'success');
        return;
      }
      showItem(currentIndex + 1);
    }

    /**
     * 이전/다음 버튼으로 이동. 항상 1단계(문제만)부터 다시 보여준다.
     * @param {number} index
     * @param {{ manual?: boolean }} [opts]
     */
    function goTo(index, opts) {
      if (getSentences().length === 0) return;
      const manual = !!(opts && opts.manual);
      if (manual) {
        clearReviewTimer();
      }
      showItem(index);
    }

    function destroy() {
      clearReviewTimer(); // 자동 대조 타이머가 걸려 있었다면 여기서 wake lock도 함께 release됨
      // 혹시 모를 상태 불일치에 대비한 안전망(release()는 활성 상태가
      // 아니면 아무 일도 하지 않으므로 중복 호출해도 안전하다).
      wakeLockUtil.release();
    }

    /**
     * 지금 이 순간 "자동 대조 전환" 대기 타이머가 걸려있는지 여부.
     * wakeLockUtil.enableAutoReacquire()의 판단 콜백(오케스트레이터인
     * sentenceMode.js가 등록)에서, 탭이 백그라운드→포그라운드로 돌아온
     * 시점에 지금 이 모듈이 wake lock을 유지하고 있어야 하는지 알려주는
     * 용도로 쓰인다.
     * @returns {boolean}
     */
    function isWaitingForAutoAdvance() {
      return reviewTimerId !== null;
    }

    return {
      showItem: showItem,
      goTo: goTo,
      handleSubmit: handleSubmit,
      handleInputKeydown: handleInputKeydown,
      clearReviewTimer: clearReviewTimer,
      isWaitingForAutoAdvance: isWaitingForAutoAdvance,
      getCurrentIndex: () => currentIndex,
      destroy: destroy,
    };
  }

  return { createController };
});
