/**
 * core/ttsEngine.js
 *
 * 발음 재생 공통 모듈. Web Speech API(SpeechSynthesisUtterance)를 이용해
 * 영어 단어/문장을 읽어주는 순수 기능만 제공한다.
 * flashcard/quiz/result 등 다른 모듈은 이 파일이 export하는 speak/cancel만
 * 사용하고, speechSynthesis를 직접 건드리지 않는다.
 *
 * ── 설계 원칙 ────────────────────────────────────────────────
 * - "재생 여부"를 이 모듈 내부에 전역 on/off 상태로 두지 않는다.
 *   자동재생을 켤지 끌지는 항상 호출부(flashcard 등)가 판단해서
 *   speak()를 호출할지 말지로 결정한다. 이 모듈은 그저 "말하기"만 한다.
 * - 이전 발화가 끝나기 전에 새 발화가 겹쳐 씹히는 문제를 막기 위해,
 *   매 speak() 호출 시 이전 발화를 취소(cancel)한 뒤 새로 시작한다.
 * - speechSynthesis는 비동기이며 브라우저 최초 호출 시 지연이 있을 수
 *   있으므로, speak()는 재생 시작/종료/에러 시점을 콜백 또는 Promise로
 *   알려줄 수 있게 하여 호출부가 "카드 전환 타이밍"과 "발음 종료 타이밍"을
 *   분리해서 다룰 수 있도록 한다.
 * - speak()는 처음부터 options.lang을 받아왔다(호출부가 안 넘기면 'en-US'
 *   기본값). "어떤 언어인지"는 이 모듈이 판단하지 않고 항상 호출부가
 *   결정해서 넘겨준다(다른 core 모듈과 마찬가지로 이 모듈은 언어 자체에
 *   대한 정책을 갖지 않는다).
 *
 * ── 다국어 TTS 확장 ──────────────────────────────────────────
 * - getVoices(): 현재 브라우저가 실제로 가진 음성 목록을
 *   speechSynthesis.getVoices()로 그대로 반환한다. 지원 언어를 코드에
 *   하드코딩하지 않고, "이 브라우저(크롬/엣지 등)가 지금 뭘 지원하는지"를
 *   있는 그대로 노출하는 방식 — 브라우저/OS가 바뀌어도 이 파일은 수정할
 *   필요가 없다.
 * - onVoicesChanged(callback): 일부 브라우저는 음성 목록이 비동기로 늦게
 *   채워진다(최초 호출 시 빈 배열이 반환될 수 있음). speechSynthesis의
 *   'voiceschanged' 이벤트를 구독해, 목록이 채워지는 시점에 호출부가
 *   다시 그릴 수 있게 콜백을 전달한다. 구독 해제 함수를 반환한다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.ttsEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function isSupported() {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  /**
   * 현재 진행 중이거나 대기 중인 발화를 즉시 중단한다.
   * speak() 내부에서도 새 발화 전에 호출하지만, 호출부가 "지금 당장
   * 조용히 시키고 싶을 때"(예: 정지 버튼, 카드 강제 전환) 직접 쓸 수 있게
   * 별도로 export한다.
   */
  function cancel() {
    if (!isSupported()) return;
    window.speechSynthesis.cancel();
  }

  /**
   * 텍스트를 영어 음성으로 읽는다.
   *
   * @param {string} text - 읽을 텍스트(단어/문장)
   * @param {number} [rate=1] - 재생 속도. SpeechSynthesisUtterance.rate에
   *        그대로 전달된다(브라우저 허용 범위 대략 0.1~10, 보통 0.5~2 권장).
   *        호출부(flashcard의 카드 전환 간격 슬라이더 등)가 결정해서 넘긴다.
   * @param {object} [options]
   * @param {string} [options.lang='en-US'] - 발화 언어
   * @param {() => void} [options.onStart] - 발화가 실제로 시작되는 시점 콜백
   * @param {() => void} [options.onEnd] - 발화가 끝난 시점 콜백
   *        (에러로 중단된 경우에도 최종적으로 호출되어, 호출부가
   *        "재생이 끝났다"는 것만 보고 다음 단계로 넘어갈 수 있게 한다)
   * @param {(err: any) => void} [options.onError] - 에러 콜백
   * @returns {Promise<void>} 발화가 끝나면(성공/에러 무관) resolve되는 Promise.
   *        호출부가 콜백 대신 await로 "발음이 끝날 때까지 대기"하고 싶을 때
   *        사용할 수 있다.
   */
  function speak(text, rate, options) {
    const opts = options || {};

    return new Promise((resolve) => {
      if (!isSupported()) {
        if (opts.onError) opts.onError(new Error('이 브라우저는 Web Speech API(음성 합성)를 지원하지 않습니다.'));
        resolve();
        return;
      }

      if (!text || String(text).trim() === '') {
        resolve();
        return;
      }

      // 이전 발화가 끝나기 전에 새 발화가 겹치지 않도록, 새로 시작하기 전에
      // 항상 큐/진행 중인 발화를 정리한다.
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(String(text));
      utterance.lang = opts.lang || 'en-US';

      const numericRate = Number(rate);
      utterance.rate = Number.isFinite(numericRate) && numericRate > 0 ? numericRate : 1;

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      utterance.onstart = function () {
        if (opts.onStart) opts.onStart();
      };

      utterance.onend = function () {
        if (opts.onEnd) opts.onEnd();
        finish();
      };

      utterance.onerror = function (event) {
        if (opts.onError) opts.onError(event.error || event);
        if (opts.onEnd) opts.onEnd();
        finish();
      };

      // 브라우저(특히 Chrome)는 speechSynthesis가 처음 호출될 때
      // 음성 목록 로딩 지연으로 speak() 직후 바로 시작되지 않을 수 있다.
      // 별도의 폴링 없이 speak를 바로 호출하고, 시작/종료는 위 이벤트로만
      // 판단한다(카드 전환 타이밍과의 분리는 호출부가 담당).
      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * 현재 브라우저가 갖고 있는 음성(voice) 목록을 그대로 반환한다.
   * 지원 언어를 이 코드가 미리 정해두지 않고, speechSynthesis가 노출하는
   * 실제 목록을 그대로 넘기는 방식이다(크롬/엣지 등 브라우저·OS에 따라
   * 자동으로 다른 목록이 나온다).
   *
   * 브라우저에 따라 최초 호출 시 빈 배열이 나올 수 있으므로(아래
   * onVoicesChanged 참고), 호출부는 필요하면 onVoicesChanged로 갱신
   * 시점을 함께 구독하는 것을 권장한다.
   *
   * @returns {Array<SpeechSynthesisVoice>} 미지원 환경이면 빈 배열
   */
  function getVoices() {
    if (!isSupported()) return [];
    return window.speechSynthesis.getVoices() || [];
  }

  /**
   * 음성 목록이 (비동기로) 채워지거나 바뀔 때마다 callback을 호출한다.
   * 반환된 함수를 호출하면 구독을 해제한다.
   *
   * @param {() => void} callback
   * @returns {() => void} 구독 해제 함수
   */
  function onVoicesChanged(callback) {
    if (!isSupported() || typeof callback !== 'function') {
      return function noop() {};
    }
    window.speechSynthesis.addEventListener('voiceschanged', callback);
    return function unsubscribe() {
      window.speechSynthesis.removeEventListener('voiceschanged', callback);
    };
  }

  return {
    isSupported,
    speak,
    cancel,
    getVoices,
    onVoicesChanged,
  };
});
