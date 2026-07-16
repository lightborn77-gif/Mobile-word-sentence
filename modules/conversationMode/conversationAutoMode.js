/**
 * modules/conversationMode/conversationAutoMode.js
 *
 * 회화 모드 — 자동 재생(턴 진행) 컨트롤러.
 * core/playbackEngine.js를 그대로(수정 없이) 재사용해서 "턴 표시 →
 * (상대 역할이면) TTS 재생 → 화자별 노출/대기 시간 경과 → 다음 턴" 흐름을
 * 만든다. modules/sentenceMode/sentenceAutoMode.js를 참고 템플릿으로
 * 삼았다(엔진을 감싸는 얇은 컨트롤러 패턴).
 *
 * ── 재생 로직 설계 근거: 엔진을 수정하지 않은 이유 ────────────
 * playbackEngine.js는 수정하지 않았다. 아래 두 가지 요구사항 모두
 * 호출부(이 파일)에서 기존 엔진의 계약만으로 표현 가능했기 때문이다.
 *
 * 1) "내 역할 턴에서는 TTS 침묵" 요구사항
 *    → onShowItem(index, opts)의 반환값에서 opts.speak가 true여도
 *      해당 턴이 "내 역할"이면 text를 null로 반환한다. 엔진은 이미
 *      "text가 없으면(=null/undefined/빈 문자열) 발음을 기다리지 않고
 *      곧바로 발음-종료 조건을 충족된 것으로 처리"하는 로직을 갖고
 *      있으므로(playbackEngine.js의 showItem 참고), 엔진 수정 없이
 *      "내 턴은 침묵, 상대 턴만 TTS"를 구현할 수 있었다.
 *
 * 2) "화자별로 다른 노출/대기 시간" 요구사항
 *    → getIntervalSeconds()는 인자 없이 호출되는 함수 한 개뿐이지만,
 *      이 콜백 내부에서 "현재 턴(currentIndex)의 speaker가 a인지
 *      b인지"를 판단해 서로 다른 값을 반환하도록 만들면 그만이었다.
 *      sentenceAutoMode.js가 stage(1/2)에 따라 다른 초를 반환하는
 *      것과 동일한 패턴이며, 여기서는 stage 대신 speaker로 분기한다.
 *
 * 결론적으로 엔진 자체에는 옵션을 추가하지 않았고, 따라서
 * flashcard/quiz/sentenceMode 등 기존 사용처에는 어떤 영향도 없다.
 * ------------------------------------------------------------
 *
 * ── 이 모듈이 하는 일 ────────────────────────────────────────
 * - 턴 하나를 카드에 표시(대사 + 해석)
 * - 상대 역할 턴이면 TTS로 대사를 읽어주고, 내 역할 턴이면 침묵
 * - 화자(a/b)별로 다른 노출/대기 시간 적용
 * - 시작/정지 토글, 이전/다음 수동 이동, 진행 상태(현재/전체) 표시
 *
 * ── 이 모듈이 하지 않는 일 ───────────────────────────────────
 * - 파일 업로드/파싱/저장, 역할 선택 UI, 시간 슬라이더 UI 등 공통 설정
 *   화면은 conversationMode.js(오케스트레이터)가 소유한다. 이 모듈은
 *   "이미 로드된 턴 배열"과 "현재 내 역할/화자별 시간을 알려주는 함수"를
 *   옵션으로 전달받아 사용할 뿐이다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../core/playbackEngine.js'), require('../../core/wakeLock.js'));
  } else {
    root.conversationAutoModeModule = factory(root.playbackEngine, root.wakeLockUtil);
  }
})(typeof self !== 'undefined' ? self : this, function (playbackEngine, wakeLockUtil) {
  'use strict';

  /**
   * 회화 모드 자동 재생 컨트롤러를 생성한다.
   *
   * @param {object} deps
   * @param {HTMLElement} deps.els - conversationMode.js가 만든 공통 DOM
   *   엘리먼트 모음(emptyState, cardArea, cardProgress, speakerBadge,
   *   cardLine, cardTranslation, prevButton, nextButton, toggleButton)
   * @param {() => Array} deps.getTurns - 현재 로드된 턴 배열을 반환
   *   (배열 원소: {turn, speaker:'a'|'b', line, translation})
   * @param {() => 'a'|'b'} deps.getMyRole - 사용자가 선택한 "나의 역할"
   * @param {(speaker: 'a'|'b') => number} deps.getSpeakerSeconds - 해당
   *   화자 턴의 노출/대기 시간(초)을 반환
   * @param {number} deps.speechRate - TTS 발화 속도
   * @param {string} [deps.lang] - 발음 언어 코드(다국어 TTS, 예: 'en-US').
   *   이 모듈은 언어를 판단하지 않고 core/playbackEngine에 그대로 얹는다.
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
   *   getCurrentIndex: () => number,
   *   destroy: () => void,
   * }}
   */
  function createController(deps) {
    const els = deps.els;
    const getTurns = deps.getTurns;
    const getMyRole = deps.getMyRole;
    const getSpeakerSeconds = deps.getSpeakerSeconds;
    const setStatus = deps.setStatus;
    const updateNavButtons = deps.updateNavButtons;

    let currentIndex = 0; // 현재 보여주고 있는 턴 인덱스

    // 타이머 걸기 / TTS 대기 / 다음 턴 전환 / 시작-정지 처리는
    // core/playbackEngine.js에 위임한다(수정 없이 재사용, 위 설계 판단
    // 주석 참고).
    const engine = playbackEngine.createEngine({
      getItemCount: () => getTurns().length,
      getCurrentIndex: () => currentIndex,
      getIntervalSeconds: () => {
        const turns = getTurns();
        const item = turns[currentIndex];
        const speaker = item ? item.speaker : 'a';
        return getSpeakerSeconds(speaker);
      },
      isAutoplayEnabled: () => true, // 회화모드는 별도 자동발음 체크박스를 두지 않는다(상대 역할 턴은 항상 읽어준다).
      speechRate: deps.speechRate,
      lang: deps.lang,
      onShowItem: (index, opts) => renderItem(index, opts),
      onStart: () => {
        els.toggleButton.textContent = '정지';
        els.toggleButton.classList.add('playing');
        // 세션 03(flashcard)/세션 04(sentenceMode)와 동일한 패턴: 자동
        // 재생이 실제로 시작될 때만 화면 꺼짐 방지를 건다. 실패/미지원
        // 이어도 조용히 무시된다(wakeLockUtil의 계약).
        wakeLockUtil.request();
      },
      onStop: () => {
        els.toggleButton.textContent = '시작';
        els.toggleButton.classList.remove('playing');
        wakeLockUtil.release();
      },
      onComplete: () => {
        setStatus('마지막 턴까지 재생했습니다.', 'success');
      },
    });

    /**
     * playbackEngine의 onShowItem 계약에 따라 호출된다(수동 이동/자동
     * 진행 공통 경로). 턴을 카드에 그리고, "내 역할 턴이면 null, 상대
     * 역할 턴이면 대사 텍스트"를 반환해 침묵/발음을 가른다.
     *
     * @param {number} index
     * @param {{ speak: boolean }} opts
     * @returns {{ text: string|null }|null}
     */
    function renderItem(index, opts) {
      const turns = getTurns();
      if (turns.length === 0) return null;

      const clamped = Math.max(0, Math.min(index, turns.length - 1));
      currentIndex = clamped;

      const item = turns[currentIndex];
      const myRole = getMyRole();
      const isMyTurn = item.speaker === myRole;

      els.emptyState.style.display = 'none';
      els.cardArea.style.display = 'flex';
      els.cardProgress.textContent = `${currentIndex + 1} / ${turns.length}`;

      els.speakerBadge.textContent = item.speaker === 'a' ? 'A' : 'B';
      els.speakerBadge.classList.toggle('cm-speaker-me', isMyTurn);
      els.speakerBadge.classList.toggle('cm-speaker-partner', !isMyTurn);

      els.cardLine.textContent = item.line || '';
      els.cardTranslation.textContent = item.translation || '';

      updateNavButtons();

      // 내 역할 턴은 TTS를 침묵시킨다(설계 판단 주석 1번 참고). 상대
      // 역할 턴만 대사를 읽어준다.
      const textToSpeak = isMyTurn ? null : item.line;

      return {
        text: (opts && opts.speak) ? textToSpeak : null,
      };
    }

    /**
     * 턴 이동(수동 버튼 클릭 전용 경로).
     * @param {number} index
     */
    function goTo(index) {
      if (getTurns().length === 0) return;
      engine.goTo(index);
    }

    function toggle() {
      if (getTurns().length === 0) {
        setStatus('먼저 회화 데이터를 불러온 뒤 시작할 수 있습니다.', 'error');
        return;
      }
      engine.toggle();
    }

    /** 현재 인덱스를 유지한 채 다시 그린다(역할 전환 등에서 사용). */
    function showCurrent(opts) {
      renderItem(currentIndex, opts || { speak: false });
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
      getCurrentIndex: () => currentIndex,
      destroy: destroy,
    };
  }

  return { createController };
});
