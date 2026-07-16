/**
 * core/stateManager.js
 *
 * 단어별 학습 상태(미테스트/별표/큰별표/안정권) 판정 및 갱신 로직을 담당하는
 * 순수 함수 모듈. IndexedDB나 다른 core 모듈에 의존하지 않는다.
 * (실제 저장/조회는 core/wordStore.js가 이 모듈을 호출해서 처리한다.)
 *
 * ── 상태 판정 규칙 (작업지시서 공통 안내 기준) ─────────────────
 * - untested(미테스트): 퀴즈로 한 번도 출제된 적 없는 단어
 *     → wordState.tested === false 일 때
 * - bigStarred(큰별표): wrongCount >= 5
 * - starred(별표): wrongCount >= 1 이고, 아래 안정권 조건을 충족하지 않음
 * - stable(안정권): wrongCount >= 1 이고
 *     (consecutiveCorrect >= 5 또는 correctCount >= 10)
 *
 * 상태는 배타적 플래그로 저장되는 것이 아니라, wordState에 저장된 누적
 * 카운터(wrongCount, correctCount, consecutiveCorrect, tested)로부터
 * 매번 계산되는 파생값이다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.stateManager = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const STATUS = {
    UNTESTED: 'untested',
    STARRED: 'starred',
    BIG_STARRED: 'bigStarred',
    STABLE: 'stable',
  };

  const BIG_STARRED_THRESHOLD = 5; // wrongCount >= 5 → bigStarred
  const STABLE_CONSECUTIVE_THRESHOLD = 5; // consecutiveCorrect >= 5 → stable 조건 충족
  const STABLE_TOTAL_CORRECT_THRESHOLD = 10; // correctCount >= 10 → stable 조건 충족

  /**
   * wordState(카운터 데이터)로부터 현재 상태 라벨 하나를 계산한다.
   *
   * 우선순위:
   *   1) tested === false           → 'untested'
   *   2) wrongCount >= 5             → 'bigStarred'
   *   3) 안정권 조건 충족(wrongCount>=1 이고, consecutiveCorrect>=5 또는 correctCount>=10)
   *                                   → 'stable'
   *   4) wrongCount >= 1             → 'starred'
   *   5) 그 외(오답 이력 없음, 출제는 됨) → 'untested'로 취급하지 않고 그대로
   *      "오답 없음" 상태이므로 안정권/별표 어느 것도 아니다. 이 경우
   *      호출부(필터/뱃지)에서는 별도 라벨 없이 취급한다. → null 반환.
   *
   * @param {{ tested?: boolean, wrongCount: number, correctCount: number, consecutiveCorrect: number }} wordState
   * @returns {'untested'|'starred'|'bigStarred'|'stable'|null}
   */
  function calculateStatus(wordState) {
    if (!wordState) return STATUS.UNTESTED;

    const tested = !!wordState.tested;
    const wrongCount = Number(wordState.wrongCount) || 0;
    const correctCount = Number(wordState.correctCount) || 0;
    const consecutiveCorrect = Number(wordState.consecutiveCorrect) || 0;

    if (!tested) {
      return STATUS.UNTESTED;
    }

    if (wrongCount >= BIG_STARRED_THRESHOLD) {
      return STATUS.BIG_STARRED;
    }

    const isStable =
      wrongCount >= 1 &&
      (consecutiveCorrect >= STABLE_CONSECUTIVE_THRESHOLD ||
        correctCount >= STABLE_TOTAL_CORRECT_THRESHOLD);

    if (isStable) {
      return STATUS.STABLE;
    }

    if (wrongCount >= 1) {
      return STATUS.STARRED;
    }

    // 출제는 되었지만(tested === true) 아직 한 번도 틀린 적 없는 단어.
    // 명시적인 4개 상태 어디에도 속하지 않으므로 null로 반환하고
    // 호출부에서 "정상(오답 없음)"으로 취급하게 한다.
    return null;
  }

  /**
   * 퀴즈 정오답 결과 하나를 wordState에 반영한 "새 객체"를 반환한다.
   * (인자로 받은 wordState는 변경하지 않고, 갱신된 사본을 돌려주는 순수 함수)
   *
   * 갱신 규칙:
   * - tested: 항상 true로 설정 (이 함수가 호출된다는 것 자체가 출제되었다는 뜻)
   * - isCorrect === true  → correctCount + 1, consecutiveCorrect + 1
   * - isCorrect === false → wrongCount + 1, consecutiveCorrect = 0
   * - lastTestedAt: 현재 시각(timestamp)으로 갱신
   *
   * @param {{ tested?: boolean, wrongCount: number, correctCount: number, consecutiveCorrect: number, lastTestedAt?: number|null }} wordState
   * @param {boolean} isCorrect
   * @returns {{ tested: boolean, wrongCount: number, correctCount: number, consecutiveCorrect: number, lastTestedAt: number }}
   */
  function recordResult(wordState, isCorrect) {
    const prev = wordState || {
      wrongCount: 0,
      correctCount: 0,
      consecutiveCorrect: 0,
      tested: false,
      lastTestedAt: null,
    };

    const next = {
      ...prev,
      tested: true,
      lastTestedAt: Date.now(),
    };

    if (isCorrect) {
      next.correctCount = (Number(prev.correctCount) || 0) + 1;
      next.consecutiveCorrect = (Number(prev.consecutiveCorrect) || 0) + 1;
      next.wrongCount = Number(prev.wrongCount) || 0;
    } else {
      next.wrongCount = (Number(prev.wrongCount) || 0) + 1;
      next.consecutiveCorrect = 0;
      next.correctCount = Number(prev.correctCount) || 0;
    }

    return next;
  }

  return {
    STATUS,
    calculateStatus,
    recordResult,
  };
});
