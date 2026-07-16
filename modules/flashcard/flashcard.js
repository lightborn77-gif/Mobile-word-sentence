/**
 * modules/flashcard/flashcard.js
 *
 * 깜박이 모드(플래시카드 자동재생) 모듈.
 * 오직 core(wordStore, ttsEngine)만 참조하며, quiz/result 등 다른 모듈의
 * 내부 코드는 절대 직접 참조하지 않는다(아키텍처 원칙).
 *
 * ── 주요 기능 ────────────────────────────────────────────────
 * - 카드 UI: 단어와 뜻이 동시에 보이도록 표시
 * - 재생속도(카드 전환 간격) 조절: 0.5초 단위 슬라이더/숫자 입력
 * - 자동재생 체크박스: 카드 전환마다 ttsEngine.speak 자동 호출(끄면 무음)
 * - 시작/정지 단일 토글 버튼(+ 스페이스바 단축키)
 * - 이전/다음 수동 이동 버튼
 * - 범위 지정: wordStore.getWordsInRange
 *
 * 이 모듈은 index.html에 자신의 UI를 삽입할 컨테이너 엘리먼트를 받아
 * 그 안에 전체 화면을 그리는 방식으로 동작한다(app/main.js가 진입점 연결).
 *
 * ── 상위(app/main.js)와의 연동 지점 ──────────────────────────────
 * - options.getWords(startId, endId): "현재 필터에 해당하는 단어만"
 *   옵션이 켜져 있을 때 wordStore.getWordsInRange 대신 필터가 적용된
 *   조회 함수를 주입하는 자리이며, 전달하지 않으면 기존 그대로
 *   wordStore.getWordsInRange / getAllWords를 사용한다(하위 호환).
 *   이 모듈은 필터 로직 자체를 알지 못하며, "범위를 받아 단어 배열을
 *   반환하는 함수"라는 계약만 알 뿐이다(모듈 독립성 유지).
 * - options.initialSettings / options.onSettingsChange: 전역 설정
 *   패널의 값(재생속도/자동재생)으로 이 모듈의 초기 UI 상태를 맞추고,
 *   사용자가 값을 바꿀 때마다 onSettingsChange로 최신 값을 알려 상위가
 *   저장할 수 있게 한다. 전달하지 않으면 기존 기본값을 그대로
 *   사용한다(하위 호환).
 *
 * ── 발음 재생 타이밍 설계 근거 (재발 방지용 기록) ───────────────
 * 1) 발화 속도(rate)와 카드 전환 간격(interval)은 서로 다른 값이다.
 *    과거 showCard()가 ttsEngine.speak(word, rate) 호출 시 "카드 전환
 *    간격(초)" 값을 그대로 rate(발화 속도 배율) 자리에 넘긴 적이 있었다.
 *    간격 값(1~8)이 배속으로 들어가면 발음이 지나치게 빨라지거나
 *    (뭉개짐), 브라우저가 비정상적인 rate로 판단해 재생을 시작하지
 *    못하는 경우가 생긴다. → 발화 속도는 항상 SPEECH_RATE(=1, 정상
 *    속도)로 고정하고, 카드 전환 간격은 오직 타이밍 계산에만 사용하도록
 *    반드시 분리해서 유지한다.
 * 2) 발음이 중간에 끊기지 않으려면 "표시 시간 경과"와 "발음 종료"
 *    두 조건을 모두 확인해야 한다. 고정 setTimeout(scheduleNext)만으로
 *    다음 카드 전환을 예약하면, 발음이 간격보다 길어지거나
 *    speechSynthesis 시작 지연이 있을 때 발화 도중 다음 카드로 강제
 *    전환되어(speak() 내부의 cancel()이 이전 발화를 끊음) 소리가
 *    잘린다. → "최소 표시 시간(간격) 경과"와 "이 카드 발음이 실제로
 *    끝남(onEnd/onError)" 두 조건이 모두 충족되어야만 다음 카드로
 *    넘어가도록(maybeAdvance) 유지한다. advanceToken으로 카드가 바뀔
 *    때마다 이전 카드의 지연된 콜백을 무효화해 경쟁 상태도 방지한다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../core/wordStore.js'),
      require('../../core/ttsEngine.js'),
      require('../../core/playbackEngine.js'),
      require('../../core/touchGesture.js'),
      require('../../core/wakeLock.js')
    );
  } else {
    root.flashcardModule = factory(root.wordStore, root.ttsEngine, root.playbackEngine, root.touchGesture, root.wakeLockUtil);
  }
})(typeof self !== 'undefined' ? self : this, function (wordStore, ttsEngine, playbackEngine, touchGesture, wakeLockUtil) {
  'use strict';

  const MIN_INTERVAL = 1.0;   // 카드 전환 간격(=최소 표시 시간) 최소값(초)
  const MAX_INTERVAL = 8.0;   // 카드 전환 간격(=최소 표시 시간) 최대값(초)
  const STEP_INTERVAL = 0.5;  // 0.5초 단위 조절
  const DEFAULT_INTERVAL = 2.5;
  // "파생어/예문 자동 표시" 옵션이 켜져 있는 동안 적용되는 카드 전환
  // 간격 최소값(초). 파생어/예문까지 읽을 시간을 확보하기 위해 일반
  // 최소값(MIN_INTERVAL)보다 크게 강제한다.
  const MIN_INTERVAL_WITH_EXTRA = 3.0;
  const SPEECH_RATE = 1;      // TTS 발화 속도(SpeechSynthesisUtterance.rate)는 항상 정상 속도로 고정.
                               // 카드 전환 간격(초)은 "다음 카드로 넘어가기까지 걸리는 시간"이지
                               // 발화 속도 배율이 아니므로, 이 둘을 절대 같은 값으로 섞어 쓰지 않는다.

  // 글자 크기 기본값(px). 사용자가 입력해 바꿀 수 있지만 저장하지
  // 않으므로, 이 화면을 벗어났다가 다시 들어오면 항상 이 값으로 시작한다.
  const DEFAULT_WORD_SIZE = 32;
  const DEFAULT_MEANING_SIZE = 18;
  const DEFAULT_EXTRA_SIZE = 13;
  const FONT_SIZE_LIMITS = {
    word: { min: 12, max: 120 },
    meaning: { min: 10, max: 80 },
    extra: { min: 10, max: 60 },
  };

  /**
   * 깜박이 모드 화면을 containerEl 내부에 마운트한다.
   *
   * @param {HTMLElement} containerEl - 깜박이 모드 UI를 그릴 컨테이너
   * @param {object} [options]
   * @param {(startId:number, endId:number) => Promise<Array>} [options.getWords] -
   *        범위를 받아 단어 배열을 반환하는 함수. 전달하지 않으면
   *        wordStore.getWordsInRange/getAllWords를 그대로 사용한다.
   * @param {{ intervalSeconds?: number, autoplay?: boolean }} [options.initialSettings] -
   *        전역 설정 패널에서 넘겨주는 초기값.
   * @param {(settings: { intervalSeconds:number, autoplay:boolean }) => void} [options.onSettingsChange] -
   *        사용자가 재생속도/자동재생 값을 바꿀 때마다 호출(전역 설정 저장용).
   * @param {string} [options.filterLabel] - "현재 필터 적용 중" 등 상위가 넘겨주는
   *        안내 문구. getWords가 필터 조회 함수일 때, 범위 입력란 옆에
   *        표시해 사용자가 지금 필터가 함께 적용되고 있음을 알 수 있게 한다.
   * @param {string} [options.lang] - 발음 언어 코드(다국어 TTS, 예: 'en-US').
   *        이 모듈은 언어를 판단하지 않고 core/playbackEngine에 그대로
   *        얹기만 한다. 전달하지 않으면 ttsEngine 기본값('en-US')을 쓴다.
   * @returns {{ destroy: () => void }} 모드를 벗어날 때 정리(destroy)할 수 있는 핸들
   */
  function mount(containerEl, options) {
    if (!containerEl) {
      throw new Error('flashcardModule.mount: containerEl이 필요합니다.');
    }

    const modeOptions = options || {};
    const getWordsFn = typeof modeOptions.getWords === 'function' ? modeOptions.getWords : null;

    containerEl.innerHTML = buildMarkup();

    const els = {
      rangeStart: containerEl.querySelector('[data-fc="rangeStart"]'),
      rangeEnd: containerEl.querySelector('[data-fc="rangeEnd"]'),
      loadButton: containerEl.querySelector('[data-fc="loadButton"]'),
      statusLine: containerEl.querySelector('[data-fc="statusLine"]'),
      cardWord: containerEl.querySelector('[data-fc="cardWord"]'),
      cardMeaning: containerEl.querySelector('[data-fc="cardMeaning"]'),
      cardProgress: containerEl.querySelector('[data-fc="cardProgress"]'),
      emptyState: containerEl.querySelector('[data-fc="emptyState"]'),
      cardArea: containerEl.querySelector('[data-fc="cardArea"]'),
      card: containerEl.querySelector('.fc-card'),
      prevButton: containerEl.querySelector('[data-fc="prevButton"]'),
      nextButton: containerEl.querySelector('[data-fc="nextButton"]'),
      toggleButton: containerEl.querySelector('[data-fc="toggleButton"]'),
      autoplayCheckbox: containerEl.querySelector('[data-fc="autoplayCheckbox"]'),
      autoExtraCheckbox: containerEl.querySelector('[data-fc="autoExtraCheckbox"]'),
      intervalInput: containerEl.querySelector('[data-fc="intervalInput"]'),
      intervalValueLabel: containerEl.querySelector('[data-fc="intervalValueLabel"]'),
      derivBtn: containerEl.querySelector('[data-fc="derivBtn"]'),
      exampleBtn: containerEl.querySelector('[data-fc="exampleBtn"]'),
      derivPanel: containerEl.querySelector('[data-fc="derivPanel"]'),
      examplePanel: containerEl.querySelector('[data-fc="examplePanel"]'),
      wordSizeInput: containerEl.querySelector('[data-fc="wordSizeInput"]'),
      meaningSizeInput: containerEl.querySelector('[data-fc="meaningSizeInput"]'),
      extraSizeInput: containerEl.querySelector('[data-fc="extraSizeInput"]'),
      stage: containerEl.querySelector('.fc-stage'),
      wakeLockNotice: containerEl.querySelector('[data-fc="wakeLockNotice"]'),
    };

    // ── 내부 상태 ────────────────────────────────────────────
    let words = [];          // 현재 로드된(범위 지정된) 단어 목록
    let currentIndex = 0;    // 현재 보여주고 있는 카드 인덱스
    let destroyed = false;

    // 파생어/예문 보기 버튼으로 자동재생이 일시정지된 상태인지 여부.
    // true인 동안에는 자동재생이 멈춰 있고, "시작" 버튼을 다시 누르면
    // 현재 카드를 다시 보여주지 않고 곧바로 다음 카드부터 재생을 이어간다.
    let pausedByExtra = false;

    // touchGesture.attachSwipe()가 반환한 핸들(destroy() 보유).
    // unmount 시점에 반드시 destroy()를 호출해 리스너 누수를 막는다.
    let swipeHandle = null;

    // 스와이프 시각 피드백(카드가 드래그를 살짝 따라가는 효과)을 위해
    // 이 모듈이 직접 붙이는 보조 리스너들. destroy()에서 함께 정리한다.
    let visualFeedbackCleanup = null;

    // 타이머 걸기 / TTS 대기 / 다음 카드로 전환 / 시작-정지 처리는 모두
    // core/playbackEngine.js에 위임한다. 이 모듈은 "카드를 어떻게
    // 그릴지"와 "어떤 텍스트를 읽을지"만 결정한다(engine.onShowItem).
    const engine = playbackEngine.createEngine({
      getItemCount: () => words.length,
      getCurrentIndex: () => currentIndex,
      getIntervalSeconds: () => getIntervalSeconds(),
      isAutoplayEnabled: () => els.autoplayCheckbox.checked,
      speechRate: SPEECH_RATE,
      // 다국어 TTS: 상위(app/main.js)가 넘겨준 현재 학습 언어를 그대로
      // playbackEngine에 전달한다. 이 모듈은 언어를 판단하지 않는다.
      lang: modeOptions.lang,
      onShowItem: (index, opts) => renderCard(index, opts),
      onStart: () => {
        els.toggleButton.textContent = '정지';
        els.toggleButton.classList.add('playing');
        // 자동 재생이 시작될 때만 화면 꺼짐 방지를 건다(그냥 카드만
        // 훑어볼 때는 배터리를 위해 걸지 않는다). 실패/미지원이어도
        // 조용히 무시된다(wakeLockUtil의 계약).
        wakeLockUtil.request();
      },
      onStop: () => {
        els.toggleButton.textContent = '시작';
        els.toggleButton.classList.remove('playing');
        wakeLockUtil.release();
      },
      onComplete: () => {
        setStatus('마지막 카드까지 재생했습니다.', 'success');
      },
    });

    init();

    function init() {
      els.loadButton.addEventListener('click', handleLoadClicked);
      els.prevButton.addEventListener('click', () => goTo(currentIndex - 1, { manual: true }));
      els.nextButton.addEventListener('click', () => goTo(currentIndex + 1, { manual: true }));
      els.toggleButton.addEventListener('click', toggleFromButton);
      els.intervalInput.addEventListener('input', handleIntervalInput);
      els.derivBtn.addEventListener('click', () => toggleExtraPanel('deriv'));
      els.exampleBtn.addEventListener('click', () => toggleExtraPanel('example'));
      els.autoExtraCheckbox.addEventListener('change', handleAutoExtraToggle);
      els.wordSizeInput.addEventListener('input', handleFontSizeInput);
      els.meaningSizeInput.addEventListener('input', handleFontSizeInput);
      els.extraSizeInput.addEventListener('input', handleFontSizeInput);

      // 글자 크기는 설정으로 저장하지 않으므로 항상 기본값으로 시작한다.
      els.wordSizeInput.value = String(DEFAULT_WORD_SIZE);
      els.meaningSizeInput.value = String(DEFAULT_MEANING_SIZE);
      els.extraSizeInput.value = String(DEFAULT_EXTRA_SIZE);
      applyFontSizes();

      els.intervalInput.max = String(MAX_INTERVAL);
      els.intervalInput.step = String(STEP_INTERVAL);

      // 전역 설정 패널에서 넘겨준 초기값이 있으면 그 값으로 시작한다.
      const initial = modeOptions.initialSettings || {};
      const initialInterval = Number.isFinite(Number(initial.intervalSeconds))
        ? Number(initial.intervalSeconds)
        : DEFAULT_INTERVAL;
      els.autoplayCheckbox.checked = initial.autoplay !== undefined ? !!initial.autoplay : true;
      // "파생어/예문 자동 표시" 옵션은 저장하지 않으므로 항상 꺼진 상태로 시작한다.
      els.autoExtraCheckbox.checked = false;

      els.intervalInput.min = String(getMinIntervalAllowed());
      els.intervalInput.value = String(Math.min(MAX_INTERVAL, Math.max(getMinIntervalAllowed(), initialInterval)));

      updateIntervalLabel();

      document.addEventListener('keydown', handleKeydown);

      els.autoplayCheckbox.addEventListener('change', notifySettingsChange);

      // ── 스와이프로 카드 넘기기 ─────────────────────────────
      // 왼쪽으로 스와이프 → 다음 카드(nextButton과 동일), 오른쪽으로
      // 스와이프 → 이전 카드(prevButton과 동일). goTo()가 이미 범위를
      // clamp하므로(engine.goTo → showItem 내부) 첫/마지막 카드에서
      // 범위를 벗어난 인덱스를 넘겨도 안전하다.
      swipeHandle = touchGesture.attachSwipe(els.cardArea, {
        onSwipeLeft: () => goTo(currentIndex + 1, { manual: true }),
        onSwipeRight: () => goTo(currentIndex - 1, { manual: true }),
      });

      // touchGesture는 "스와이프 완료" 판정만 알려주고 중간 좌표는 넘겨주지
      // 않으므로(모듈 설계상 방향 해석은 호출부 책임), 드래그 중 카드가
      // 살짝 따라오는 시각 피드백은 이 모듈이 별도의 가벼운 리스너로
      // 처리한다. attachSwipe의 판정 로직에는 전혀 관여하지 않고 순수
      // 표시용이므로, 필수 기능(카드 넘기기)과 독립적으로 안전하게 켜고
      // 끌 수 있다.
      attachSwipeVisualFeedback();

      // 탭이 백그라운드로 갔다가 돌아왔을 때, 이 순간 자동재생 중이면
      // wakeLockUtil이 알아서 wake lock을 재요청하게 등록해둔다.
      wakeLockUtil.enableAutoReacquire(() => engine.isPlaying());

      // 이 기기/브라우저가 화면 유지(Wake Lock)를 지원하지 않으면 작은
      // 안내 문구만 조용히 보여준다(에러를 던지거나 기능을 막지 않음 —
      // 자동재생 자체는 wake lock 없이도 정상 동작한다).
      if (els.wakeLockNotice && !wakeLockUtil.isSupported()) {
        els.wakeLockNotice.textContent = '이 기기에서는 자동재생 중 화면 유지가 지원되지 않아, 재생 중 화면이 꺼질 수 있습니다.';
        els.wakeLockNotice.style.display = 'block';
      }

      // 필터가 함께 적용되고 있으면 안내 문구를 상태줄에 반영한다.
      if (modeOptions.filterLabel) {
        setStatus(modeOptions.filterLabel, 'neutral');
      }

      renderEmpty('범위를 지정하고 "불러오기"를 눌러 카드를 시작하세요.');
      updateNavButtons();
    }

    /**
     * 재생속도/자동재생 값이 바뀔 때마다 상위(app/main.js)에 알려
     * 전역 설정(settings 스토어)에 저장할 수 있게 한다.
     */
    function notifySettingsChange() {
      if (typeof modeOptions.onSettingsChange === 'function') {
        modeOptions.onSettingsChange({
          intervalSeconds: getIntervalSeconds(),
          autoplay: !!els.autoplayCheckbox.checked,
        });
      }
    }

    // ── 글자 크기 조절 ────────────────────────────────────────
    /**
     * 사용자가 글자 크기 입력창(단어/뜻/파생어·예문) 중 하나에 값을
     * 입력할 때마다 호출된다. 저장은 하지 않고 즉시 화면에만 반영한다.
     */
    function handleFontSizeInput() {
      applyFontSizes();
    }

    /**
     * 세 입력창의 현재 값을 읽어 각 필드 이름에 맞는 허용 범위로 고정한 뒤
     * .fc-stage에 CSS 변수(--fc-word-size 등)로 주입해 카드 글자 크기에
     * 즉시 반영한다. 입력 중(범위를 벗어난 임시값)에는 입력창 자체의
     * 값은 건드리지 않고 화면 반영만 범위 안으로 고정해, 사용자가 계속
     * 타이핑 중인 값을 강제로 바꾸지 않는다.
     */
    function applyFontSizes() {
      const wordSize = clampFontSize(els.wordSizeInput.value, FONT_SIZE_LIMITS.word, DEFAULT_WORD_SIZE);
      const meaningSize = clampFontSize(els.meaningSizeInput.value, FONT_SIZE_LIMITS.meaning, DEFAULT_MEANING_SIZE);
      const extraSize = clampFontSize(els.extraSizeInput.value, FONT_SIZE_LIMITS.extra, DEFAULT_EXTRA_SIZE);

      if (els.stage) {
        els.stage.style.setProperty('--fc-word-size', wordSize + 'px');
        els.stage.style.setProperty('--fc-meaning-size', meaningSize + 'px');
        els.stage.style.setProperty('--fc-extra-size', extraSize + 'px');
      }
    }

    /**
     * 입력값을 숫자로 변환하고 허용 범위 안으로 고정한다. 숫자가 아니거나
     * 비어있으면 기본값을 사용한다.
     * @param {string} rawValue
     * @param {{min:number, max:number}} limits
     * @param {number} fallback
     * @returns {number}
     */
    function clampFontSize(rawValue, limits, fallback) {
      const n = Number(rawValue);
      if (!Number.isFinite(n)) return fallback;
      return Math.min(limits.max, Math.max(limits.min, n));
    }

    function destroy() {
      destroyed = true;
      engine.destroy(); // 진행 중이던 타이머/TTS 콜백 정리는 엔진이 담당(재생 중이었다면 stop()이 호출되어 onStop을 통해 wake lock도 release됨)
      document.removeEventListener('keydown', handleKeydown);
      els.autoplayCheckbox.removeEventListener('change', notifySettingsChange);

      if (swipeHandle) {
        swipeHandle.destroy();
        swipeHandle = null;
      }

      if (visualFeedbackCleanup) {
        visualFeedbackCleanup();
        visualFeedbackCleanup = null;
      }

      // 이 모듈이 등록해둔 "재생 중이면 자동 재요청" 콜백을 해제해,
      // 화면을 벗어난 뒤에도 계속 불리는 일이 없게 한다.
      wakeLockUtil.disableAutoReacquire();
      // engine.destroy()가 재생 중이었다면 stop()→onStop()을 거쳐 이미
      // release()를 호출했겠지만, 혹시 모를 상태 불일치에 대비해 한 번 더
      // 안전하게 해제한다(release()는 활성 상태가 아니면 아무 일도 하지
      // 않으므로 중복 호출해도 안전하다).
      wakeLockUtil.release();
    }

    // ── 데이터 로드 ──────────────────────────────────────────
    function handleLoadClicked() {
      const startVal = els.rangeStart.value.trim();
      const endVal = els.rangeEnd.value.trim();

      const hasStart = startVal !== '';
      const hasEnd = endVal !== '';

      // 상위(app/main.js)가 "현재 필터에 해당하는 단어만" 옵션을 위해
      // getWords 함수를 주입했다면 그 함수를 사용하고, 없으면 기존 그대로
      // wordStore.getWordsInRange/getAllWords를 사용한다(하위 호환).
      const loadPromise = getWordsFn
        ? getWordsFn(hasStart && hasEnd ? Number(startVal) : null, hasStart && hasEnd ? Number(endVal) : null)
        : (hasStart && hasEnd)
          ? wordStore.getWordsInRange(Number(startVal), Number(endVal))
          : wordStore.getAllWords();

      setStatus('단어를 불러오는 중...', 'neutral');
      engine.stop();
      pausedByExtra = false;

      loadPromise
        .then((loaded) => {
          words = loaded || [];
          currentIndex = 0;

          if (words.length === 0) {
            renderEmpty('해당 범위에 저장된 단어가 없습니다. 범위를 확인하거나 먼저 단어를 저장해주세요.');
            setStatus('불러온 단어가 없습니다.', 'error');
          } else {
            renderCard(currentIndex, { speak: false });
            setStatus(`${words.length}개 단어를 불러왔습니다.`, 'success');
          }
          updateNavButtons();
        })
        .catch((err) => {
          console.error(err);
          setStatus('단어를 불러오는 중 오류가 발생했습니다: ' + err.message, 'error');
        });
    }

    // ── 카드 렌더링 ──────────────────────────────────────────
    function renderEmpty(message) {
      els.cardArea.style.display = 'none';
      els.emptyState.style.display = 'block';
      els.emptyState.textContent = message;
    }

    /**
     * index 위치의 카드를 화면에 그린다. playbackEngine의 onShowItem
     * 계약에 따라 호출되며(수동 이동/자동 진행 공통 경로), 타이머를
     * 걸거나 다음 카드로 넘어가는 판단은 하지 않는다 — 그것은 엔진의
     * 책임이다. 이 함수는 오직 "카드를 그리고, 읽어줄 텍스트가 있다면
     * 그 텍스트를 반환"하는 일만 한다.
     * @param {number} index
     * @param {{ speak: boolean }} opts - engine이 넘겨주는, 이번에
     *        자동재생(발음)까지 해야 하는지 여부.
     * @returns {string|null} 읽어줄 텍스트(발음 재생이 필요 없으면 null).
     */
    function renderCard(index, opts) {
      if (words.length === 0) return null;

      // 인덱스를 범위 안으로 고정(순환하지 않음 — 양 끝에서 멈춤)
      currentIndex = Math.max(0, Math.min(index, words.length - 1));

      const word = words[currentIndex];

      els.emptyState.style.display = 'none';
      els.cardArea.style.display = 'flex';

      els.cardWord.textContent = word.word || '(단어 없음)';
      els.cardMeaning.textContent = word.meaning || '(뜻 없음)';
      els.cardProgress.textContent = `${currentIndex + 1} / ${words.length} (${word.id}번)`;

      // 카드가 바뀔 때마다 파생어/예문 패널은 항상 접힌 상태로 초기화하고,
      // 이번 카드가 해당 데이터를 갖고 있을 때만 버튼을 보여준다.
      setupExtraButtons(word);

      updateNavButtons();

      // 발화 속도(rate)는 항상 정상 속도(SPEECH_RATE=1)로 고정한다.
      // 카드 전환 간격(초)을 rate에 그대로 넘기면(예: 2.5) 2.5배속으로
      // 재생되어 발음이 뭉개지거나 브라우저가 비정상 값으로 처리해
      // 아예 소리가 나지 않는 문제가 있었다 — 간격과 발화 속도는
      // 서로 다른 개념이므로 절대 같은 값을 공유하지 않는다(엔진이
      // speechRate를 별도로 받아 고정 처리한다).
      return opts && opts.speak ? word.word : null;
    }

    /**
     * 카드 이동(수동 버튼 클릭 또는 자동 진행 공통 경로).
     * @param {number} index
     * @param {{ manual?: boolean }} [opts] - manual: true면 사용자가 이전/다음
     *        버튼을 직접 누른 경우. 이 경우도 자동재생이 켜져 있으면 발음을 읽어준다
     *        (자동재생 여부만으로 발음 여부를 결정하고, 수동/자동 이동 자체는
     *        발음 여부에 영향을 주지 않는다).
     */
    function goTo(index, opts) {
      if (words.length === 0) return;
      const manual = !!(opts && opts.manual);

      // 수동으로 카드를 넘기면 "파생어/예문 보기로 일시정지" 상태는
      // 더 이상 의미가 없으므로 해제한다(다음 시작은 일반 시작으로 처리).
      if (manual) {
        pausedByExtra = false;
      }

      // engine.goTo는 재생 중이었다면 이전 카드의 타이머/TTS 대기를
      // 무효화하고 새 카드부터 다시 "최소 표시 시간 + 발음 종료" 조건을
      // 계산한다. 재생 중이 아니었다면 표시만 한다.
      engine.goTo(index);
    }

    // ── 자동 재생(시작/정지) ─────────────────────────────────
    function toggleFromButton() {
      if (words.length === 0) {
        setStatus('먼저 범위를 불러온 뒤 시작할 수 있습니다.', 'error');
        return;
      }
      if (engine.isPlaying()) {
        engine.stop();
      } else if (pausedByExtra) {
        // 파생어/예문 보기로 일시정지된 상태에서 "시작"을 다시 누른 경우:
        // 현재 카드를 반복하지 않고 곧바로 다음 카드부터 자동재생을 이어간다.
        resumeFromExtraPause();
      } else {
        // 현재 카드부터 즉시 재생(발음 포함)한다. 다음 카드로의 전환은
        // engine이 "최소 표시 시간 + 발음 종료" 조건을 확인해 자동으로
        // 처리한다.
        engine.start();
      }
    }

    // ── 파생어/예문 보기 ─────────────────────────────────────
    /**
     * 현재 카드(word)가 파생어/예문 데이터를 갖고 있는지에 따라
     * 해당 버튼을 보이거나 숨기고, 패널은 항상 접힌 상태로 초기화한다.
     * @param {object} word
     */
    function setupExtraButtons(word) {
      const derivText = formatDerivatives(word.derivatives);
      const hasDeriv = !!derivText;
      const hasExample = !!(word.example && word.example.sentence && word.example.sentence.trim() !== '');

      els.derivBtn.style.display = hasDeriv ? '' : 'none';
      els.exampleBtn.style.display = hasExample ? '' : 'none';

      els.derivPanel.textContent = derivText || '';
      renderExamplePanel(word.example);

      if (els.autoExtraCheckbox && els.autoExtraCheckbox.checked) {
        // "파생어/예문 자동 표시" 옵션이 켜져 있으면 재생을 멈추지 않고
        // 카드가 바뀔 때마다 곧바로 패널을 펼친다.
        showExtraPanelsForCurrentCard();
      } else {
        els.derivPanel.style.display = 'none';
        els.examplePanel.style.display = 'none';
        els.derivBtn.classList.remove('active');
        els.exampleBtn.classList.remove('active');
        els.derivBtn.textContent = '파생어 보기';
        els.exampleBtn.textContent = '예문 보기';
      }
    }

    /**
     * 예문 패널에 문장과 해석을 표시한다. 해석(translation)이 있으면
     * 문장 아래 줄에 별도로 보여주고, 없으면 문장만 표시한다.
     * @param {{sentence: string, translation: string}} example
     */
    function renderExamplePanel(example) {
      els.examplePanel.textContent = '';
      if (!example || !example.sentence) return;

      const sentenceEl = document.createElement('div');
      sentenceEl.className = 'fc-example-sentence';
      sentenceEl.textContent = example.sentence;
      els.examplePanel.appendChild(sentenceEl);

      if (example.translation) {
        const translationEl = document.createElement('div');
        translationEl.className = 'fc-example-translation';
        translationEl.textContent = example.translation;
        els.examplePanel.appendChild(translationEl);
      }
    }

    /**
     * derivatives 객체({antonyms, synonyms, derived, other})를
     * 화면에 보여줄 한 줄짜리 텍스트로 합친다. 모든 그룹이 비어있으면
     * 빈 문자열을 반환한다(= 버튼을 숨겨야 함을 의미).
     * @param {{
     *   antonyms?: Array<{text:string, meaning:string}>,
     *   synonyms?: Array<{text:string, meaning:string}>,
     *   derived?: Array<{text:string, meaning:string}>,
     *   other?: Array<{text:string, meaning:string}>
     * }} derivatives
     * @returns {string}
     */
    function formatDerivatives(derivatives) {
      if (!derivatives) return '';
      const groups = [
        { key: 'antonyms', label: '반의어' },
        { key: 'synonyms', label: '동의어' },
        { key: 'derived', label: '파생어' },
        { key: 'other', label: '기타' },
      ];
      const parts = [];
      for (const g of groups) {
        const list = derivatives[g.key];
        if (Array.isArray(list) && list.length > 0) {
          const itemsText = list
            .map((it) => (it.meaning ? `${it.text}(${it.meaning})` : it.text))
            .join(', ');
          parts.push(`${g.label}: ${itemsText}`);
        }
      }
      return parts.join(' · ');
    }

    /**
     * 파생어/예문 버튼 클릭 처리. 열려는 패널을 펴고 다른 패널은 접는다
     * (한 번에 하나만 보이도록). 재생 중이었다면 이 시점에 자동재생을
     * 일시정지한다(요청사항: 파생어/예문 보기 클릭 시 재생 멈춤).
     * @param {'deriv'|'example'} which
     */
    function toggleExtraPanel(which) {
      const isDeriv = which === 'deriv';
      const panel = isDeriv ? els.derivPanel : els.examplePanel;
      const otherPanel = isDeriv ? els.examplePanel : els.derivPanel;
      const btn = isDeriv ? els.derivBtn : els.exampleBtn;
      const otherBtn = isDeriv ? els.exampleBtn : els.derivBtn;

      const willOpen = panel.style.display === 'none';
      const autoExtraOn = els.autoExtraCheckbox && els.autoExtraCheckbox.checked;

      // 재생 중이었다면: "파생어/예문 자동 표시" 옵션이 꺼져 있을 때만
      // 지금 이 클릭으로 자동재생을 멈추고, "다시 시작 시 다음 카드부터
      // 이어가기"를 위해 pausedByExtra를 표시해둔다. 옵션이 켜져 있으면
      // 이미 카드 전환 간격이 3초 이상으로 보장되어 있으므로 재생을
      // 멈추지 않고 패널만 수동으로 접었다 펼 수 있게 둔다.
      if (engine.isPlaying() && !autoExtraOn) {
        engine.stop();
        pausedByExtra = true;
        setStatus('파생어/예문 확인 중 — 재생이 일시정지되었습니다. "시작"을 누르면 다음 카드부터 이어집니다.', 'neutral');
      }

      panel.style.display = willOpen ? 'block' : 'none';
      btn.classList.toggle('active', willOpen);
      btn.textContent = (willOpen ? '접기' : (isDeriv ? '파생어 보기' : '예문 보기'));

      // 다른 패널은 항상 접는다(한 번에 하나만 표시).
      otherPanel.style.display = 'none';
      otherBtn.classList.remove('active');
      otherBtn.textContent = isDeriv ? '예문 보기' : '파생어 보기';
    }

    /**
     * 파생어/예문 보기로 일시정지된 상태에서 "시작"을 눌러 재개할 때 호출.
     * 현재 카드를 반복하지 않고, 다음 카드가 있으면 그 카드부터 자동재생을
     * 이어간다. 이미 마지막 카드였다면 일반 종료 상태와 동일하게 안내한다.
     */
    function resumeFromExtraPause() {
      pausedByExtra = false;

      if (currentIndex >= words.length - 1) {
        setStatus('마지막 카드입니다. 이어서 재생할 다음 카드가 없습니다.', 'neutral');
        return;
      }

      // 다음 카드로 인덱스를 옮긴 뒤 그 카드부터 재생을 시작한다
      // (engine.start()는 현재 인덱스부터 시작하므로, 먼저 인덱스를
      // 옮겨둔다).
      currentIndex += 1;
      engine.start();
    }

    /**
     * "파생어/예문 자동 표시" 체크박스가 바뀔 때 호출된다.
     * - 켜질 때: 슬라이더의 최소값을 3초로 올리고, 현재 간격이 3초
     *   미만이면 3초로 끌어올린다(재생 중이면 대기 중인 타이머도 새
     *   간격으로 다시 건다). 이번 카드에 파생어/예문 데이터가 있으면
     *   자동재생을 멈추지 않고 곧바로 패널을 펼친다.
     * - 꺼질 때: 슬라이더 최소값을 원래(1초)대로 되돌린다(이미 3초
     *   이상으로 설정된 값은 그대로 유지 — 사용자가 직접 고른 값을
     *   임의로 낮추지 않는다). 자동으로 펼쳐졌던 패널은 접는다.
     */
    function handleAutoExtraToggle() {
      const minAllowed = getMinIntervalAllowed();
      els.intervalInput.min = String(minAllowed);

      if (els.autoExtraCheckbox.checked) {
        if (Number(els.intervalInput.value) < minAllowed) {
          els.intervalInput.value = String(minAllowed);
        }
        updateIntervalLabel();
        engine.rearmTimer();
        if (words.length > 0) {
          showExtraPanelsForCurrentCard();
        }
      } else {
        updateIntervalLabel();
        collapseExtraPanels();
      }

      notifySettingsChange();
    }

    /**
     * 현재 카드가 가진 파생어/예문 패널을 (있는 만큼) 모두 펼쳐 보여준다.
     * "파생어/예문 자동 표시" 옵션이 켜져 있을 때, 재생을 멈추지 않고
     * 카드가 바뀔 때마다 자동으로 호출된다. 재생을 멈추는 toggleExtraPanel과
     * 달리 engine.stop()을 호출하지 않는다.
     */
    function showExtraPanelsForCurrentCard() {
      const hasDeriv = els.derivBtn.style.display !== 'none';
      const hasExample = els.exampleBtn.style.display !== 'none';

      els.derivPanel.style.display = hasDeriv ? 'block' : 'none';
      els.derivBtn.classList.toggle('active', hasDeriv);
      els.derivBtn.textContent = hasDeriv ? '접기' : '파생어 보기';

      els.examplePanel.style.display = hasExample ? 'block' : 'none';
      els.exampleBtn.classList.toggle('active', hasExample);
      els.exampleBtn.textContent = hasExample ? '접기' : '예문 보기';
    }

    /**
     * 파생어/예문 패널을 모두 접는다("자동 표시" 옵션을 끌 때 사용).
     */
    function collapseExtraPanels() {
      els.derivPanel.style.display = 'none';
      els.derivBtn.classList.remove('active');
      els.derivBtn.textContent = '파생어 보기';

      els.examplePanel.style.display = 'none';
      els.exampleBtn.classList.remove('active');
      els.exampleBtn.textContent = '예문 보기';
    }

    // ── 속도(간격) 조절 ──────────────────────────────────────
    function handleIntervalInput() {
      updateIntervalLabel();
      // engine.getIntervalSeconds()는 항상 els.intervalInput.value를
      // 실시간으로 읽으므로(getIntervalSeconds 함수를 그대로 참조),
      // 다음 타이머부터는 새 간격이 자동 반영된다. 이미 걸려 있는
      // 타이머까지 즉시 다시 걸고 싶다면 engine.rearmTimer()를 쓴다
      // (발음 종료 대기 상태는 그대로 유지 — 이미 끝난 발음을 다시
      // 기다리게 하지 않는다).
      engine.rearmTimer();
      notifySettingsChange();
    }

    function updateIntervalLabel() {
      els.intervalValueLabel.textContent = `${getIntervalSeconds().toFixed(1)}초`;
    }

    function getIntervalSeconds() {
      const v = Number(els.intervalInput.value);
      const minAllowed = getMinIntervalAllowed();
      if (!Number.isFinite(v)) return Math.max(minAllowed, DEFAULT_INTERVAL);
      return Math.min(MAX_INTERVAL, Math.max(minAllowed, v));
    }

    /**
     * 현재 적용되어야 할 카드 전환 간격의 최소값을 반환한다.
     * "파생어/예문 자동 표시" 옵션이 켜져 있으면 파생어/예문까지 읽을
     * 시간을 확보하기 위해 MIN_INTERVAL_WITH_EXTRA(3초)를 강제하고,
     * 꺼져 있으면 기존 MIN_INTERVAL(1초)을 그대로 사용한다.
     */
    function getMinIntervalAllowed() {
      return els.autoExtraCheckbox && els.autoExtraCheckbox.checked
        ? MIN_INTERVAL_WITH_EXTRA
        : MIN_INTERVAL;
    }

    // ── 스와이프 시각 피드백(선택 사항) ──────────────────────
    /**
     * .fc-card-area에서 손가락이 움직이는 동안 .fc-card에 살짝
     * translateX를 적용해 "드래그를 따라가는" 느낌을 준다. 실제 스와이프
     * 판정(다음/이전 카드 전환 여부)에는 전혀 관여하지 않으며, 오직
     * 표시용이다 — 카드 전환 판정은 touchGesture.attachSwipe의 콜백이
     * 전담한다. 여기서 표시가 실패하거나 값이 어긋나도 카드 넘기기
     * 기능 자체에는 영향이 없다.
     */
    function attachSwipeVisualFeedback() {
      const area = els.cardArea;
      const card = els.card;
      if (!area || !card) return;

      let startX = 0;
      let dragging = false;
      const MAX_OFFSET = 60; // 카드가 손가락을 따라 이동할 수 있는 최대 px(과장 방지)

      function onTouchStart(event) {
        const touch = event.touches && event.touches[0];
        if (!touch) return;
        dragging = true;
        startX = touch.clientX;
        card.style.transition = 'none';
      }

      function onTouchMove(event) {
        if (!dragging) return;
        const touch = event.touches && event.touches[0];
        if (!touch) return;
        const delta = touch.clientX - startX;
        const clamped = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, delta));
        card.style.transform = `translateX(${clamped}px)`;
      }

      function resetCardPosition() {
        dragging = false;
        card.style.transition = 'transform 0.2s ease';
        card.style.transform = 'translateX(0)';
      }

      area.addEventListener('touchstart', onTouchStart, { passive: true });
      area.addEventListener('touchmove', onTouchMove, { passive: true });
      area.addEventListener('touchend', resetCardPosition, { passive: true });
      area.addEventListener('touchcancel', resetCardPosition, { passive: true });

      visualFeedbackCleanup = function () {
        area.removeEventListener('touchstart', onTouchStart);
        area.removeEventListener('touchmove', onTouchMove);
        area.removeEventListener('touchend', resetCardPosition);
        area.removeEventListener('touchcancel', resetCardPosition);
        card.style.transition = '';
        card.style.transform = '';
      };
    }

    // ── 키보드 단축키 ────────────────────────────────────────
    function handleKeydown(event) {
      if (destroyed) return;
      // 다른 입력 필드(범위 입력 등)에 포커스가 있을 때는 스페이스바를
      // 가로채지 않는다(숫자 입력 중 스크롤/토글이 튀지 않도록).
      const tag = (event.target && event.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        toggleFromButton();
      }
    }

    // ── 이전/다음 버튼 활성화 상태 ───────────────────────────
    function updateNavButtons() {
      const hasWords = words.length > 0;
      els.prevButton.disabled = !hasWords || currentIndex <= 0;
      els.nextButton.disabled = !hasWords || currentIndex >= words.length - 1;
      els.toggleButton.disabled = !hasWords;
    }

    function setStatus(message, kind) {
      els.statusLine.textContent = message;
      els.statusLine.classList.toggle('fc-status-error', kind === 'error');
      els.statusLine.classList.toggle('fc-status-success', kind === 'success');
    }

    return { destroy };
  }

  function buildMarkup() {
    return `
      <div class="fc-panel">
        <div class="fc-controls-row">
          <label class="fc-label" for="fcRangeStart">범위</label>
          <input type="number" min="1" placeholder="시작" data-fc="rangeStart" class="fc-range-input">
          <span class="fc-sep">~</span>
          <input type="number" min="1" placeholder="끝" data-fc="rangeEnd" class="fc-range-input">
          <button type="button" class="fc-btn fc-btn-secondary" data-fc="loadButton">불러오기</button>
          <span class="fc-status-line" data-fc="statusLine">범위를 비워두면 전체 단어를 불러옵니다.</span>
        </div>
      </div>

      <div class="fc-panel fc-stage">
        <div class="fc-empty-state" data-fc="emptyState">범위를 지정하고 "불러오기"를 눌러 카드를 시작하세요.</div>

        <div class="fc-card-area" data-fc="cardArea" style="display: none;">
          <div class="fc-card-progress" data-fc="cardProgress"></div>
          <div class="fc-card">
            <div class="fc-card-word" data-fc="cardWord"></div>
            <div class="fc-card-meaning" data-fc="cardMeaning"></div>

            <div class="fc-extra-row" data-fc="extraRow">
              <button type="button" class="fc-btn fc-btn-ghost fc-extra-btn" data-fc="derivBtn" style="display: none;">파생어 보기</button>
              <button type="button" class="fc-btn fc-btn-ghost fc-extra-btn" data-fc="exampleBtn" style="display: none;">예문 보기</button>
            </div>

            <div class="fc-extra-panel" data-fc="derivPanel" style="display: none;"></div>
            <div class="fc-extra-panel" data-fc="examplePanel" style="display: none;"></div>
          </div>

          <div class="fc-nav-row">
            <button type="button" class="fc-btn fc-btn-ghost" data-fc="prevButton">◀ 이전</button>
            <button type="button" class="fc-btn fc-btn-primary fc-toggle-btn" data-fc="toggleButton">시작</button>
            <button type="button" class="fc-btn fc-btn-ghost" data-fc="nextButton">다음 ▶</button>
          </div>

          <div class="fc-wakelock-notice" data-fc="wakeLockNotice" style="display: none;"></div>
        </div>
      </div>

      <div class="fc-panel">
        <div class="fc-settings-row">
          <label class="fc-checkbox-label">
            <input type="checkbox" data-fc="autoplayCheckbox" checked>
            자동 발음 재생
          </label>

          <label class="fc-checkbox-label">
            <input type="checkbox" data-fc="autoExtraCheckbox">
            파생어/예문 자동 표시(재생 안 멈춤)
          </label>

          <div class="fc-interval-group">
            <label class="fc-label" for="fcInterval">카드 전환 간격</label>
            <input type="range" data-fc="intervalInput" class="fc-interval-slider">
            <span class="fc-interval-value" data-fc="intervalValueLabel"></span>
          </div>

          <div class="fc-fontsize-group">
            <span class="fc-label">글자 크기(px)</span>
            <span class="fc-fontsize-field">
              <label class="fc-label" for="fcWordSize">단어</label>
              <input type="number" min="12" max="120" step="1" data-fc="wordSizeInput" class="fc-fontsize-input">
            </span>
            <span class="fc-fontsize-field">
              <label class="fc-label" for="fcMeaningSize">뜻</label>
              <input type="number" min="10" max="80" step="1" data-fc="meaningSizeInput" class="fc-fontsize-input">
            </span>
            <span class="fc-fontsize-field">
              <label class="fc-label" for="fcExtraSize">파생어/예문</label>
              <input type="number" min="10" max="60" step="1" data-fc="extraSizeInput" class="fc-fontsize-input">
            </span>
          </div>
        </div>
        <p class="fc-hint">스페이스바: 시작/정지 토글 · 이전/다음은 버튼으로만 이동합니다. 글자 크기는 이 화면을 벗어나면 기본값으로 돌아갑니다. "파생어/예문 자동 표시"를 켜면 재생 중에도 파생어·예문이 자동으로 펼쳐지며, 이때 카드 전환 간격은 최소 3초로 제한됩니다.</p>
      </div>
    `;
  }

  return { mount };
});
