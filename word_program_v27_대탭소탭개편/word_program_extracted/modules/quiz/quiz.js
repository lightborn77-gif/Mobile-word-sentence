/**
 * modules/quiz/quiz.js
 *
 * 퀴즈 모드(4지선다 문제 진행) 모듈.
 * 오직 core(wordStore)만 참조하며, flashcard/result 등 다른 모듈의
 * 내부 코드는 절대 직접 참조하지 않는다(아키텍처 원칙).
 *
 * ── 주요 기능 ────────────────────────────────────────────────
 * - 범위 지정 UI (wordStore.getWordsInRange), 문제 수 설정
 * - 출제 순서: 순차 / 랜덤
 * - 출제 방식: 단어→뜻 / 뜻→단어 / 혼합(문제마다 무작위)
 * - 퀴즈 유형: 4지선다 / OX (아래 참고)
 * - 4지선다: 정답 1 + 오답 3, 정답 위치 무작위로 문제 생성
 * - 보기(또는 OX) 클릭/단축키 선택 시 자동으로 다음 문제 전환(대기 시간 설정 가능)
 *   - 4지선다: 숫자키 1~4가 화면에 표시된 보기 순번과 그대로 대응(클릭과 동시 지원)
 *   - OX: 숫자키 1 = O, 2 = X
 * - 오답 시 정답 표시 여부 토글
 * - 문제 진행 상태(현재/전체, 진행률) 표시
 * - 정오답 기록을 세션 내 배열에 저장
 *   { wordId, word, meaning, isCorrect, selectedAnswer, correctAnswer }
 * - 퀴즈가 끝나면(마지막 문제 채점 직후) 기록된 각 문제의 결과를
 *   wordStore.recordResult(wordId, isCorrect)로 IndexedDB wordState에
 *   일괄 반영한다(학습 상태 로직에 실제로 연동되는 지점).
 * - 문제가 화면에 표시될 때, 전역 "자동 발음 재생" 설정이 켜져 있으면
 *   core/ttsEngine을 통해 해당 단어의 발음을 자동으로 읽어준다.
 *   - kind === 'wordToMeaning'(문제가 영단어인 경우): 문제 텍스트(단어)를 읽는다.
 *   - kind === 'meaningToWord'(문제가 뜻인 경우): 문제에는 읽을 영단어가 없으므로,
 *     정답이 되는 영단어(보기 중 하나)를 미리 읽지 않고, 채점 후(정답 공개 시)
 *     정답 단어를 읽어준다. 정답을 미리 들려주면 문제가 성립하지 않기 때문이다.
 *
 * ── OX 모드(quizType === 'ox') ──────────────────────────────────
 * 4지선다와 달리 보기 목록 없이 "단어-뜻 페어 하나"만 보여주고
 * 그 페어가 맞는 조합(O)인지 틀린 조합(X)인지만 판단하는 방식이다.
 * - 문제 상단: 단어(또는 뜻), 문제 하단: 그에 대응한다고 "제시된" 뜻(또는 단어)
 * - 출제 방식(단어→뜻/뜻→단어/혼합), 범위, 문제 수, 출제 순서는 4지선다와 동일하게 공유
 * - O:X 비율(oxRatio, 0~100, "O로 낼 확률" %)로 문제마다 정답 페어를 그대로
 *   보여줄지(O) 틀린 페어로 바꿔치기할지(X) 결정한다.
 * - X를 만들 때 오답 난이도(oxDifficulty)에 따라 바꿔치기할 상대 단어를 고른다.
 *   - 'easy': 후보 풀 전체에서 완전 무작위 선택(뜻/철자가 크게 다를 가능성이 높음)
 *   - 'hard': 정답 텍스트와 편집거리(레벤슈타인)가 가까운, 즉 철자/표기가
 *     비슷해 헷갈리기 쉬운 상대를 우선 선택(후보가 부족하면 무작위로 보충)
 * - 단축키: 숫자 1 = O(정답), 2 = X(오답) 선택. 클릭과 동일하게 동작하며
 *   문제 표시 중에만 활성화된다(입력창 포커스 중에는 비활성화).
 *
 * ── 결과 화면과의 연동 ──────────────────────────────────────────
 * 결과 화면 자체(맞은/틀린 목록, 발음 재생, 정답률 UI)는 quiz 모듈이
 * 그리지 않는다. quiz는 오직 core만 참조하는 독립 모듈 원칙에 따라
 * modules/result를 직접 참조하지 않으며, 대신 mount()에 전달된
 * onFinish(records) 콜백을 호출해 상위(app/main.js)에 기록을 넘긴다.
 * onFinish가 없으면(콜백 미전달 시) 자체 임시 종료 화면을 그대로
 * 표시한다(하위 호환).
 *
 * ── 상위(app/main.js)와의 연동 지점 ──────────────────────────────
 * - options.getWords(startId, endId): "현재 필터에 해당하는 단어만"
 *   옵션이 켜져 있을 때 필터가 적용된 조회 함수를 주입하는 자리이며,
 *   전달하지 않으면 기존 그대로 wordStore.getWordsInRange/getAllWords를
 *   사용한다(하위 호환). quiz는 필터 로직 자체를 알지 못한다.
 * - options.initialSettings / options.onSettingsChange: 전역 설정
 *   패널의 값(문제 수/출제순서/출제방식/정답표시여부/전환대기)으로
 *   설정 화면의 초기 상태를 맞추고, 값이 바뀔 때마다 상위에 알려
 *   저장할 수 있게 한다.
 * - options.filterLabel: 필터가 함께 적용 중임을 사용자에게 안내하는 문구.
 * - options.autoplay(boolean): flashcard 모듈과 동일하게 "자동 발음 재생"
 *   전역 설정값을 그대로 받는다. quiz 모듈 자체는 이 값의 저장/UI를
 *   소유하지 않고(자체 체크박스 없음), 상위가 전역 설정 패널의 값을
 *   그대로 주입해 사용할지만 결정한다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../core/wordStore.js'), require('../../core/ttsEngine.js'), require('../../core/htmlUtil.js'));
  } else {
    root.quizModule = factory(root.wordStore, root.ttsEngine, root.htmlUtil);
  }
})(typeof self !== 'undefined' ? self : this, function (wordStore, ttsEngine, htmlUtil) {
  'use strict';

  const MIN_DELAY = 0.5;   // 다음 문제 전환 대기 최소(초)
  const MAX_DELAY = 5.0;   // 다음 문제 전환 대기 최대(초)
  const STEP_DELAY = 0.5;
  const DEFAULT_DELAY = 1.5;

  const SPEECH_RATE = 1;   // 퀴즈 발음 재생 속도(플래시카드와 달리 슬라이더 없이 고정)

  const CHOICE_COUNT = 4; // 4지선다

  // OX 모드 기본값
  const DEFAULT_OX_RATIO = 50;      // O로 낼 확률(%)
  const DEFAULT_OX_DIFFICULTY = 'easy'; // 'easy' | 'hard'

  // 글자 크기 기본값(px). 사용자가 입력해 바꿀 수 있지만 저장하지
  // 않으므로, 이 화면을 벗어났다가 다시 들어오면 항상 이 값으로 시작한다.
  const DEFAULT_QUESTION_SIZE = 26;
  const DEFAULT_CHOICE_SIZE = 15;
  const FONT_SIZE_LIMITS = {
    question: { min: 14, max: 80 },
    choice: { min: 12, max: 40 },
  };

  /**
   * 퀴즈 모드 화면을 containerEl 내부에 마운트한다.
   *
   * @param {HTMLElement} containerEl - 퀴즈 모드 UI를 그릴 컨테이너
   * @param {object} [options]
   * @param {(records: Array) => void} [options.onFinish] - 퀴즈가 끝나고
   *        wordStore.recordResult 반영까지 마친 직후 호출되는 콜백.
   *        결과 화면(modules/result) 렌더링은 이 콜백을 받은 상위
   *        (app/main.js)가 담당한다(quiz는 result를 직접 참조하지 않음).
   *        전달하지 않으면 자체 임시 종료 화면을 표시한다.
   * @param {(startId:number|null, endId:number|null) => Promise<Array>} [options.getWords] -
   *        범위를 받아 단어 배열을 반환하는 함수. 전달하지 않으면
   *        wordStore.getWordsInRange/getAllWords를 그대로 사용한다.
   * @param {object} [options.initialSettings] - 전역 설정 패널의 초기값
   *        { count, order, direction, revealOnWrong, delaySeconds }.
   * @param {(settings: object) => void} [options.onSettingsChange] - 설정 값이
   *        바뀔 때마다 호출(전역 설정 저장용).
   * @param {string} [options.filterLabel] - 필터가 함께 적용 중임을 알리는 안내 문구.
   * @param {boolean} [options.autoplay=true] - 문제/정답 표시 시 발음 자동 재생 여부.
   *        전역 설정 패널의 "자동 발음 재생" 값을 그대로 전달받는다.
   * @param {string} [options.lang] - 발음 언어 코드(다국어 TTS, 예: 'en-US').
   *        이 모듈은 언어를 판단하지 않고 ttsEngine.speak(..., { lang })에
   *        얹기만 한다. 전달하지 않으면 ttsEngine 기본값('en-US')을 쓴다.
   * @returns {{ destroy: () => void }} 모드를 벗어날 때 정리할 수 있는 핸들
   */
  function mount(containerEl, options) {
    if (!containerEl) {
      throw new Error('quizModule.mount: containerEl이 필요합니다.');
    }

    const modeOptions = options || {};
    const getWordsFn = typeof modeOptions.getWords === 'function' ? modeOptions.getWords : null;
    const isAutoplayOn = () => modeOptions.autoplay !== false; // 명시적으로 false가 아니면 켜짐(기본 on)

    containerEl.innerHTML = buildSetupMarkup();

    const setupEls = {
      rangeStart: containerEl.querySelector('[data-qz="rangeStart"]'),
      rangeEnd: containerEl.querySelector('[data-qz="rangeEnd"]'),
      countInput: containerEl.querySelector('[data-qz="countInput"]'),
      typeRadios: Array.from(containerEl.querySelectorAll('[data-qz="typeRadio"]')),
      orderRadios: Array.from(containerEl.querySelectorAll('[data-qz="orderRadio"]')),
      directionRadios: Array.from(containerEl.querySelectorAll('[data-qz="directionRadio"]')),
      revealCheckbox: containerEl.querySelector('[data-qz="revealCheckbox"]'),
      delayInput: containerEl.querySelector('[data-qz="delayInput"]'),
      delayValueLabel: containerEl.querySelector('[data-qz="delayValueLabel"]'),
      startButton: containerEl.querySelector('[data-qz="startButton"]'),
      statusLine: containerEl.querySelector('[data-qz="statusLine"]'),
      stage: containerEl.querySelector('[data-qz="stage"]'),
      questionSizeInput: containerEl.querySelector('[data-qz="questionSizeInput"]'),
      choiceSizeInput: containerEl.querySelector('[data-qz="choiceSizeInput"]'),
      oxOptionsRow: containerEl.querySelector('[data-qz="oxOptionsRow"]'),
      oxRatioInput: containerEl.querySelector('[data-qz="oxRatioInput"]'),
      oxRatioValueLabel: containerEl.querySelector('[data-qz="oxRatioValueLabel"]'),
      oxDifficultyRadios: Array.from(containerEl.querySelectorAll('[data-qz="oxDifficultyRadio"]')),
    };

    let destroyed = false;
    let currentSession = null; // 진행 중인 세션 상태(runSession이 채움), destroy 시 정리 대상

    init();

    function init() {
      setupEls.startButton.addEventListener('click', handleStartClicked);
      setupEls.delayInput.addEventListener('input', updateDelayLabel);

      setupEls.delayInput.min = String(MIN_DELAY);
      setupEls.delayInput.max = String(MAX_DELAY);
      setupEls.delayInput.step = String(STEP_DELAY);

      // 전역 설정 패널에서 넘겨준 초기값이 있으면 그 값으로 시작한다.
      const initial = modeOptions.initialSettings || {};

      const initialDelay = Number.isFinite(Number(initial.delaySeconds))
        ? Number(initial.delaySeconds)
        : DEFAULT_DELAY;
      setupEls.delayInput.value = String(Math.min(MAX_DELAY, Math.max(MIN_DELAY, initialDelay)));
      updateDelayLabel();

      if (initial.count) {
        setupEls.countInput.value = String(initial.count);
      }
      if (initial.order) {
        setupEls.orderRadios.forEach((r) => { r.checked = r.value === initial.order; });
      }
      if (initial.direction) {
        setupEls.directionRadios.forEach((r) => { r.checked = r.value === initial.direction; });
      }
      if (initial.revealOnWrong !== undefined) {
        setupEls.revealCheckbox.checked = !!initial.revealOnWrong;
      }
      if (initial.quizType) {
        setupEls.typeRadios.forEach((r) => { r.checked = r.value === initial.quizType; });
      }
      const initialOxRatio = Number.isFinite(Number(initial.oxRatio))
        ? Math.min(100, Math.max(0, Number(initial.oxRatio)))
        : DEFAULT_OX_RATIO;
      setupEls.oxRatioInput.value = String(initialOxRatio);
      updateOxRatioLabel();
      if (initial.oxDifficulty) {
        setupEls.oxDifficultyRadios.forEach((r) => { r.checked = r.value === initial.oxDifficulty; });
      }

      setupEls.typeRadios.forEach((r) => r.addEventListener('change', () => { syncRadioGroupStyle(); syncOxOptionsVisibility(); notifySettingsChange(); }));
      setupEls.orderRadios.forEach((r) => r.addEventListener('change', () => { syncRadioGroupStyle(); notifySettingsChange(); }));
      setupEls.directionRadios.forEach((r) => r.addEventListener('change', () => { syncRadioGroupStyle(); notifySettingsChange(); }));
      setupEls.oxDifficultyRadios.forEach((r) => r.addEventListener('change', () => { syncRadioGroupStyle(); notifySettingsChange(); }));
      setupEls.countInput.addEventListener('change', notifySettingsChange);
      setupEls.revealCheckbox.addEventListener('change', notifySettingsChange);
      setupEls.oxRatioInput.addEventListener('input', () => { updateOxRatioLabel(); notifySettingsChange(); });
      syncRadioGroupStyle();
      syncOxOptionsVisibility();

      // 글자 크기는 설정으로 저장하지 않으므로 항상 기본값으로 시작한다.
      setupEls.questionSizeInput.addEventListener('input', applyFontSizes);
      setupEls.choiceSizeInput.addEventListener('input', applyFontSizes);
      setupEls.questionSizeInput.value = String(DEFAULT_QUESTION_SIZE);
      setupEls.choiceSizeInput.value = String(DEFAULT_CHOICE_SIZE);
      applyFontSizes();

      renderStageEmpty('범위와 문제 수, 출제 옵션을 선택하고 "퀴즈 시작"을 눌러주세요.');
      if (modeOptions.filterLabel) {
        setStatus(modeOptions.filterLabel, 'neutral');
      }
    }

    /**
     * 문제 수/출제순서/출제방식/정답표시여부/전환대기 값이 바뀔 때마다
     * 상위(app/main.js)에 알려 전역 설정(settings 스토어)에 저장할 수
     * 있게 한다.
     */
    function notifySettingsChange() {
      if (typeof modeOptions.onSettingsChange !== 'function') return;
      modeOptions.onSettingsChange({
        count: Number(setupEls.countInput.value) || null,
        order: getSelectedRadioValue(setupEls.orderRadios, 'sequential'),
        direction: getSelectedRadioValue(setupEls.directionRadios, 'wordToMeaning'),
        revealOnWrong: !!setupEls.revealCheckbox.checked,
        delaySeconds: getDelaySeconds(),
        quizType: getSelectedRadioValue(setupEls.typeRadios, 'multipleChoice'),
        oxRatio: getOxRatio(),
        oxDifficulty: getSelectedRadioValue(setupEls.oxDifficultyRadios, DEFAULT_OX_DIFFICULTY),
      });
    }

    function destroy() {
      destroyed = true;
      if (currentSession && currentSession.cleanup) {
        currentSession.cleanup();
      }
      ttsEngine.cancel();
    }

    function updateDelayLabel() {
      setupEls.delayValueLabel.textContent = `${getDelaySeconds().toFixed(1)}초`;
      notifySettingsChange();
    }

    function getDelaySeconds() {
      const v = Number(setupEls.delayInput.value);
      if (!Number.isFinite(v)) return DEFAULT_DELAY;
      return Math.min(MAX_DELAY, Math.max(MIN_DELAY, v));
    }

    function updateOxRatioLabel() {
      setupEls.oxRatioValueLabel.textContent = `O ${getOxRatio()}% / X ${100 - getOxRatio()}%`;
    }

    function getOxRatio() {
      const v = Number(setupEls.oxRatioInput.value);
      if (!Number.isFinite(v)) return DEFAULT_OX_RATIO;
      return Math.min(100, Math.max(0, Math.round(v)));
    }

    /**
     * 퀴즈 유형이 'ox'일 때만 OX 전용 옵션(O:X 비율, 오답 난이도) 행을 보여준다.
     * 4지선다일 때는 숨겨서 화면을 복잡하게 만들지 않는다.
     */
    function syncOxOptionsVisibility() {
      const type = getSelectedRadioValue(setupEls.typeRadios, 'multipleChoice');
      setupEls.oxOptionsRow.style.display = type === 'ox' ? '' : 'none';
    }

    function syncRadioGroupStyle() {
      containerEl.querySelectorAll('.qz-radio-option').forEach((label) => {
        const input = label.querySelector('input');
        label.classList.toggle('checked', !!(input && input.checked));
      });
    }

    // ── 글자 크기 조절 ────────────────────────────────────────
    /**
     * 두 입력창(문제/보기)의 현재 값을 읽어 허용 범위로 고정한 뒤
     * .qz-stage에 CSS 변수(--qz-question-size 등)로 주입한다. 문제 화면은
     * 매번 innerHTML로 다시 그려지지만 stage의 자식이라 상속되어 항상
     * 최신 값이 즉시 반영된다.
     */
    function applyFontSizes() {
      const questionSize = clampFontSize(setupEls.questionSizeInput.value, FONT_SIZE_LIMITS.question, DEFAULT_QUESTION_SIZE);
      const choiceSize = clampFontSize(setupEls.choiceSizeInput.value, FONT_SIZE_LIMITS.choice, DEFAULT_CHOICE_SIZE);

      setupEls.stage.style.setProperty('--qz-question-size', questionSize + 'px');
      setupEls.stage.style.setProperty('--qz-choice-size', choiceSize + 'px');
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

    function getSelectedRadioValue(radios, fallback) {
      const checked = radios.find((r) => r.checked);
      return checked ? checked.value : fallback;
    }

    // ── 퀴즈 시작 ────────────────────────────────────────────
    function handleStartClicked() {
      const startVal = setupEls.rangeStart.value.trim();
      const endVal = setupEls.rangeEnd.value.trim();
      const hasStart = startVal !== '';
      const hasEnd = endVal !== '';

      const countVal = Number(setupEls.countInput.value);
      const order = getSelectedRadioValue(setupEls.orderRadios, 'sequential');
      const direction = getSelectedRadioValue(setupEls.directionRadios, 'wordToMeaning');
      const revealOnWrong = !!setupEls.revealCheckbox.checked;
      const delaySeconds = getDelaySeconds();
      const quizType = getSelectedRadioValue(setupEls.typeRadios, 'multipleChoice');
      const oxRatio = getOxRatio();
      const oxDifficulty = getSelectedRadioValue(setupEls.oxDifficultyRadios, DEFAULT_OX_DIFFICULTY);
      const minWordsNeeded = quizType === 'ox' ? 2 : CHOICE_COUNT;
      const minChoicePoolNeeded = CHOICE_COUNT; // 예문형도 4지선다이므로 보기 후보는 4개 필요

      setStatus('단어를 불러오는 중...', 'neutral');
      setupEls.startButton.disabled = true;

      // 상위(app/main.js)가 "현재 필터에 해당하는 단어만" 옵션을 위해
      // getWords 함수를 주입했다면 그 함수를 사용하고, 없으면 기존 그대로
      // wordStore.getWordsInRange/getAllWords를 사용한다(하위 호환).
      const loadPromise = getWordsFn
        ? getWordsFn(hasStart && hasEnd ? Number(startVal) : null, hasStart && hasEnd ? Number(endVal) : null)
        : (hasStart && hasEnd)
          ? wordStore.getWordsInRange(Number(startVal), Number(endVal))
          : wordStore.getAllWords();

      loadPromise
        .then((words) => {
          setupEls.startButton.disabled = false;

          if (!words || words.length < minWordsNeeded) {
            const typeLabel = quizType === 'ox' ? 'OX' : (quizType === 'sentence' ? '예문형' : '4지선다');
            setStatus(
              `${typeLabel} 문제를 만들려면 범위 내 단어가 최소 ${minWordsNeeded}개 필요합니다. (현재 ${words ? words.length : 0}개)`,
              'error'
            );
            return;
          }

          if (quizType === 'sentence') {
            const eligible = filterWordsWithSentenceMatch(words);
            if (eligible.length < minChoicePoolNeeded) {
              setStatus(
                `예문형 문제를 만들려면 예문에서 단어가 확인되는 단어가 범위 내 최소 ${minChoicePoolNeeded}개 필요합니다. (현재 ${eligible.length}개)`,
                'error'
              );
              return;
            }
          }

          const eligibleCountForSentence = quizType === 'sentence'
            ? filterWordsWithSentenceMatch(words).length
            : words.length;

          const requestedCount = Number.isFinite(countVal) && countVal > 0
            ? Math.floor(countVal)
            : eligibleCountForSentence;
          const questionCount = Math.min(requestedCount, eligibleCountForSentence);

          const questions = quizType === 'ox'
            ? buildOxQuestions(words, questionCount, order, direction, oxRatio, oxDifficulty)
            : quizType === 'sentence'
              ? buildSentenceQuestions(words, questionCount, order, direction)
              : buildQuestions(words, questionCount, order, direction);

          if (currentSession && currentSession.cleanup) {
            currentSession.cleanup();
          }

          currentSession = runSession(questions, { revealOnWrong, delaySeconds, quizType });
          setStatus(`${questions.length}문제 준비 완료. 문제를 풀어주세요.`, 'success');
        })
        .catch((err) => {
          console.error(err);
          setupEls.startButton.disabled = false;
          setStatus('단어를 불러오는 중 오류가 발생했습니다: ' + err.message, 'error');
        });
    }

    // ── 문제 생성 ────────────────────────────────────────────
    /**
     * 전체 단어 풀에서 questionCount개의 문제를 생성한다.
     *
     * @param {Array} words - 범위 내 전체 단어(정답/오답 후보 풀 겸용)
     * @param {number} questionCount
     * @param {'sequential'|'random'} order
     * @param {'wordToMeaning'|'meaningToWord'|'mixed'} direction
     * @returns {Array<{wordId:number, word:string, meaning:string, kind:'wordToMeaning'|'meaningToWord', questionText:string, choices:string[], correctIndex:number}>}
     */
    function buildQuestions(words, questionCount, order, direction) {
      const pool = words.slice();
      const ordered = order === 'random' ? shuffle(pool) : pool;
      const targets = ordered.slice(0, questionCount);

      return targets.map((target) => {
        const kind = direction === 'mixed'
          ? (Math.random() < 0.5 ? 'wordToMeaning' : 'meaningToWord')
          : direction;

        return buildSingleQuestion(target, words, kind);
      });
    }

    /**
     * 단어 하나에 대한 4지선다 문제를 만든다.
     * - kind === 'wordToMeaning': 문제는 영단어, 보기는 뜻 4개
     * - kind === 'meaningToWord': 문제는 뜻, 보기는 단어 4개
     * 오답 3개는 같은 범위(words) 내 다른 단어에서 중복 없이 무작위 추출한다.
     *
     * @param {object} target - 정답이 되는 단어 객체
     * @param {Array} words - 오답 후보를 뽑을 전체 풀(범위 내 전체 단어)
     * @param {'wordToMeaning'|'meaningToWord'} kind
     */
    function buildSingleQuestion(target, words, kind) {
      const isWordToMeaning = kind === 'wordToMeaning';
      const questionText = isWordToMeaning ? target.word : target.meaning;
      const correctAnswer = isWordToMeaning ? target.meaning : target.word;

      // 오답 후보: target 자신을 제외한 나머지 단어들 중에서 무작위로 3개.
      // (같은 뜻/단어 텍스트가 우연히 중복되는 경우도 배제해 보기 내용이 겹치지 않게 한다)
      const others = words.filter((w) => w.id !== target.id);
      const shuffledOthers = shuffle(others);

      const wrongAnswers = [];
      const usedTexts = new Set([correctAnswer]);

      for (const w of shuffledOthers) {
        if (wrongAnswers.length >= CHOICE_COUNT - 1) break;
        const candidateText = isWordToMeaning ? w.meaning : w.word;
        if (!candidateText || usedTexts.has(candidateText)) continue;
        usedTexts.add(candidateText);
        wrongAnswers.push(candidateText);
      }

      // 후보가 부족한(단어 풀이 매우 작거나 중복이 많은) 극단적 케이스 방어:
      // 그래도 4개를 채우지 못하면 있는 만큼만 사용한다(화면에서는 보기 수가 줄어들 수 있음).
      const choicesUnordered = [correctAnswer, ...wrongAnswers];
      const choices = shuffle(choicesUnordered);
      const correctIndex = choices.indexOf(correctAnswer);

      return {
        wordId: target.id,
        word: target.word,
        meaning: target.meaning,
        kind,
        questionText,
        choices,
        correctIndex,
      };
    }

    function shuffle(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    // ── 예문형(Sentence) 문제 생성 ────────────────────────────
    function findWordOccurrenceInSentence(word, sentenceText) {
      if (!word || !sentenceText) return null;

      const candidates = buildInflectionCandidates(word)
        .filter((c, i, arr) => c && arr.indexOf(c) === i)
        .sort((a, b) => b.length - a.length);

      for (const candidate of candidates) {
        const re = new RegExp('\\b' + escapeRegExp(candidate) + '\\b', 'i');
        const match = re.exec(sentenceText);
        if (match) {
          return { start: match.index, end: match.index + match[0].length, matchedText: match[0] };
        }
      }
      return null;
    }
    function buildInflectionCandidates(word) {
      const w = String(word || '').trim();
      if (!w) return [];
      const lower = w.toLowerCase();
      const candidates = [w];

      if (/[^aeiou]y$/i.test(lower)) {
        const stem = lower.slice(0, -1);
        candidates.push(stem + 'ied', stem + 'ies', stem + 'ier', stem + 'iest');
      }

      if (/e$/i.test(lower)) {
        const stem = lower.slice(0, -1);
        candidates.push(stem + 'ed', stem + 'ing', lower + 'd', lower + 's');
      } else {
        if (/[aeiou][^aeiouwxy]$/i.test(lower)) {
          const lastChar = lower.slice(-1);
          candidates.push(
            lower + lastChar + 'ed', lower + lastChar + 'ing',
            lower + lastChar + 'er', lower + lastChar + 'est'
          );
        }
        candidates.push(lower + 'ed', lower + 'ing');
      }

      if (/[sxz]$|[cs]h$/i.test(lower)) {
        candidates.push(lower + 'es');
      } else {
        candidates.push(lower + 's');
      }

      candidates.push(lower + 'er', lower + 'est');
      return candidates;
    }

    function escapeRegExp(str) {
      return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    function filterWordsWithSentenceMatch(words) {
      const result = [];
      for (const w of words) {
        const sentence = w.example && w.example.sentence ? w.example.sentence : '';
        if (!sentence.trim()) continue;
        const match = findWordOccurrenceInSentence(w.word, sentence);
        if (!match) continue;
        result.push(Object.assign({}, w, { _sentenceMatch: match }));
      }
      return result;
    }
    function buildSentenceQuestions(words, questionCount, order, direction) {
      const eligible = filterWordsWithSentenceMatch(words);
      const ordered = order === 'random' ? shuffle(eligible) : eligible;
      const targets = ordered.slice(0, questionCount);

      return targets.map((target) => {
        const kind = direction === 'mixed'
          ? (Math.random() < 0.5 ? 'wordToMeaning' : 'meaningToWord')
          : direction;
        return buildSingleSentenceQuestion(target, words, kind);
      });
    }
    function buildSingleSentenceQuestion(target, words, kind) {
      const isWordToMeaning = kind === 'wordToMeaning';
      const correctAnswer = isWordToMeaning ? target.meaning : target.word;
      const sentence = target.example.sentence;
      const match = target._sentenceMatch;

      const others = words.filter((w) => w.id !== target.id);
      const shuffledOthers = shuffle(others);

      const wrongAnswers = [];
      const usedTexts = new Set([correctAnswer]);

      for (const w of shuffledOthers) {
        if (wrongAnswers.length >= CHOICE_COUNT - 1) break;
        const candidateText = isWordToMeaning ? w.meaning : w.word;
        if (!candidateText || usedTexts.has(candidateText)) continue;
        usedTexts.add(candidateText);
        wrongAnswers.push(candidateText);
      }

      const choicesUnordered = [correctAnswer, ...wrongAnswers];
      const choices = shuffle(choicesUnordered);
      const correctIndex = choices.indexOf(correctAnswer);

      return {
        wordId: target.id,
        word: target.word,
        meaning: target.meaning,
        kind,
        isSentence: true,
        sentence,
        matchStart: match.start,
        matchEnd: match.end,
        matchedText: match.matchedText,
        translation: target.example.translation || '',
        questionText: isWordToMeaning
          ? sentence
          : sentence.slice(0, match.start) + '(' + target.meaning + ')' + sentence.slice(match.end),
        choices,
        correctIndex,
      };
    }

    // ── OX 문제 생성 ─────────────────────────────────────────
    /**
     * 전체 단어 풀에서 questionCount개의 OX 문제를 생성한다.
     * 각 문제는 "단어-뜻 페어 하나"와 그 페어가 맞는지(isTrue) 여부로 구성된다.
     *
     * @param {Array} words - 범위 내 전체 단어(정답/오답 후보 풀 겸용)
     * @param {number} questionCount
     * @param {'sequential'|'random'} order
     * @param {'wordToMeaning'|'meaningToWord'|'mixed'} direction
     * @param {number} oxRatio - O로 낼 확률(%), 0~100
     * @param {'easy'|'hard'} oxDifficulty - X를 만들 때 오답 상대를 고르는 방식
     * @returns {Array<{wordId:number, word:string, meaning:string, kind:'wordToMeaning'|'meaningToWord',
     *   questionText:string, presentedAnswer:string, correctAnswer:string, isTrue:boolean}>}
     */
    function buildOxQuestions(words, questionCount, order, direction, oxRatio, oxDifficulty) {
      const pool = words.slice();
      const ordered = order === 'random' ? shuffle(pool) : pool;
      const targets = ordered.slice(0, questionCount);

      return targets.map((target) => {
        const kind = direction === 'mixed'
          ? (Math.random() < 0.5 ? 'wordToMeaning' : 'meaningToWord')
          : direction;

        return buildSingleOxQuestion(target, words, kind, oxRatio, oxDifficulty);
      });
    }

    /**
     * 단어 하나에 대한 OX 문제를 만든다.
     * - kind === 'wordToMeaning': 문제 텍스트는 영단어, 제시된 답은 뜻
     * - kind === 'meaningToWord': 문제 텍스트는 뜻, 제시된 답은 영단어
     * - oxRatio(%) 확률로 정답 그대로(O) 출제하고, 그 외에는 다른 단어의
     *   답으로 바꿔치기(X)한다.
     * - X로 만들 때 oxDifficulty === 'hard'이면 정답 텍스트와 편집거리가
     *   가까운(철자/표기가 비슷한) 상대를 우선 선택해 헷갈리게 만든다.
     */
    function buildSingleOxQuestion(target, words, kind, oxRatio, oxDifficulty) {
      const isWordToMeaning = kind === 'wordToMeaning';
      const questionText = isWordToMeaning ? target.word : target.meaning;
      const correctAnswer = isWordToMeaning ? target.meaning : target.word;

      const others = words.filter((w) => w.id !== target.id);
      const isTrue = others.length === 0 ? true : (Math.random() * 100 < oxRatio);

      let presentedAnswer = correctAnswer;

      if (!isTrue && others.length > 0) {
        const impostor = pickOxImpostor(target, others, isWordToMeaning, oxDifficulty, correctAnswer);
        presentedAnswer = isWordToMeaning ? impostor.meaning : impostor.word;
        // 극히 드물게(중복 뜻/단어 데이터 등) 바꿔치기 결과가 정답과 텍스트가
        // 같아져 버리면 문제가 성립하지 않으므로 이 경우엔 O로 되돌린다.
        if (!presentedAnswer || presentedAnswer === correctAnswer) {
          presentedAnswer = correctAnswer;
        }
      }

      const actuallyTrue = presentedAnswer === correctAnswer;

      return {
        wordId: target.id,
        word: target.word,
        meaning: target.meaning,
        kind,
        questionText,
        presentedAnswer,
        correctAnswer,
        isTrue: actuallyTrue,
      };
    }

    /**
     * X 문제를 만들 때 정답 대신 보여줄 "가짜 상대 단어"를 고른다.
     * - 'easy': others 중 완전 무작위 1개
     * - 'hard': others 중 정답 텍스트와 편집거리가 가장 가까운 후보들
     *   (상위 30% 또는 최소 3개) 중에서 무작위 1개를 골라, 매번 같은
     *   상대만 나오지 않도록 한다.
     */
    function pickOxImpostor(target, others, isWordToMeaning, oxDifficulty, correctAnswer) {
      if (oxDifficulty !== 'hard') {
        return shuffle(others)[0];
      }

      const scored = others
        .map((w) => {
          const candidateText = isWordToMeaning ? w.meaning : w.word;
          if (!candidateText) return null;
          return { w, dist: levenshteinDistance(correctAnswer, candidateText) };
        })
        .filter(Boolean)
        .sort((a, b) => a.dist - b.dist);

      if (scored.length === 0) return shuffle(others)[0];

      const topN = Math.max(3, Math.ceil(scored.length * 0.3));
      const closest = scored.slice(0, topN).map((s) => s.w);
      return shuffle(closest)[0];
    }

    /**
     * 두 문자열 사이의 레벤슈타인 편집거리(삽입/삭제/치환 최소 횟수)를 계산한다.
     * OX 모드의 'hard' 난이도에서 정답과 철자/표기가 비슷한 오답 후보를
     * 찾는 데만 사용하는 간단한 동적 계획법 구현이다.
     */
    function levenshteinDistance(a, b) {
      const s1 = String(a || '');
      const s2 = String(b || '');
      const m = s1.length;
      const n = s2.length;
      if (m === 0) return n;
      if (n === 0) return m;

      let prevRow = new Array(n + 1);
      let curRow = new Array(n + 1);
      for (let j = 0; j <= n; j++) prevRow[j] = j;

      for (let i = 1; i <= m; i++) {
        curRow[0] = i;
        for (let j = 1; j <= n; j++) {
          const cost = s1[i - 1] === s2[j - 1] ? 0 : 1;
          curRow[j] = Math.min(
            prevRow[j] + 1,      // 삭제
            curRow[j - 1] + 1,   // 삽입
            prevRow[j - 1] + cost // 치환
          );
        }
        [prevRow, curRow] = [curRow, prevRow];
      }
      return prevRow[n];
    }

    // ── 문제 진행 세션 ───────────────────────────────────────
    /**
     * 문제 목록을 받아 진행 화면을 그리고 상태를 관리한다.
     *
     * @param {Array} questions
     * @param {{ revealOnWrong: boolean, delaySeconds: number }} options
     * @returns {{ cleanup: () => void }}
     */
    function runSession(questions, options) {
      let index = 0;
      const records = []; // { wordId, word, meaning, isCorrect, selectedAnswer, correctAnswer }
      let advanceTimerId = null;
      let sessionDestroyed = false;

      const isOxMode = options.quizType === 'ox';

      // 숫자키 단축 선택: OX 모드는 1/2(O/X), 4지선다 모드는 1~4(보기 순번).
      // 두 모드 모두 문제 진행 중(아직 답을 고르지 않은 상태)에만 동작한다.
      document.addEventListener('keydown', handleQuizKeydown);

      renderQuestion();

      function cleanup() {
        sessionDestroyed = true;
        if (advanceTimerId !== null) {
          clearTimeout(advanceTimerId);
          advanceTimerId = null;
        }
        ttsEngine.cancel();
        document.removeEventListener('keydown', handleQuizKeydown);
      }

      function renderQuestion() {
        if (sessionDestroyed || destroyed) return;

        const q = questions[index];
        const total = questions.length;
        const progressPct = Math.round((index / total) * 100);

        setupEls.stage.innerHTML = isOxMode
          ? buildOxQuestionMarkup(q, index, total, progressPct)
          : buildQuestionMarkup(q, index, total, progressPct);

        if (isOxMode) {
          const oxButtons = Array.from(setupEls.stage.querySelectorAll('[data-qz-ox]'));
          oxButtons.forEach((btn) => {
            btn.addEventListener('click', () => handleOxClick(q, btn.dataset.qzOx === 'o', oxButtons));
          });
        } else {
          const choiceButtons = Array.from(setupEls.stage.querySelectorAll('[data-qz-choice]'));
          choiceButtons.forEach((btn) => {
            btn.addEventListener('click', () => handleChoiceClick(q, Number(btn.dataset.qzChoice), choiceButtons));
          });
        }

        // 자동 발음 재생이 켜져 있고, 문제 자체가 영단어인 경우
        // (kind === 'wordToMeaning') 문제 표시와 동시에 그 단어를 읽어준다.
        // kind === 'meaningToWord'인 경우 문제에는 읽을 영단어가 없으므로
        // 여기서는 재생하지 않고, 채점 후 정답 공개 시점에 읽어준다.
        // 예문형(isSentence)의 wordToMeaning은 예문 속 단어 자리가 빈칸으로
        // 가려져 있으므로(정답을 맞혀야 하는 대상), 여기서 미리 읽어주면
        // 정답을 소리로 흘리는 셈이 되어 재생하지 않는다(채점 후 공개 시 재생).
        if (isAutoplayOn() && q.kind === 'wordToMeaning' && !q.isSentence) {
          // 다국어 TTS: modeOptions.lang(상위가 넘겨준 현재 학습 언어)을 그대로 전달한다.
          ttsEngine.speak(q.word, SPEECH_RATE, { lang: modeOptions.lang });
        } else {
          ttsEngine.cancel();
        }
      }

      /**
       * 문제 화면의 숫자키 단축 선택을 처리하는 공통 라우터.
       * - OX 모드: 1 = O, 2 = X
       * - 4지선다 모드: 1~4 = 해당 순번 보기 선택(보기가 4개 미만이면 그 개수만큼만 반응)
       * 두 모드 모두 문제 진행 중(답을 아직 선택하지 않은 상태)에만 동작하며,
       * 입력창에 포커스가 있을 때는 무시한다(다른 UI 입력과 충돌 방지).
       */
      function handleQuizKeydown(e) {
        if (sessionDestroyed || destroyed) return;
        const activeTag = document.activeElement && document.activeElement.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA') return;

        if (isOxMode) {
          handleOxKeydown(e);
        } else {
          handleChoiceKeydown(e);
        }
      }

      /**
       * OX 모드 전용 단축키 처리: 1 = O, 2 = X.
       */
      function handleOxKeydown(e) {
        const oxButtons = Array.from(setupEls.stage.querySelectorAll('[data-qz-ox]'));
        if (oxButtons.length === 0 || oxButtons.some((b) => b.disabled)) return;

        if (e.key === '1') {
          e.preventDefault();
          handleOxClick(questions[index], true, oxButtons);
        } else if (e.key === '2') {
          e.preventDefault();
          handleOxClick(questions[index], false, oxButtons);
        }
      }

      /**
       * 4지선다 모드 전용 단축키 처리: 숫자 1~4가 화면에 표시된 보기 순번과
       * 그대로 대응한다(보기의 qz-choice-num 배지 숫자와 동일). 보기가 4개
       * 미만인 극단적 케이스에서는 존재하는 순번까지만 반응한다.
       */
      function handleChoiceKeydown(e) {
        const choiceButtons = Array.from(setupEls.stage.querySelectorAll('[data-qz-choice]'));
        if (choiceButtons.length === 0 || choiceButtons.some((b) => b.disabled)) return;

        const keyNum = Number(e.key);
        if (!Number.isInteger(keyNum) || keyNum < 1 || keyNum > choiceButtons.length) return;

        e.preventDefault();
        handleChoiceClick(questions[index], keyNum - 1, choiceButtons);
      }

      /**
       * OX 보기 선택 처리. handleChoiceClick과 대응되는 OX 전용 버전으로,
       * selectedAnswer/correctAnswer는 사람이 읽을 수 있는 "O" / "X" 문자열로 기록한다.
       */
      function handleOxClick(question, selectedIsTrue, oxButtons) {
        if (sessionDestroyed || destroyed) return;
        if (oxButtons.some((b) => b.disabled)) return;

        const isCorrect = selectedIsTrue === question.isTrue;
        const selectedAnswer = selectedIsTrue ? 'O' : 'X';
        const correctAnswerLabel = question.isTrue ? 'O' : 'X';

        records.push({
          wordId: question.wordId,
          word: question.word,
          meaning: question.meaning,
          isCorrect,
          selectedAnswer,
          correctAnswer: correctAnswerLabel,
        });

        oxButtons.forEach((b) => {
          b.disabled = true;
          const isThisTrueButton = b.dataset.qzOx === 'o';
          const wasSelected = isThisTrueButton === selectedIsTrue;
          if (wasSelected && isCorrect) {
            b.classList.add('qz-selected-correct');
          } else if (wasSelected && !isCorrect) {
            b.classList.add('qz-selected-wrong');
          } else if (!isCorrect && options.revealOnWrong && isThisTrueButton === question.isTrue) {
            b.classList.add('qz-reveal-correct');
          } else {
            b.classList.add('qz-dim');
          }
        });

        const feedbackEl = setupEls.stage.querySelector('[data-qz="feedbackLine"]');
        if (feedbackEl) {
          if (isCorrect) {
            feedbackEl.textContent = '정답입니다!';
            feedbackEl.className = 'qz-feedback-line qz-feedback-correct';
          } else if (options.revealOnWrong) {
            feedbackEl.textContent = `오답입니다. 정답: ${correctAnswerLabel} (${question.correctAnswer})`;
            feedbackEl.className = 'qz-feedback-line qz-feedback-wrong';
          } else {
            feedbackEl.textContent = '오답입니다.';
            feedbackEl.className = 'qz-feedback-line qz-feedback-wrong';
          }
        }

        // 정답 공개 시점에 실제 정답 단어를 읽어준다(문제가 뜻으로 시작한
        // meaningToWord인 경우 문제 표시 시엔 읽지 않았으므로 중복되지 않는다).
        if (isAutoplayOn() && question.kind === 'meaningToWord') {
          ttsEngine.speak(question.word, SPEECH_RATE, { lang: modeOptions.lang });
        }

        advanceTimerId = setTimeout(() => {
          advanceTimerId = null;
          index += 1;
          if (index >= questions.length) {
            renderFinish();
          } else {
            renderQuestion();
          }
        }, options.delaySeconds * 1000);
      }

      function handleChoiceClick(question, choiceIndex, choiceButtons) {
        if (sessionDestroyed || destroyed) return;

        // 중복 클릭 방지: 이미 답을 선택했으면 무시(버튼은 disabled 처리되지만 방어적으로 재확인)
        if (choiceButtons.some((b) => b.disabled)) return;

        const isCorrect = choiceIndex === question.correctIndex;
        const selectedAnswer = question.choices[choiceIndex];
        const correctAnswer = question.choices[question.correctIndex];

        records.push({
          wordId: question.wordId,
          word: question.word,
          meaning: question.meaning,
          isCorrect,
          selectedAnswer,
          correctAnswer,
        });

        choiceButtons.forEach((b, i) => {
          b.disabled = true;
          if (i === choiceIndex && isCorrect) {
            b.classList.add('qz-selected-correct');
          } else if (i === choiceIndex && !isCorrect) {
            b.classList.add('qz-selected-wrong');
          } else if (!isCorrect && options.revealOnWrong && i === question.correctIndex) {
            b.classList.add('qz-reveal-correct');
          } else {
            b.classList.add('qz-dim');
          }
        });

        const feedbackEl = setupEls.stage.querySelector('[data-qz="feedbackLine"]');
        if (feedbackEl) {
          if (isCorrect) {
            feedbackEl.textContent = '정답입니다!';
            feedbackEl.className = 'qz-feedback-line qz-feedback-correct';
          } else if (options.revealOnWrong) {
            feedbackEl.textContent = `오답입니다. 정답: ${correctAnswer}`;
            feedbackEl.className = 'qz-feedback-line qz-feedback-wrong';
          } else {
            feedbackEl.textContent = '오답입니다.';
            feedbackEl.className = 'qz-feedback-line qz-feedback-wrong';
          }
        }

        // 자동 발음 재생이 켜져 있고, 문제가 "뜻→단어"(kind === 'meaningToWord')
        // 방식이었던 경우 채점 직후(정답 여부가 확정된 이 시점)에 영단어(question.word)
        // 발음을 읽어준다. "단어→뜻" 방식은 문제 표시 시 이미 renderQuestion에서 읽었으므로
        // 여기서 다시 읽지 않는다(중복 재생 방지). 다만 예문형(isSentence)의
        // "단어→뜻"은 renderQuestion에서 정답 노출을 막기 위해 재생을 건너뛰었으므로,
        // 채점이 끝난 지금 시점에 읽어준다(예문형은 kind와 무관하게 항상 여기서 재생).
        if (isAutoplayOn() && (question.kind === 'meaningToWord' || question.isSentence)) {
          // 다국어 TTS: modeOptions.lang(상위가 넘겨준 현재 학습 언어)을 그대로 전달한다.
          ttsEngine.speak(question.word, SPEECH_RATE, { lang: modeOptions.lang });
        }

        advanceTimerId = setTimeout(() => {
          advanceTimerId = null;
          index += 1;
          if (index >= questions.length) {
            renderFinish();
          } else {
            renderQuestion();
          }
        }, options.delaySeconds * 1000);
      }

      function renderFinish() {
        if (sessionDestroyed || destroyed) return;

        const correctCount = records.filter((r) => r.isCorrect).length;
        const total = records.length;

        console.log('[퀴즈 종료] 정오답 기록:', records);

        setStatus('퀴즈 결과를 학습 상태에 반영하는 중...', 'neutral');

        recordAllResultsSequentially(records)
          .catch((err) => {
            console.error('[퀴즈 결과 반영 오류]', err);
          })
          .then(() => {
            if (sessionDestroyed || destroyed) return;

            if (typeof modeOptions.onFinish === 'function') {
              modeOptions.onFinish(records.slice());
              return;
            }

            setupEls.stage.innerHTML = buildFinishMarkup(records, correctCount, total);

            setStatus(
              `퀴즈 종료: ${total}문제 중 ${correctCount}개 정답 (${total > 0 ? Math.round((correctCount / total) * 100) : 0}%). ` +
              '학습 상태에 반영되었습니다.',
              'success'
            );

            const restartButton = setupEls.stage.querySelector('[data-qz="restartButton"]');
            if (restartButton) {
              restartButton.addEventListener('click', () => {
                cleanup();
                currentSession = null;
                renderStageEmpty('범위와 문제 수, 출제 옵션을 선택하고 "퀴즈 시작"을 눌러주세요.');
                setStatus('새 퀴즈를 준비해주세요.', 'neutral');
              });
            }
          });
      }

      function recordAllResultsSequentially(recs) {
        return recs.reduce(
          (chain, r) => chain.then(() => wordStore.recordResult(r.wordId, r.isCorrect)),
          Promise.resolve()
        );
      }

      return { cleanup };
    }

    // ── 화면 렌더 헬퍼 ───────────────────────────────────────
    function renderStageEmpty(message) {
      setupEls.stage.innerHTML = `<div class="qz-empty-state">${escapeHtml(message)}</div>`;
    }

    function setStatus(message, kind) {
      setupEls.statusLine.textContent = message;
      setupEls.statusLine.classList.toggle('qz-status-error', kind === 'error');
      setupEls.statusLine.classList.toggle('qz-status-success', kind === 'success');
    }

    return { destroy };
  }

  // ── 마크업 빌더 ────────────────────────────────────────────
  function buildSetupMarkup() {
    return `
      <div class="qz-panel">
        <div class="qz-setup-grid">
          <div class="qz-setup-field">
            <span class="qz-label">범위</span>
            <div class="qz-range-row">
              <input type="number" min="1" placeholder="시작" data-qz="rangeStart" class="qz-range-input">
              <span class="qz-sep">~</span>
              <input type="number" min="1" placeholder="끝" data-qz="rangeEnd" class="qz-range-input">
            </div>
          </div>

          <div class="qz-setup-field">
            <span class="qz-label">문제 수</span>
            <input type="number" min="1" placeholder="전체" data-qz="countInput" class="qz-count-input">
          </div>

          <div class="qz-setup-field">
            <span class="qz-label">퀴즈 유형</span>
            <div class="qz-radio-group">
              <label class="qz-radio-option">
                <input type="radio" name="qzType" value="multipleChoice" data-qz="typeRadio" checked>4지선다
              </label>
              <label class="qz-radio-option">
                <input type="radio" name="qzType" value="ox" data-qz="typeRadio">OX
              </label>
              <label class="qz-radio-option">
                <input type="radio" name="qzType" value="sentence" data-qz="typeRadio">예문형
              </label>
            </div>
          </div>

          <div class="qz-setup-field">
            <span class="qz-label">출제 순서</span>
            <div class="qz-radio-group">
              <label class="qz-radio-option">
                <input type="radio" name="qzOrder" value="sequential" data-qz="orderRadio" checked>순차
              </label>
              <label class="qz-radio-option">
                <input type="radio" name="qzOrder" value="random" data-qz="orderRadio">랜덤
              </label>
            </div>
          </div>

          <div class="qz-setup-field">
            <span class="qz-label">출제 방식</span>
            <div class="qz-radio-group">
              <label class="qz-radio-option">
                <input type="radio" name="qzDirection" value="wordToMeaning" data-qz="directionRadio" checked>단어→뜻
              </label>
              <label class="qz-radio-option">
                <input type="radio" name="qzDirection" value="meaningToWord" data-qz="directionRadio">뜻→단어
              </label>
              <label class="qz-radio-option">
                <input type="radio" name="qzDirection" value="mixed" data-qz="directionRadio">혼합
              </label>
            </div>
          </div>

          <div class="qz-setup-field" data-qz="oxOptionsRow" style="display:none;">
            <span class="qz-label">OX 비율 / 난이도</span>
            <div class="qz-ox-options-col">
              <div class="qz-delay-group">
                <input type="range" min="0" max="100" step="5" data-qz="oxRatioInput" class="qz-delay-slider">
                <span class="qz-delay-value" data-qz="oxRatioValueLabel"></span>
              </div>
              <div class="qz-radio-group">
                <label class="qz-radio-option">
                  <input type="radio" name="qzOxDifficulty" value="easy" data-qz="oxDifficultyRadio" checked>쉬움(무작위 오답)
                </label>
                <label class="qz-radio-option">
                  <input type="radio" name="qzOxDifficulty" value="hard" data-qz="oxDifficultyRadio">어려움(헷갈리는 오답)
                </label>
              </div>
            </div>
          </div>

          <div class="qz-setup-field">
            <span class="qz-label">오답 시 정답 표시</span>
            <div class="qz-toggle-row">
              <label class="qz-checkbox-label">
                <input type="checkbox" data-qz="revealCheckbox" checked>
                켜짐(오답 클릭 시 정답 강조)
              </label>
            </div>
          </div>

          <div class="qz-setup-field">
            <span class="qz-label">다음 문제 전환 대기</span>
            <div class="qz-delay-group">
              <input type="range" data-qz="delayInput" class="qz-delay-slider">
              <span class="qz-delay-value" data-qz="delayValueLabel"></span>
            </div>
          </div>

          <div class="qz-setup-field">
            <span class="qz-label">글자 크기(px)</span>
            <div class="qz-fontsize-row">
              <label class="qz-label" for="qzQuestionSize">문제</label>
              <input type="number" min="14" max="80" step="1" data-qz="questionSizeInput" class="qz-fontsize-input">
              <label class="qz-label" for="qzChoiceSize">보기</label>
              <input type="number" min="12" max="40" step="1" data-qz="choiceSizeInput" class="qz-fontsize-input">
            </div>
          </div>
        </div>

        <div style="margin-top: 18px;">
          <button type="button" class="qz-btn qz-btn-primary" data-qz="startButton">퀴즈 시작</button>
          <span class="qz-status-line" data-qz="statusLine">범위를 비워두면 전체 단어에서 출제합니다. 문제 수를 비워두면 전체 단어 수만큼 출제합니다. (단축키: 4지선다·예문형 1~4, OX 1=O·2=X) 예문형은 예문에서 단어가 확인되는 단어만 출제됩니다.</span>
        </div>
      </div>

      <div class="qz-panel qz-stage" data-qz="stage"></div>
    `;
  }

  function buildQuestionMarkup(q, index, total, progressPct) {
    const kindLabel = q.isSentence
      ? (q.kind === 'wordToMeaning' ? '예문 → 뜻' : '예문 → 단어')
      : (q.kind === 'wordToMeaning' ? '단어 → 뜻' : '뜻 → 단어');

    const choicesHtml = q.choices.map((choice, i) => `
      <button type="button" class="qz-choice-btn" data-qz-choice="${i}">
        <span class="qz-choice-num">${i + 1}</span>
        <span>${escapeHtml(choice)}</span>
      </button>
    `).join('');

    const questionCardHtml = q.isSentence
      ? buildSentenceQuestionCardHtml(q)
      : `<div class="qz-question-card"><span class="qz-question-text">${escapeHtml(q.questionText)}</span></div>`;

    return `
      <div class="qz-progress-row">
        <span class="qz-progress-text">${index + 1} / ${total}</span>
        <div class="qz-progress-bar-track">
          <div class="qz-progress-bar-fill" style="width:${progressPct}%;"></div>
        </div>
      </div>

      <div class="qz-question-area">
        <div>
          <div style="text-align:center;">
            <span class="qz-question-kind">${kindLabel}</span>
          </div>
          ${questionCardHtml}
        </div>

        <div class="qz-choice-list">
          ${choicesHtml}
        </div>

        <div class="qz-feedback-line" data-qz="feedbackLine"></div>
      </div>
    `;
  }

  function buildOxQuestionMarkup(q, index, total, progressPct) {
    const kindLabel = q.kind === 'wordToMeaning' ? '단어 → 뜻' : '뜻 → 단어';

    return `
      <div class="qz-progress-row">
        <span class="qz-progress-text">${index + 1} / ${total}</span>
        <div class="qz-progress-bar-track">
          <div class="qz-progress-bar-fill" style="width:${progressPct}%;"></div>
        </div>
      </div>

      <div class="qz-question-area">
        <div>
          <div style="text-align:center;">
            <span class="qz-question-kind">${kindLabel}</span>
          </div>
          <div class="qz-question-card">
            <span class="qz-question-text">${escapeHtml(q.questionText)}</span>
          </div>
          <div class="qz-ox-presented-card">
            <span class="qz-ox-presented-text">${escapeHtml(q.presentedAnswer)}</span>
          </div>
        </div>

        <div class="qz-ox-choice-list">
          <button type="button" class="qz-ox-btn qz-ox-btn-o" data-qz-ox="o">
            <span class="qz-choice-num">1</span>
            <span class="qz-ox-symbol">O</span>
          </button>
          <button type="button" class="qz-ox-btn qz-ox-btn-x" data-qz-ox="x">
            <span class="qz-choice-num">2</span>
            <span class="qz-ox-symbol">X</span>
          </button>
        </div>

        <div class="qz-feedback-line" data-qz="feedbackLine"></div>
      </div>
    `;
  }

  function buildFinishMarkup(records, correctCount, total) {
    const rowsHtml = records.map((r) => `
      <tr class="${r.isCorrect ? 'qz-record-correct' : 'qz-record-wrong'}">
        <td>
          <span class="qz-record-badge ${r.isCorrect ? 'qz-record-correct-badge' : 'qz-record-wrong-badge'}">
            ${r.isCorrect ? '정답' : '오답'}
          </span>
        </td>
        <td>${escapeHtml(r.word)}</td>
        <td>${escapeHtml(r.meaning)}</td>
        <td>${escapeHtml(r.selectedAnswer)}</td>
        <td>${escapeHtml(r.correctAnswer)}</td>
      </tr>
    `).join('');

    const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

    return `
      <div class="qz-finish-area">
        <div class="qz-finish-title">퀴즈 종료</div>
        <div class="qz-finish-summary">
          ${total}문제 중 <strong>${correctCount}개</strong> 정답 (정답률 ${pct}%)
        </div>

        <div class="qz-record-table-wrapper">
          <table class="qz-record-table">
            <thead>
              <tr>
                <th>결과</th>
                <th>단어</th>
                <th>뜻</th>
                <th>선택한 답</th>
                <th>정답</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>
        </div>

        <button type="button" class="qz-btn qz-btn-secondary" data-qz="restartButton">새 퀴즈 시작</button>
        <p class="qz-hint">
          ※ 이 화면은 퀴즈 모드를 단독으로(onFinish 콜백 없이) 실행했을 때만 표시되는
          자체 임시 종료 화면입니다. 학습 상태(별표/안정권)에는 이미 반영되었습니다.
          정식 결과 화면(발음 재생 포함)은 app/main.js를 통해 modules/result가 담당합니다.
          위 정오답 기록은 브라우저 콘솔에도 출력되어 있습니다.
        </p>
      </div>
    `;
  }

  /**
   * 예문형 문제의 문제 카드 HTML을 조립한다.
   * - kind === 'wordToMeaning': 예문에서 매칭된 단어 자리를 빈칸(___)으로
   *   가려서 보여준다(정답 단어가 뜻을 맞히기 전에 노출되면 안 되므로).
   * - kind === 'meaningToWord': 예문에서 매칭된 단어 자리를 "(뜻)"으로
   *   치환해 보여준다(원래 단어를 맞혀야 하므로 단어는 노출하지 않음).
   * 예문 해석(translation)이 있으면 작은 글씨로 함께 보여준다.
   */
  function buildSentenceQuestionCardHtml(q) {
    const before = q.sentence.slice(0, q.matchStart);
    const after = q.sentence.slice(q.matchEnd);

    const middleHtml = q.kind === 'wordToMeaning'
      ? `<span class="qz-sentence-blank-highlight">____</span>`
      : `<span class="qz-sentence-blank-meaning">(${escapeHtml(q.meaning)})</span>`;

    const translationHtml = q.translation
      ? `<div class="qz-sentence-translation">${escapeHtml(q.translation)}</div>`
      : '';

    return `
      <div class="qz-question-card qz-sentence-card">
        <span class="qz-question-text qz-sentence-text">${escapeHtml(before)}${middleHtml}${escapeHtml(after)}</span>
        ${translationHtml}
      </div>
    `;
  }

  const escapeHtml = htmlUtil.escapeHtml;

  return { mount };
});
