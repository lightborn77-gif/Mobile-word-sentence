/**
 * core/playbackEngine.js
 *
 * 자동 재생(자동 진행) 공통 엔진.
 * flashcard 모듈에 있던 "최소 표시 시간 + 발음 종료, 두 조건이 모두
 * 충족되어야 다음으로 넘어간다"는 검증된 타이밍 로직을 모듈 독립적인
 * 형태로 뽑아낸 것이다. flashcard/quiz/sentenceMode 등 어떤 모듈이든
 * 이 엔진 하나로 "타이머 + TTS 대기 + 다음으로 전환 + 시작/정지"를
 * 처리할 수 있다.
 *
 * ── 이 모듈이 하는 일 ────────────────────────────────────────
 * - 타이머 걸기: 카드/문제 전환 간격(초)만큼 setTimeout을 건다.
 * - TTS(발음) 기다리기: ttsEngine.speak()의 onEnd/onError를 기다린다.
 * - 시간 다 되면 다음으로 넘어가기: "최소 표시 시간 경과" AND
 *   "발음 종료" 두 조건이 모두 충족되어야 advance 콜백을 호출한다.
 *   (자동재생이 꺼져 있으면 발음을 기다리지 않고 시간만으로 진행)
 * - 시작/정지 처리: start()/stop()/toggle()로 재생 상태를 관리한다.
 *
 * ── 설계 원칙 ──────────────────────────────────────────────
 * - 이 엔진은 "무엇을 보여줄지"(카드 렌더링, 문제 렌더링)는 전혀 모른다.
 *   호출부가 넘겨주는 onShowItem(index) 콜백이 화면 갱신과 TTS 재생
 *   여부를 스스로 결정한다. 이 엔진은 오직 타이밍/전환 판단만 담당한다.
 * - ttsEngine.speak/cancel만 사용하며, speechSynthesis를 직접 건드리지
 *   않는다(ttsEngine 설계 원칙과 동일하게 유지).
 * - advance token 방식으로 경쟁 상태(race condition)를 방지한다.
 *   아이템이 바뀔 때마다 토큰이 갱신되고, 이전 아이템에 대한 지연된
 *   타이머/TTS 콜백은 새 토큰과 비교해 무시된다.
 * - flashcard.js의 "발화 속도(rate)와 전환 간격(초)을 절대 같은 값으로
 *   섞어 쓰지 않는다"는 교훈을 그대로 반영해, speechRate와
 *   intervalSeconds를 완전히 분리된 옵션으로 받는다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./ttsEngine.js'));
  } else {
    root.playbackEngine = factory(root.ttsEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (ttsEngine) {
  'use strict';

  const DEFAULT_SPEECH_RATE = 1;

  /**
   * 자동 재생 컨트롤러를 만든다.
   *
   * @param {object} config
   * @param {() => number} config.getItemCount - 현재 전체 아이템 개수를 반환.
   * @param {() => number} config.getCurrentIndex - 현재 인덱스를 반환.
   * @param {(index: number, opts: { speak: boolean }) => (string|null|undefined)} config.onShowItem -
   *        index 위치의 아이템을 화면에 표시해야 할 때 호출된다.
   *        opts.speak가 true이면 이 아이템의 발음도 재생해야 한다는 뜻이다
   *        (호출부가 자동재생 체크박스 등 자체 판단을 opts.speak에 반영해
   *        넘겨줄 수도 있고, 엔진의 autoplay 옵션에 맡길 수도 있다).
   *        반환값으로 "읽어줄 텍스트"를 문자열로 주면, 그 텍스트가 있고
   *        opts.speak가 true일 때 엔진이 ttsEngine.speak()를 호출해 발음을
   *        재생하고 발음 종료까지 대기한다. null/undefined/빈 문자열을
   *        반환하면(또는 opts.speak가 false이면) 발음을 기다리지 않고
   *        곧바로 "발음 종료" 조건이 충족된 것으로 처리한다.
   * @param {() => void} [config.onComplete] - 마지막 아이템까지 재생을 마치고
   *        자동으로 정지되었을 때 호출된다.
   * @param {() => void} [config.onStart] - start()로 재생이 시작될 때 호출된다.
   * @param {() => void} [config.onStop] - stop()으로 재생이 멈출 때(수동/자동
   *        정지, destroy 포함) 호출된다.
   * @param {() => number} config.getIntervalSeconds - 전환 간격(초)을 반환하는
   *        함수. 호출부의 슬라이더 값을 실시간으로 반영할 수 있도록 고정값이
   *        아니라 함수로 받는다.
   * @param {() => boolean} [config.isAutoplayEnabled] - 자동재생(발음) 체크박스
   *        상태를 반환. 생략하면 항상 true(발음 켜짐)로 간주한다.
   * @param {number} [config.speechRate=1] - TTS 발화 속도. 전환 간격(초)과는
   *        절대 같은 값을 쓰지 않는다(별도 개념).
   * @param {string} [config.lang] - 발음 언어 코드(BCP 47, 예: 'en-US').
   *        이 엔진은 언어를 판단하지 않고 ttsEngine.speak(..., { lang })에
   *        그대로 얹기만 한다(호출부(sentenceMode 등)가 현재 학습 언어를
   *        결정해 넘겨준다).
   *
   * @returns {{
   *   start: () => void,
   *   stop: () => void,
   *   toggle: () => void,
   *   isPlaying: () => boolean,
   *   goTo: (index: number) => void,
   *   destroy: () => void,
   * }}
   */
  function createEngine(config) {
    const cfg = config || {};

    if (typeof cfg.getItemCount !== 'function') {
      throw new Error('playbackEngine.createEngine: getItemCount 함수가 필요합니다.');
    }
    if (typeof cfg.getCurrentIndex !== 'function') {
      throw new Error('playbackEngine.createEngine: getCurrentIndex 함수가 필요합니다.');
    }
    if (typeof cfg.onShowItem !== 'function') {
      throw new Error('playbackEngine.createEngine: onShowItem 함수가 필요합니다.');
    }
    if (typeof cfg.getIntervalSeconds !== 'function') {
      throw new Error('playbackEngine.createEngine: getIntervalSeconds 함수가 필요합니다.');
    }

    const speechRate = Number.isFinite(Number(cfg.speechRate)) && Number(cfg.speechRate) > 0
      ? Number(cfg.speechRate)
      : DEFAULT_SPEECH_RATE;

    const isAutoplayEnabled = typeof cfg.isAutoplayEnabled === 'function'
      ? cfg.isAutoplayEnabled
      : function () { return true; };

    let playing = false;
    let destroyed = false;
    let timerId = null;

    // 아이템이 바뀔 때마다 갱신되는 토큰. 이전 아이템에 대한 지연된
    // 타이머/TTS 콜백이 새 아이템 전환에 잘못 영향을 주는 경쟁 상태를 막는다.
    let advanceToken = 0;
    let minTimeElapsed = false;
    let speechEnded = false;
    // 마지막 onShowItem 호출이 "이 index 안에 다음 단계가 더 있다"고
    // 표시했는지(sentenceMode의 1→2단계처럼). true면 maybeAdvance가
    // index를 바꾸지 않고 같은 index로 showItem을 다시 호출한다.
    let pendingHasNextStep = false;

    function clearTimer() {
      if (timerId !== null) {
        clearTimeout(timerId);
        timerId = null;
      }
    }

    /**
     * index 위치의 아이템을 표시하고, 재생 중이면 그 아이템에 대한
     * "최소 표시 시간 + 발음 종료" 대기를 새로 건다.
     *
     * onShowItem은 문자열(읽어줄 텍스트) 또는
     * { text?: string, hasNextStep?: boolean } 객체를 반환할 수 있다.
     * hasNextStep이 true이면, 이번 대기 조건이 충족되었을 때 다음
     * 아이템(index+1)으로 넘어가는 대신 같은 index를 유지한 채
     * onShowItem을 다시 호출한다(예: sentenceMode의 1단계→2단계처럼
     * 같은 문제 안에서 다음 단계를 보여주는 경우). 그다음 호출에서
     * hasNextStep이 false/생략되면 그때 비로소 다음 아이템으로 넘어간다.
     *
     * @param {number} index
     * @param {boolean} [forceSpeak] - true이면 재생 중이 아니어도(자동재생
     *        체크박스가 켜져 있는 한) 이번 표시에서 발음을 재생한다.
     *        수동 이동(goTo)이 "정지 상태에서도 자동재생 체크박스가
     *        켜져 있으면 눌러 넘길 때마다 발음이 난다"는 동작을 유지하기
     *        위해 사용한다. 이 경우에도 타이머/자동 다음-전환은 걸리지
     *        않는다(재생 중이 아니므로).
     */
    function showItem(index, forceSpeak) {
      const count = cfg.getItemCount();
      if (count <= 0) return;

      const clamped = Math.max(0, Math.min(index, count - 1));
      const myToken = ++advanceToken;
      minTimeElapsed = false;
      speechEnded = false;

      const shouldSpeak = (playing || !!forceSpeak) && isAutoplayEnabled();
      const result = cfg.onShowItem(clamped, { speak: shouldSpeak });
      const isResultObject = result && typeof result === 'object';
      const textToSpeak = isResultObject ? result.text : result;
      pendingHasNextStep = isResultObject ? !!result.hasNextStep : false;

      if (shouldSpeak && textToSpeak) {
        ttsEngine.speak(textToSpeak, speechRate, {
          lang: cfg.lang,
          onEnd: () => handleSpeechSettled(myToken),
          onError: () => handleSpeechSettled(myToken),
        });
      } else {
        ttsEngine.cancel();
        // 발음을 재생하지 않으면 "발음 종료"를 기다릴 필요가 없으므로
        // 곧바로 충족된 것으로 처리한다(최소 표시 시간만으로 진행).
        speechEnded = true;
      }

      if (playing) {
        armMinTimeTimer(myToken);
        maybeAdvance(myToken);
      }
    }

    /**
     * 최소 표시 시간(전환 간격) 타이머를 건다.
     * @param {number} token
     */
    function armMinTimeTimer(token) {
      clearTimer();
      const intervalMs = Math.max(0, Number(cfg.getIntervalSeconds()) || 0) * 1000;
      timerId = setTimeout(() => {
        timerId = null;
        minTimeElapsed = true;
        maybeAdvance(token);
      }, intervalMs);
    }

    /**
     * TTS 발화가 끝나면(정상 종료든 에러든) 호출된다.
     * @param {number} token
     */
    function handleSpeechSettled(token) {
      if (token !== advanceToken) return; // 이미 다음 아이템으로 넘어간 뒤의 지연 콜백은 무시
      speechEnded = true;
      maybeAdvance(token);
    }

    /**
     * "최소 표시 시간 경과"와 "발음 종료" 두 조건이 모두 충족되었을 때만
     * 다음 아이템으로 자동 전환한다. 고정 타이머만으로 무조건 넘어가면
     * 전환 간격보다 발화가 길어질 때 발음이 중간에 끊기므로, 반드시 두
     * 조건을 함께 확인한다.
     * @param {number} token
     */
    function maybeAdvance(token) {
      if (!playing || destroyed) return;
      if (token !== advanceToken) return;
      if (!minTimeElapsed || !speechEnded) return;

      const current = cfg.getCurrentIndex();

      if (pendingHasNextStep) {
        // 같은 아이템 안에 다음 단계가 더 있다(예: 문장의 정답 단계).
        // index는 그대로 두고 onShowItem을 다시 호출해 다음 단계를 그린다.
        showItem(current);
        return;
      }

      const count = cfg.getItemCount();

      if (current >= count - 1) {
        // 마지막 아이템까지 도달하면 자동 진행을 멈춘다.
        stop();
        if (typeof cfg.onComplete === 'function') cfg.onComplete();
        return;
      }

      showItem(current + 1);
    }

    /**
     * 현재 아이템부터 자동 재생을 시작한다.
     */
    function start() {
      if (destroyed) return;
      if (cfg.getItemCount() <= 0) return;
      if (playing) return;

      playing = true;
      if (typeof cfg.onStart === 'function') cfg.onStart();
      showItem(cfg.getCurrentIndex());
    }

    /**
     * 자동 재생을 멈춘다(타이머 해제 + 진행 중인 TTS 취소).
     */
    function stop() {
      const wasPlaying = playing;
      playing = false;
      clearTimer();
      ttsEngine.cancel();
      if (wasPlaying && typeof cfg.onStop === 'function') cfg.onStop();
    }

    function toggle() {
      if (playing) {
        stop();
      } else {
        start();
      }
    }

    function isPlaying() {
      return playing;
    }

    /**
     * 현재 대기 중인 최소 표시 시간 타이머를 getIntervalSeconds()의 최신
     * 값으로 다시 건다. 재생 중이 아니거나, 이미 최소 표시 시간이 지난
     * 상태(발음 종료만 기다리는 중)라면 아무 일도 하지 않는다 — 이미
     * 끝난 대기를 다시 기다리게 만들지 않기 위함이다. 사용자가 재생
     * 도중 전환 간격 슬라이더/입력값을 바꿀 때 호출부(flashcard 등)가
     * 사용한다.
     */
    function rearmTimer() {
      if (!playing || destroyed) return;
      if (minTimeElapsed) return;
      armMinTimeTimer(advanceToken);
    }

    /**
     * 재생 중 여부와 무관하게 특정 인덱스로 이동해 표시한다(수동 이동용).
     * 재생 중이었다면 그 아이템부터 "최소 표시 시간 + 발음 종료" 대기를
     * 새로 시작한다. 재생 중이 아니었다면 타이머는 걸지 않지만, 자동재생
     * 체크박스가 켜져 있는 한 발음은 재생한다(수동으로 이전/다음을 눌러
     * 넘길 때마다 발음이 나는 기존 동작 유지) — forceSpeak=true로 넘긴다.
     * @param {number} index
     */
    function goTo(index) {
      if (destroyed) return;
      if (cfg.getItemCount() <= 0) return;
      clearTimer();
      showItem(index, true);
    }

    /**
     * 엔진을 정리한다. 모듈의 destroy() 시점에 반드시 호출해야
     * 지연된 타이머/TTS 콜백이 정리된 후에도 실행되지 않는다.
     */
    function destroy() {
      destroyed = true;
      advanceToken += 1;
      stop();
    }

    return {
      start,
      stop,
      toggle,
      isPlaying,
      goTo,
      rearmTimer,
      destroy,
    };
  }

  return {
    createEngine,
  };
});
