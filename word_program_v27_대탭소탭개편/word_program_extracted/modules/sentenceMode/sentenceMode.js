/**
 * modules/sentenceMode/sentenceMode.js
 *
 * 문장 학습 모드의 진입점 겸 오케스트레이터.
 * 실제 진행 방식(입눈 자동재생 / 타이핑)은 각각
 *   - modules/sentenceMode/sentenceAutoMode.js
 *   - modules/sentenceMode/sentenceTypingMode.js
 * 로 분리되어 있으며, 이 파일은:
 *   1) 공통 UI(범위 지정+불러오기, 방향 선택, 노출시간/대조시간 등 설정,
 *      전역 설정 패널 연동)를 그리고,
 *   2) "어느 진행 방식을 쓸지" 라디오 버튼에 따라 두 컨트롤러 중 하나를
 *      활성화/전환하는 역할만 한다.
 *
 * core(sentenceStore, ttsEngine, playbackEngine)와 두 하위 모듈만
 * 참조하며, 다른 모듈(flashcard, sentenceLists 등)의 내부 코드는 절대
 * 직접 참조하지 않는다(아키텍처 원칙).
 *
 * app/main.js를 통해 정식 탭("문장 모드")으로 통합되어 있으며,
 * 노출시간/대조시간 등 설정값은 전역 설정 패널과 연동되어 새로고침
 * 후에도 유지된다(options.initialSettings / options.onSettingsChange).
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../core/sentenceStore.js'),
      require('../../core/ttsEngine.js'),
      require('../../core/playbackEngine.js'),
      require('./sentenceAutoMode.js'),
      require('./sentenceTypingMode.js'),
      require('../../core/touchGesture.js'),
      require('../../core/wakeLock.js')
    );
  } else {
    root.sentenceModeModule = factory(
      root.sentenceStore,
      root.ttsEngine,
      root.playbackEngine,
      root.sentenceAutoModeModule,
      root.sentenceTypingModeModule,
      root.touchGesture,
      root.wakeLockUtil
    );
  }
})(typeof self !== 'undefined' ? self : this, function (sentenceStore, ttsEngine, playbackEngine, sentenceAutoModeModule, sentenceTypingModeModule, touchGesture, wakeLockUtil) {
  'use strict';

  // 1단계(문제) 노출 시간 설정 범위(초)
  const MIN_STAGE1 = 1.0;
  const MAX_STAGE1 = 30.0;
  const STEP_STAGE1 = 0.5;
  const DEFAULT_STAGE1 = 4.0;

  // 2단계(정답) 노출 시간 설정 범위(초)
  const MIN_STAGE2 = 1.0;
  const MAX_STAGE2 = 30.0;
  const STEP_STAGE2 = 0.5;
  const DEFAULT_STAGE2 = 3.0;

  const SPEECH_RATE = 1; // TTS 발화 속도는 항상 정상 속도로 고정한다(간격 값과 절대 혼용하지 않음).

  const DIRECTION_READING = 'reading'; // 독해: 영어 문장 먼저 → 해석 나중
  const DIRECTION_WRITING = 'writing'; // 영작: 해석 먼저 → 영어 문장 나중

  /**
   * 문장 학습 모드 화면을 containerEl 내부에 마운트한다.
   *
   * @param {HTMLElement} containerEl
   * @param {object} [options]
   * @param {string} [options.lang] - 발음 언어 코드(다국어 TTS, 예: 'en-US').
   *        이 모듈은 언어를 판단하지 않고 sentenceAutoModeModule(→
   *        core/playbackEngine)에 그대로 얹기만 한다. 전달하지 않으면
   *        ttsEngine 기본값('en-US')을 쓴다.
   * @returns {{ destroy: () => void }}
   */
  function mount(containerEl, options) {
    if (!containerEl) {
      throw new Error('sentenceModeModule.mount: containerEl이 필요합니다.');
    }

    const modeOptions = options || {};
    const initialSettings = modeOptions.initialSettings || {};

    containerEl.innerHTML = buildMarkup();

    const els = {
      rangeStart: containerEl.querySelector('[data-sm="rangeStart"]'),
      rangeEnd: containerEl.querySelector('[data-sm="rangeEnd"]'),
      loadButton: containerEl.querySelector('[data-sm="loadButton"]'),
      statusLine: containerEl.querySelector('[data-sm="statusLine"]'),
      dirReading: containerEl.querySelector('[data-sm="dirReading"]'),
      dirWriting: containerEl.querySelector('[data-sm="dirWriting"]'),
      stage1Slider: containerEl.querySelector('[data-sm="stage1Slider"]'),
      stage1Number: containerEl.querySelector('[data-sm="stage1Number"]'),
      stage2Slider: containerEl.querySelector('[data-sm="stage2Slider"]'),
      stage2Number: containerEl.querySelector('[data-sm="stage2Number"]'),
      autoplayCheckbox: containerEl.querySelector('[data-sm="autoplayCheckbox"]'),
      emptyState: containerEl.querySelector('[data-sm="emptyState"]'),
      cardArea: containerEl.querySelector('[data-sm="cardArea"]'),
      cardProgress: containerEl.querySelector('[data-sm="cardProgress"]'),
      autoCard: containerEl.querySelector('.sm-card[data-sm="autoCard"]'),
      cardPrimary: containerEl.querySelector('[data-sm="cardPrimary"]'),
      cardSecondary: containerEl.querySelector('[data-sm="cardSecondary"]'),
      primaryLabel: containerEl.querySelector('[data-sm="primaryLabel"]'),
      secondaryLabel: containerEl.querySelector('[data-sm="secondaryLabel"]'),
      prevButton: containerEl.querySelector('[data-sm="prevButton"]'),
      nextButton: containerEl.querySelector('[data-sm="nextButton"]'),
      toggleButton: containerEl.querySelector('[data-sm="toggleButton"]'),
      autoNavRow: containerEl.querySelector('[data-sm="autoNavRow"]'),
      autoTimingRow: containerEl.querySelector('[data-sm="autoTimingRow"]'),
      autoHint: containerEl.querySelector('[data-sm="autoHint"]'),

      // 진행 방식(입눈/타이핑) 선택
      modeAuto: containerEl.querySelector('[data-sm="modeAuto"]'),
      modeTyping: containerEl.querySelector('[data-sm="modeTyping"]'),

      // 타이핑 모드 전용
      typingTimingRow: containerEl.querySelector('[data-sm="typingTimingRow"]'),
      typingAdvanceAuto: containerEl.querySelector('[data-sm="typingAdvanceAuto"]'),
      typingAdvanceManual: containerEl.querySelector('[data-sm="typingAdvanceManual"]'),
      reviewSeconds: containerEl.querySelector('[data-sm="reviewSeconds"]'),
      typingCard: containerEl.querySelector('[data-sm="typingCard"]'),
      typingPrimaryLabel: containerEl.querySelector('[data-sm="typingPrimaryLabel"]'),
      typingPrimaryText: containerEl.querySelector('[data-sm="typingPrimaryText"]'),
      typingInputArea: containerEl.querySelector('[data-sm="typingInputArea"]'),
      typingInput: containerEl.querySelector('[data-sm="typingInput"]'),
      typingSubmitButton: containerEl.querySelector('[data-sm="typingSubmitButton"]'),
      typingReview: containerEl.querySelector('[data-sm="typingReview"]'),
      typingMyAnswer: containerEl.querySelector('[data-sm="typingMyAnswer"]'),
      typingCorrectAnswer: containerEl.querySelector('[data-sm="typingCorrectAnswer"]'),
      typingNextButton: containerEl.querySelector('[data-sm="typingNextButton"]'),
      typingNavRow: containerEl.querySelector('[data-sm="typingNavRow"]'),
      typingPrevButton: containerEl.querySelector('[data-sm="typingPrevButton"]'),
      typingManualNextButton: containerEl.querySelector('[data-sm="typingManualNextButton"]'),
      typingHint: containerEl.querySelector('[data-sm="typingHint"]'),
    };

    // ── 내부 상태 ────────────────────────────────────────────
    let sentences = []; // 현재 로드된(범위 지정된) 문장 목록
    let destroyed = false;

    // touchGesture.attachSwipe()가 반환한 핸들들(각각 destroy() 보유).
    // 자동 모드 카드와 타이핑 모드(입력창 영역/대조 화면) 각각에 별도로
    // 붙이며, unmount 시점에 모두 destroy()해 리스너 누수를 막는다.
    let autoSwipeHandle = null;
    let typingReviewSwipeHandle = null;

    // 세션 03(flashcard)의 스와이프 시각 피드백(카드가 드래그를 살짝
    // 따라가는 효과)을 자동 모드 카드에도 동일하게 재사용한다. 실제
    // 카드 전환 판정에는 전혀 관여하지 않는 순수 표시용 리스너.
    let autoSwipeVisualCleanup = null;

    // ── 진행 방식별 컨트롤러 ─────────────────────────────────
    // 카드 렌더링/타이머/시작-정지 등 실제 동작은 각 컨트롤러에 위임한다.
    // 이 파일은 "어느 컨트롤러를 활성화할지"와 "둘 다 공통으로 필요한 값
    // (문장 배열/방향/노출시간 등)을 어떻게 제공할지"만 책임진다.
    const autoController = sentenceAutoModeModule.createController({
      els: els,
      getSentences: () => sentences,
      getDirection: getDirection,
      getStageSeconds: (stage) => (stage === 1 ? getStage1Seconds() : getStage2Seconds()),
      speechRate: SPEECH_RATE,
      // 다국어 TTS: 상위(app/main.js)가 넘겨준 현재 학습 언어를 그대로 전달한다.
      lang: modeOptions.lang,
      setStatus: setStatus,
      updateNavButtons: updateNavButtons,
    });

    const typingController = sentenceTypingModeModule.createController({
      els: els,
      getSentences: () => sentences,
      getDirection: getDirection,
      getReviewSeconds: getReviewSeconds,
      isAdvanceAuto: isTypingAdvanceAuto,
      setStatus: setStatus,
      updateNavButtons: updateNavButtons,
    });

    init();

    function init() {
      els.loadButton.addEventListener('click', handleLoadClicked);
      els.prevButton.addEventListener('click', () => autoController.goTo(autoController.getCurrentIndex() - 1));
      els.nextButton.addEventListener('click', () => autoController.goTo(autoController.getCurrentIndex() + 1));
      els.toggleButton.addEventListener('click', toggleFromButton);

      els.dirReading.addEventListener('change', handleDirectionChange);
      els.dirWriting.addEventListener('change', handleDirectionChange);

      els.modeAuto.addEventListener('change', handleProgressModeChange);
      els.modeTyping.addEventListener('change', handleProgressModeChange);

      els.typingSubmitButton.addEventListener('click', () => typingController.handleSubmit());
      els.typingInput.addEventListener('keydown', (event) => typingController.handleInputKeydown(event));
      els.typingNextButton.addEventListener('click', () => typingController.goTo(typingController.getCurrentIndex() + 1, { manual: true }));
      els.typingManualNextButton.addEventListener('click', () => typingController.goTo(typingController.getCurrentIndex() + 1, { manual: true }));
      els.typingPrevButton.addEventListener('click', () => typingController.goTo(typingController.getCurrentIndex() - 1, { manual: true }));

      els.stage1Slider.addEventListener('input', () => handleStageInput('stage1', 'slider'));
      els.stage1Number.addEventListener('input', () => handleStageInput('stage1', 'number'));
      els.stage2Slider.addEventListener('input', () => handleStageInput('stage2', 'slider'));
      els.stage2Number.addEventListener('input', () => handleStageInput('stage2', 'number'));

      els.stage1Slider.min = String(MIN_STAGE1);
      els.stage1Slider.max = String(MAX_STAGE1);
      els.stage1Slider.step = String(STEP_STAGE1);
      els.stage1Number.min = String(MIN_STAGE1);
      els.stage1Number.max = String(MAX_STAGE1);
      els.stage1Number.step = String(STEP_STAGE1);
      // 전역 설정 패널에서 전달된 initialSettings이 있으면 그 값을,
      // 없으면 기존 기본값을 사용한다(직접 이 화면만 여는 경우 하위 호환).
      const initStage1 = Number.isFinite(Number(initialSettings.stageOneSeconds))
        ? Number(initialSettings.stageOneSeconds) : DEFAULT_STAGE1;
      els.stage1Slider.value = String(initStage1);
      els.stage1Number.value = String(initStage1);

      els.stage2Slider.min = String(MIN_STAGE2);
      els.stage2Slider.max = String(MAX_STAGE2);
      els.stage2Slider.step = String(STEP_STAGE2);
      els.stage2Number.min = String(MIN_STAGE2);
      els.stage2Number.max = String(MAX_STAGE2);
      els.stage2Number.step = String(STEP_STAGE2);
      const initStage2 = Number.isFinite(Number(initialSettings.stageTwoSeconds))
        ? Number(initialSettings.stageTwoSeconds) : DEFAULT_STAGE2;
      els.stage2Slider.value = String(initStage2);
      els.stage2Number.value = String(initStage2);

      // 타이핑 모드 대조 화면 유지 시간 / 자동-수동 전환도 initialSettings으로 복원한다.
      const initReviewSeconds = Number.isFinite(Number(initialSettings.compareSeconds))
        ? Number(initialSettings.compareSeconds) : Number(els.reviewSeconds.value) || 3;
      els.reviewSeconds.value = String(initReviewSeconds);

      if (initialSettings.advanceMode === 'manual') {
        els.typingAdvanceManual.checked = true;
      } else if (initialSettings.advanceMode === 'auto') {
        els.typingAdvanceAuto.checked = true;
      }

      // 값이 바뀔 때마다 전역 설정 패널(main.js)에 저장하도록 알린다.
      els.stage1Slider.addEventListener('change', notifySettingsChange);
      els.stage1Number.addEventListener('change', notifySettingsChange);
      els.stage2Slider.addEventListener('change', notifySettingsChange);
      els.stage2Number.addEventListener('change', notifySettingsChange);
      els.reviewSeconds.addEventListener('change', notifySettingsChange);
      els.typingAdvanceAuto.addEventListener('change', notifySettingsChange);
      els.typingAdvanceManual.addEventListener('change', notifySettingsChange);

      document.addEventListener('keydown', handleKeydown);

      // ── 스와이프로 문장 넘기기(세션 04) ──────────────────────
      // 자동 모드 화면: 카드 영역에서 왼쪽 스와이프 = 다음 문장, 오른쪽
      // 스와이프 = 이전 문장. autoController.goTo()가 이미 범위를
      // clamp하므로 첫/마지막 문장에서도 안전하다. 카드가 어느 모드로
      // 전환되어 있든(자동/타이핑) attachSwipe 자체는 항상 붙어있고,
      // handleProgressModeChange가 각 카드의 display를 껐다 켰다 하는
      // 것만으로 실제 스와이프 가능 여부가 자연히 갈린다(숨겨진
      // 요소에서는 터치 이벤트가 발생하지 않으므로).
      autoSwipeHandle = touchGesture.attachSwipe(els.autoCard, {
        onSwipeLeft: () => autoController.goTo(autoController.getCurrentIndex() + 1),
        onSwipeRight: () => autoController.goTo(autoController.getCurrentIndex() - 1),
      });

      // 타이핑 모드 화면: 입력창(typingInput)에는 스와이프를 붙이지
      // 않는다(터치 입력/커서 이동과 겹치는 것을 피하기 위해 —
      // typingInputArea 전체가 아니라 제출 후 나타나는 대조 화면
      // (typingReview)에만 스와이프를 붙여, 입력 중에는 스와이프가
      // 전혀 반응하지 않고 대조 화면이 보이는 상태에서만 좌우로 넘길
      // 수 있게 한다.
      typingReviewSwipeHandle = touchGesture.attachSwipe(els.typingReview, {
        onSwipeLeft: () => typingController.goTo(typingController.getCurrentIndex() + 1, { manual: true }),
        onSwipeRight: () => typingController.goTo(typingController.getCurrentIndex() - 1, { manual: true }),
      });

      // 탭이 백그라운드로 갔다가 돌아왔을 때, 이 순간 "자동 모드가
      // 재생 중이거나" "타이핑 모드의 자동 대조 대기 타이머가 걸려있는"
      // 상태라면 wakeLockUtil이 알아서 wake lock을 재요청하게 등록해둔다.
      // 두 컨트롤러가 각자 request()/release()를 부르므로, 여기서는
      // "지금 재생/대기 중이어야 하는지"를 물어보는 판단 콜백만
      // 등록한다(실제 요청 시점은 각 컨트롤러가 이미 처리).
      wakeLockUtil.enableAutoReacquire(() => autoController.isPlaying() || typingController.isWaitingForAutoAdvance());

      // 세션 03과 동일한 시각 피드백을 자동 모드 카드에도 적용(필수는
      // 아니지만 일관된 경험을 위해). 카드 전환 판정 로직과는 독립적.
      attachAutoCardSwipeVisualFeedback();

      renderEmpty('범위를 지정하고 "불러오기"를 눌러 문장을 시작하세요.');
      updateNavButtons();
      updateDirectionLabels();
    }

    function destroy() {
      destroyed = true;
      autoController.destroy();
      typingController.destroy();
      document.removeEventListener('keydown', handleKeydown);

      if (autoSwipeHandle) {
        autoSwipeHandle.destroy();
        autoSwipeHandle = null;
      }
      if (typingReviewSwipeHandle) {
        typingReviewSwipeHandle.destroy();
        typingReviewSwipeHandle = null;
      }

      if (autoSwipeVisualCleanup) {
        autoSwipeVisualCleanup();
        autoSwipeVisualCleanup = null;
      }

      // 이 모듈이 등록해둔 "재생/대기 중이면 자동 재요청" 콜백을
      // 해제해, 화면을 벗어난 뒤에도 계속 불리는 일이 없게 한다.
      wakeLockUtil.disableAutoReacquire();
    }

    // ── 데이터 로드 ──────────────────────────────────────────
    function handleLoadClicked() {
      const startVal = els.rangeStart.value.trim();
      const endVal = els.rangeEnd.value.trim();
      const hasStart = startVal !== '';
      const hasEnd = endVal !== '';

      const loadPromise = (hasStart && hasEnd)
        ? sentenceStore.getSentencesInRange(Number(startVal), Number(endVal))
        : sentenceStore.getAllSentences();

      setStatus('문장을 불러오는 중...', 'neutral');
      autoController.stop();
      typingController.clearReviewTimer();

      loadPromise
        .then((loaded) => {
          sentences = loaded || [];

          if (sentences.length === 0) {
            renderEmpty('해당 범위에 저장된 문장이 없습니다. 범위를 확인하거나 먼저 문장을 저장해주세요.');
            setStatus('불러온 문장이 없습니다.', 'error');
          } else if (isTypingMode()) {
            typingController.showItem(0);
            setStatus(`${sentences.length}개 문장을 불러왔습니다.`, 'success');
          } else {
            autoController.showCurrent({ speak: false });
            setStatus(`${sentences.length}개 문장을 불러왔습니다.`, 'success');
          }
          updateNavButtons();
        })
        .catch((err) => {
          console.error(err);
          setStatus('문장을 불러오는 중 오류가 발생했습니다: ' + err.message, 'error');
        });
    }

    // ── 방향 선택 ────────────────────────────────────────────
    function getDirection() {
      return els.dirWriting.checked ? DIRECTION_WRITING : DIRECTION_READING;
    }

    function handleDirectionChange() {
      updateDirectionLabels();
      // 방향이 바뀌면 진행 중이던 카드를 처음(1단계)부터 다시 보여준다
      // (엇갈린 언어로 이미 2단계까지 보여준 상태가 남지 않도록).
      if (sentences.length === 0) return;

      if (isTypingMode()) {
        typingController.clearReviewTimer();
        typingController.showItem(typingController.getCurrentIndex());
        return;
      }

      const wasPlaying = autoController.isPlaying();
      autoController.stop();
      autoController.showCurrent({ speak: false });
      if (wasPlaying) {
        autoController.start();
      }
    }

    function updateDirectionLabels() {
      const isWriting = getDirection() === DIRECTION_WRITING;
      els.primaryLabel.textContent = isWriting ? '해석' : '영어 문장';
      els.secondaryLabel.textContent = isWriting ? '영어 문장' : '해석';
      els.typingPrimaryLabel.textContent = isWriting ? '해석' : '영어 문장';
    }

    // ── 진행 방식(입눈/타이핑) 선택 ──────────────────────────
    function isTypingMode() {
      return els.modeTyping.checked;
    }

    function handleProgressModeChange() {
      const typing = isTypingMode();

      // 두 방식은 서로 다른 화면/타이머 체계를 쓰므로, 전환 시 진행 중이던
      // 것을 깔끔히 정지시키고 현재 문제를 처음부터 다시 보여준다(상태를
      // 무리하게 이어 붙이지 않는다).
      autoController.stop();
      typingController.clearReviewTimer();

      els.autoTimingRow.style.display = typing ? 'none' : 'flex';
      els.typingTimingRow.style.display = typing ? 'flex' : 'none';
      els.autoCard.style.display = typing ? 'none' : 'flex';
      els.typingCard.style.display = typing ? 'flex' : 'none';
      els.autoNavRow.style.display = typing ? 'none' : 'flex';
      els.typingNavRow.style.display = typing ? 'flex' : 'none';
      els.autoHint.style.display = typing ? 'none' : 'block';
      els.typingHint.style.display = typing ? 'block' : 'none';

      if (sentences.length === 0) return;

      if (typing) {
        typingController.showItem(autoController.getCurrentIndex());
      } else {
        autoController.showCurrent({ speak: false });
      }
    }

    function getReviewSeconds() {
      const v = Number(els.reviewSeconds.value);
      if (!Number.isFinite(v) || v <= 0) return 3;
      return v;
    }

    function isTypingAdvanceAuto() {
      return els.typingAdvanceAuto.checked;
    }

    // ── 노출 시간(초) 입력 처리(숫자 입력 + 슬라이더 병행) ─────
    function handleStageInput(which, source) {
      const sliderEl = which === 'stage1' ? els.stage1Slider : els.stage2Slider;
      const numberEl = which === 'stage1' ? els.stage1Number : els.stage2Number;
      const limits = which === 'stage1'
        ? { min: MIN_STAGE1, max: MAX_STAGE1 }
        : { min: MIN_STAGE2, max: MAX_STAGE2 };

      if (source === 'slider') {
        numberEl.value = sliderEl.value;
      } else {
        // 숫자 입력 중에는 범위를 벗어난 임시값(타이핑 도중)을 강제로
        // 바꾸지 않는다. 실제 계산 시에는 getStageXSeconds가 clamp한다.
        const n = Number(numberEl.value);
        if (Number.isFinite(n)) {
          sliderEl.value = String(Math.min(limits.max, Math.max(limits.min, n)));
        }
      }

      // 재생 중이고 아직 이번 단계의 노출 시간이 지나지 않았다면, 현재
      // 단계의 타이머를 새 값으로 다시 건다(발음 종료 대기 상태는 유지).
      autoController.rearmTimer();
    }

    function getStage1Seconds() {
      const v = Number(els.stage1Number.value);
      if (!Number.isFinite(v)) return DEFAULT_STAGE1;
      return Math.min(MAX_STAGE1, Math.max(MIN_STAGE1, v));
    }

    function getStage2Seconds() {
      const v = Number(els.stage2Number.value);
      if (!Number.isFinite(v)) return DEFAULT_STAGE2;
      return Math.min(MAX_STAGE2, Math.max(MIN_STAGE2, v));
    }

    // ── 전역 설정 패널 연동 ──────────────────────────────────
    /**
     * 노출 시간/대조 화면 유지 시간/자동-수동 전환 값이 바뀔 때마다 호출된다.
     * options.onSettingsChange가 있으면 현재 값을 모아 넘겨서, main.js가
     * settings 스토어에 저장하도록 한다(flashcard.js의 동일 패턴 참고).
     */
    function notifySettingsChange() {
      if (typeof modeOptions.onSettingsChange !== 'function') return;
      modeOptions.onSettingsChange({
        stageOneSeconds: getStage1Seconds(),
        stageTwoSeconds: getStage2Seconds(),
        compareSeconds: getReviewSeconds(),
        advanceMode: isTypingAdvanceAuto() ? 'auto' : 'manual',
      });
    }

    // ── 스와이프 시각 피드백(선택 사항, 세션 03과 동일한 방식) ────
    /**
     * .sm-card-area에서 손가락이 움직이는 동안 자동 모드 카드(autoCard)에
     * 살짝 translateX를 적용해 "드래그를 따라가는" 느낌을 준다. 실제
     * 스와이프 판정(다음/이전 문장 전환 여부)에는 전혀 관여하지 않으며
     * 오직 표시용이다 — 카드 전환 판정은 touchGesture.attachSwipe의
     * 콜백(autoSwipeHandle)이 전담한다. 여기서 표시가 실패하거나 값이
     * 어긋나도 카드 넘기기 기능 자체에는 영향이 없다.
     */
    function attachAutoCardSwipeVisualFeedback() {
      const area = els.cardArea;
      const card = els.autoCard;
      if (!area || !card) return;

      let startX = 0;
      let dragging = false;
      const MAX_OFFSET = 60; // 카드가 손가락을 따라 이동할 수 있는 최대 px(과장 방지)

      function onTouchStart(event) {
        // 자동 모드 카드가 화면에 보이는 상태일 때만 반응한다(타이핑
        // 모드로 전환되어 카드가 숨겨진 상태에서는 무시).
        if (card.style.display === 'none') return;
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

      autoSwipeVisualCleanup = function () {
        area.removeEventListener('touchstart', onTouchStart);
        area.removeEventListener('touchmove', onTouchMove);
        area.removeEventListener('touchend', resetCardPosition);
        area.removeEventListener('touchcancel', resetCardPosition);
        card.style.transition = '';
        card.style.transform = '';
      };
    }

    // ── 카드 렌더링(빈 상태) ─────────────────────────────────
    function renderEmpty(message) {
      els.cardArea.style.display = 'none';
      els.emptyState.style.display = 'block';
      els.emptyState.textContent = message;
    }

    // ── 자동 재생(시작/정지) ─────────────────────────────────
    function toggleFromButton() {
      autoController.toggle();
    }

    // ── 키보드 단축키 ────────────────────────────────────────
    function handleKeydown(event) {
      if (destroyed) return;
      if (isTypingMode()) return; // 타이핑 모드는 스페이스바 시작/정지 토글을 쓰지 않는다.
      const tag = (event.target && event.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        toggleFromButton();
      }
    }

    // ── 이전/다음 버튼 활성화 상태 ───────────────────────────
    function updateNavButtons() {
      const hasSentences = sentences.length > 0;
      const autoIndex = autoController.getCurrentIndex();
      const typingIndex = typingController.getCurrentIndex();

      els.prevButton.disabled = !hasSentences || autoIndex <= 0;
      els.nextButton.disabled = !hasSentences || autoIndex >= sentences.length - 1;
      els.toggleButton.disabled = !hasSentences;

      els.typingPrevButton.disabled = !hasSentences || typingIndex <= 0;
      els.typingManualNextButton.disabled = !hasSentences || typingIndex >= sentences.length - 1;
    }

    function setStatus(message, kind) {
      els.statusLine.textContent = message;
      els.statusLine.classList.toggle('sm-status-error', kind === 'error');
      els.statusLine.classList.toggle('sm-status-success', kind === 'success');
    }

    return { destroy };
  }

  function buildMarkup() {
    return `
      <div class="sm-panel">
        <div class="sm-controls-row">
          <label class="sm-label" for="smRangeStart">범위</label>
          <input type="number" min="1" placeholder="시작" data-sm="rangeStart" class="sm-range-input">
          <span class="sm-sep">~</span>
          <input type="number" min="1" placeholder="끝" data-sm="rangeEnd" class="sm-range-input">
          <button type="button" class="sm-btn sm-btn-secondary" data-sm="loadButton">불러오기</button>
          <span class="sm-status-line" data-sm="statusLine">범위를 비워두면 전체 문장을 불러옵니다.</span>
        </div>

        <div class="sm-direction-row">
          <span class="sm-label">방향</span>
          <label class="sm-radio-label">
            <input type="radio" name="smDirection" data-sm="dirReading" checked>
            독해 (영어 문장 → 해석)
          </label>
          <label class="sm-radio-label">
            <input type="radio" name="smDirection" data-sm="dirWriting">
            영작 (해석 → 영어 문장)
          </label>
        </div>

        <div class="sm-mode-row">
          <span class="sm-label">진행 방식</span>
          <label class="sm-radio-label">
            <input type="radio" name="smProgressMode" data-sm="modeAuto" checked>
            입눈으로 보기
          </label>
          <label class="sm-radio-label">
            <input type="radio" name="smProgressMode" data-sm="modeTyping">
            타이핑으로 하기
          </label>
        </div>

        <div class="sm-timing-row" data-sm="autoTimingRow">
          <div class="sm-timing-group">
            <label class="sm-label" for="smStage1Number">문장 노출 시간(초)</label>
            <input type="range" data-sm="stage1Slider" class="sm-timing-slider">
            <input type="number" data-sm="stage1Number" class="sm-timing-number">
          </div>
          <div class="sm-timing-group">
            <label class="sm-label" for="smStage2Number">정답(2단계) 노출 시간(초)</label>
            <input type="range" data-sm="stage2Slider" class="sm-timing-slider">
            <input type="number" data-sm="stage2Number" class="sm-timing-number">
          </div>
          <label class="sm-checkbox-label">
            <input type="checkbox" data-sm="autoplayCheckbox">
            자동 발음 재생(옵션)
          </label>
        </div>

        <div class="sm-timing-row" data-sm="typingTimingRow" style="display: none;">
          <div class="sm-typing-advance-group">
            <span class="sm-label">대조 화면 다음 넘어가기</span>
            <label class="sm-radio-label">
              <input type="radio" name="smTypingAdvance" data-sm="typingAdvanceAuto" checked>
              자동
            </label>
            <label class="sm-radio-label">
              <input type="radio" name="smTypingAdvance" data-sm="typingAdvanceManual">
              수동
            </label>
          </div>
          <div class="sm-timing-group">
            <label class="sm-label" for="smReviewSeconds">대조 화면 유지 시간(초)</label>
            <input type="number" data-sm="reviewSeconds" class="sm-timing-number" min="1" step="0.5" value="3">
          </div>
        </div>
      </div>

      <div class="sm-panel sm-stage">
        <div class="sm-empty-state" data-sm="emptyState">범위를 지정하고 "불러오기"를 눌러 문장을 시작하세요.</div>

        <div class="sm-card-area" data-sm="cardArea" style="display: none;">
          <div class="sm-card-progress" data-sm="cardProgress"></div>
          <div class="sm-card" data-sm="autoCard">
            <div class="sm-field-label" data-sm="primaryLabel"></div>
            <div class="sm-card-primary" data-sm="cardPrimary"></div>

            <div class="sm-divider"></div>

            <div class="sm-field-label" data-sm="secondaryLabel"></div>
            <div class="sm-card-secondary" data-sm="cardSecondary" style="display: none;"></div>
          </div>

          <div class="sm-card sm-typing-card" data-sm="typingCard" style="display: none;">
            <div class="sm-field-label" data-sm="typingPrimaryLabel"></div>
            <div class="sm-card-primary" data-sm="typingPrimaryText"></div>

            <div class="sm-typing-input-area" data-sm="typingInputArea">
              <textarea class="sm-typing-input" data-sm="typingInput" rows="3" placeholder="여기에 입력하고 제출하세요 (Ctrl+Enter로 제출)"></textarea>
              <button type="button" class="sm-btn sm-btn-primary" data-sm="typingSubmitButton">제출</button>
            </div>

            <div class="sm-typing-review" data-sm="typingReview" style="display: none;">
              <div class="sm-review-block">
                <div class="sm-field-label">내 답</div>
                <div class="sm-review-text" data-sm="typingMyAnswer"></div>
              </div>
              <div class="sm-review-block">
                <div class="sm-field-label">정답</div>
                <div class="sm-review-text sm-review-correct" data-sm="typingCorrectAnswer"></div>
              </div>
              <button type="button" class="sm-btn sm-btn-secondary sm-next-problem-btn" data-sm="typingNextButton" style="display: none;">다음 문제 ▶</button>
            </div>
          </div>

          <div class="sm-nav-row" data-sm="autoNavRow">
            <button type="button" class="sm-btn sm-btn-ghost" data-sm="prevButton">◀ 이전</button>
            <button type="button" class="sm-btn sm-btn-primary sm-toggle-btn" data-sm="toggleButton">시작</button>
            <button type="button" class="sm-btn sm-btn-ghost" data-sm="nextButton">다음 ▶</button>
          </div>

          <div class="sm-nav-row" data-sm="typingNavRow" style="display: none;">
            <button type="button" class="sm-btn sm-btn-ghost" data-sm="typingPrevButton">◀ 이전</button>
            <button type="button" class="sm-btn sm-btn-ghost" data-sm="typingManualNextButton">다음 ▶</button>
          </div>
        </div>
      </div>

      <p class="sm-hint" data-sm="autoHint">스페이스바: 시작/정지 토글 · 이전/다음은 버튼으로만 이동합니다. 1단계 노출 시간이 지나면 같은 카드에 정답이 이어서 나타나고, 2단계 노출 시간이 더 지나면 다음 문장으로 넘어갑니다.</p>
      <p class="sm-hint" data-sm="typingHint" style="display: none;">문제를 보고 입력창에 답을 입력한 뒤 제출(버튼 또는 Ctrl+Enter)하면 내 답과 정답이 나란히 표시됩니다.</p>
    `;
  }

  return { mount };
});
