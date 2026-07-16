/**
 * modules/sentenceMode/sentenceAutoMode.js
 *
 * 문장 학습 — 입눈(자동재생) 모드의 실제 동작(카드 렌더링, 단계 전환,
 * 시작/정지, 이전/다음 이동)을 담당한다.
 *
 * sentenceMode.js(오케스트레이터)가 이 모듈을 생성/구동하며, 이 모듈은
 * core/playbackEngine.js에만 의존한다(다른 모듈의 내부 코드는 참조하지 않음).
 *
 * ── 이 모듈이 하는 일 ────────────────────────────────────────
 * - 1단계(문제만) 표시 → 설정 시간 경과 후 같은 카드 안에 2단계(정답)를
 *   이어서 표시 → 설정 시간 경과 후 다음 문제로 자동 전환
 * - 시작/정지 토글, 이전/다음 수동 이동, 진행 상태(현재/전체) 표시
 * - TTS 자동재생 옵션 처리는 core/playbackEngine.js에 위임(엔진의
 *   armMinTimeTimer + maybeAdvance + advanceToken 패턴 사용)
 *
 * ── 이 모듈이 하지 않는 일 ───────────────────────────────────
 * - 범위 지정/불러오기, 방향 선택 UI, 노출 시간 입력 UI 등 공통 설정
 *   화면은 sentenceMode.js가 소유한다. 이 모듈은 "이미 로드된 문장 배열"과
 *   "현재 방향/노출시간을 알려주는 함수"를 옵션으로 전달받아 사용할 뿐이다.
 * - 타이핑 입력/제출/대조는 sentenceTypingMode.js의 범위다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../core/playbackEngine.js'), require('../../core/wakeLock.js'));
  } else {
    root.sentenceAutoModeModule = factory(root.playbackEngine, root.wakeLockUtil);
  }
})(typeof self !== 'undefined' ? self : this, function (playbackEngine, wakeLockUtil) {
  'use strict';

  const DIRECTION_WRITING = 'writing'; // 영작: 해석 먼저 → 영어 문장 나중

  /**
   * 입눈(자동재생) 모드 컨트롤러를 생성한다.
   *
   * @param {object} deps
   * @param {HTMLElement} deps.els - sentenceMode.js가 만든 공통 DOM 엘리먼트 모음
   *   (cardArea, emptyState, cardProgress, cardPrimary, cardSecondary,
   *    primaryLabel, secondaryLabel, prevButton, nextButton, toggleButton,
   *    autoplayCheckbox)
   * @param {() => Array} deps.getSentences - 현재 로드된 문장 배열을 반환
   * @param {() => string} deps.getDirection - DIRECTION_READING/DIRECTION_WRITING 반환
   * @param {() => number} deps.getStageSeconds - 현재 단계(1 또는 2)의 노출 시간(초)을 반환
   *   (내부 stage 값에 따라 호출측이 stage1/stage2 초를 골라 반환해야 함)
   * @param {number} deps.speechRate - TTS 발화 속도
   * @param {string} [deps.lang] - 발음 언어 코드(다국어 TTS, 예: 'en-US').
   *        이 모듈은 언어를 판단하지 않고 core/playbackEngine에 그대로
   *        얹기만 한다(상위 sentenceMode.js가 현재 학습 언어를 결정해 넘긴다).
   * @param {(message: string, kind?: string) => void} deps.setStatus
   * @param {() => void} deps.updateNavButtons
   * @returns {{
   *   toggle: () => void,
   *   stop: () => void,
   *   start: () => void,
   *   isPlaying: () => boolean,
   *   goTo: (index: number) => void,
   *   showCurrent: (opts?: { speak?: boolean }) => void,
   *   rearmTimer: () => void,
   *   resetStage: () => void,
   *   getCurrentIndex: () => number,
   *   destroy: () => void,
   * }}
   */
  function createController(deps) {
    const els = deps.els;
    const getSentences = deps.getSentences;
    const getDirection = deps.getDirection;
    const getStageSeconds = deps.getStageSeconds;
    const setStatus = deps.setStatus;
    const updateNavButtons = deps.updateNavButtons;

    let currentIndex = 0; // 현재 보여주고 있는 문제 인덱스
    let stage = 1;        // 현재 카드의 단계(1: 문제만, 2: 정답까지 표시)

    // 타이머 걸기 / TTS 대기 / 다음 단계·문제로 전환 / 시작-정지 처리는
    // core/playbackEngine.js에 위임한다. 문장(item) 하나당 1단계(문제만)→
    // 2단계(정답까지) 두 단계를 갖는데, 엔진의 hasNextStep 기능으로 "같은
    // 문장 안에서 다음 단계 보여주기"와 "다음 문장으로 넘어가기"를 모두
    // 표현한다. onShowItem이 stage===1을 보여줬다면 hasNextStep:true를
    // 반환해 같은 인덱스로 다시 호출되게 하고(→ 2단계 표시), stage===2를
    // 보여줬다면 hasNextStep:false를 반환해 엔진이 다음 문장(index+1)으로
    // 넘어가게 한다.
    const engine = playbackEngine.createEngine({
      getItemCount: () => getSentences().length,
      getCurrentIndex: () => currentIndex,
      getIntervalSeconds: () => getStageSeconds(stage),
      isAutoplayEnabled: () => els.autoplayCheckbox.checked,
      speechRate: deps.speechRate,
      lang: deps.lang,
      onShowItem: (index, opts) => renderItem(index, opts),
      onStart: () => {
        els.toggleButton.textContent = '정지';
        els.toggleButton.classList.add('playing');
        // 세션 03(flashcard)과 동일한 패턴: 자동 재생이 실제로 시작될
        // 때만 화면 꺼짐 방지를 건다. 실패/미지원이어도 조용히 무시된다
        // (wakeLockUtil의 계약).
        wakeLockUtil.request();
      },
      onStop: () => {
        els.toggleButton.textContent = '시작';
        els.toggleButton.classList.remove('playing');
        wakeLockUtil.release();
      },
      onComplete: () => {
        setStatus('마지막 문장까지 재생했습니다.', 'success');
      },
    });

    /**
     * playbackEngine의 onShowItem 계약에 따라 호출된다(수동 이동/자동
     * 진행 공통 경로). 문장(item) 하나당 1단계(문제만)→2단계(정답까지)
     * 두 단계가 있으므로, 엔진이 넘겨주는 index가 이전과 같은 문장이면
     * (=sub-step으로 재호출된 경우) stage를 유지하고, 다른 문장이면
     * stage를 1로 리셋한다. 반환값의 hasNextStep으로 "1단계를 보여줬으니
     * 같은 문장 안에서 2단계가 더 있다"는 것을 엔진에 알린다.
     *
     * 이 함수는 타이머를 걸거나 다음으로 넘어가는 판단은 하지 않는다
     * (엔진의 책임). 오직 "카드를 그리고, 읽어줄 텍스트와 다음 단계
     * 존재 여부를 반환"하는 일만 한다.
     *
     * @param {number} index
     * @param {{ speak: boolean }} opts
     * @returns {{ text: string, hasNextStep: boolean }|null}
     */
    function renderItem(index, opts) {
      const sentences = getSentences();
      if (sentences.length === 0) return null;

      const clamped = Math.max(0, Math.min(index, sentences.length - 1));
      if (clamped !== currentIndex) {
        // 다른 문장으로 전환됨 → 1단계(문제만)부터 다시 시작
        currentIndex = clamped;
        stage = 1;
      }

      const item = sentences[currentIndex];
      const direction = getDirection();

      els.emptyState.style.display = 'none';
      els.cardArea.style.display = 'flex';
      els.cardProgress.textContent = `${currentIndex + 1} / ${sentences.length} (${item.id}번)`;

      const englishText = item.sentence || '(문장 없음)';
      const translationText = item.translation || '(해석 없음)';

      const primaryText = direction === DIRECTION_WRITING ? translationText : englishText;
      const secondaryText = direction === DIRECTION_WRITING ? englishText : translationText;

      els.cardPrimary.textContent = primaryText;

      if (stage >= 2) {
        els.cardSecondary.textContent = secondaryText;
        els.cardSecondary.style.display = 'block';
      } else {
        els.cardSecondary.textContent = '';
        els.cardSecondary.style.display = 'none';
      }

      updateNavButtons();

      // TTS 자동재생: 2단계에서는 이번에 "새로 드러난" 텍스트(secondaryText)를
      // 읽어주고, 1단계에서는 primaryText를 읽어준다. 문장이 길어 노출
      // 시간 안에 발음이 끝나지 않는 경우가 흔하므로 어디까지나 보조
      // 기능이며, 핵심 전환 로직은 엔진의 타이머 + 발음종료 대기가 담당한다.
      const textToSpeak = stage >= 2 ? secondaryText : primaryText;
      const hasNextStep = stage === 1; // 1단계를 보여줬다면 2단계가 더 남아있다.

      // 이번에 보여준 단계가 2단계였다면, 다음번 sub-step 호출에 대비해
      // 미리 stage를 올려둔다(엔진이 같은 index로 다시 onShowItem을
      // 부르는 것은 hasNextStep이 true였을 때뿐이므로, 여기서 stage를
      // 미리 2로 올려둬도 안전하다 — 다음 호출은 항상 "2단계 표시"를
      // 의미한다).
      if (stage === 1) {
        stage = 2;
      }

      return {
        text: (opts && opts.speak) ? textToSpeak : null,
        hasNextStep: hasNextStep,
      };
    }

    /**
     * 문제 이동(수동 버튼 클릭 전용 경로). 항상 1단계부터 다시 보여준다.
     * @param {number} index
     */
    function goTo(index) {
      if (getSentences().length === 0) return;
      // 수동/자동 이동 모두 항상 1단계(문제만)부터 다시 보여준다. 같은
      // 문장으로 이동하는 경우(renderItem의 "문장이 바뀌었을 때만 stage
      // 리셋" 판단만으로는 처리되지 않으므로) 여기서 명시적으로 stage를
      // 1로 되돌려둔다.
      stage = 1;
      engine.goTo(index);
    }

    function toggle() {
      if (getSentences().length === 0) {
        setStatus('먼저 범위를 불러온 뒤 시작할 수 있습니다.', 'error');
        return;
      }
      // 현재 문제의 현재 단계부터 즉시 이어간다. 다음 단계/다음 문제로의
      // 전환은 renderItem이 반환하는 hasNextStep을 엔진이 확인해 "노출
      // 시간 + 발음 종료" 조건이 충족될 때 자동으로 처리한다.
      engine.toggle();
    }

    /** 현재 인덱스를 유지한 채 처음(1단계)부터 다시 그린다(방향 전환 등에서 사용). */
    function showCurrent(opts) {
      stage = 1;
      renderItem(currentIndex, opts || { speak: false });
    }

    function resetStage() {
      stage = 1;
    }

    function destroy() {
      engine.destroy(); // 진행 중이던 타이머/TTS 콜백 정리는 엔진이 담당(재생 중이었다면 stop()이 호출되어 onStop을 통해 wake lock도 release됨)
      // engine.destroy()가 재생 중이었다면 stop()→onStop()을 거쳐 이미
      // release()를 호출했겠지만, 혹시 모를 상태 불일치에 대비해 한 번 더
      // 안전하게 해제한다(release()는 활성 상태가 아니면 아무 일도 하지
      // 않으므로 중복 호출해도 안전하다).
      wakeLockUtil.release();
    }

    return {
      toggle: toggle,
      stop: () => engine.stop(),
      start: () => engine.start(),
      isPlaying: () => engine.isPlaying(),
      goTo: goTo,
      showCurrent: showCurrent,
      rearmTimer: () => engine.rearmTimer(),
      resetStage: resetStage,
      getCurrentIndex: () => currentIndex,
      destroy: destroy,
    };
  }

  return { createController };
});
