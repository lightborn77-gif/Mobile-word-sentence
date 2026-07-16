/**
 * app/controllers/settingsPanelController.js
 *
 * 역할
 * ----
 * 전역 설정 모달(재생속도/자동재생, 퀴즈 문제 수/순서/방식/정답표시/
 * 문제 전환 대기, 문장 모드 노출·대조 시간, 회화 모드 A/B턴 시간)의
 * DOM 참조·열기/닫기·입력값 읽기/반영·저장을 전담한다. 값은
 * core/wordStore.getSettings/saveSetting을 통해 settings 스토어에
 * 저장되어 다음 방문 시에도 유지된다.
 *
 * 이 파일이 하지 않는 일
 * ----------------------
 * - 설정값을 각 모듈(flashcard/quiz/sentenceMode/conversationMode)에
 *   실제로 전달하는 일과, 값이 바뀐 뒤 열려 있는 탭을 다시 마운트하는
 *   일은 여러 모듈을 아는 조립자인 app/main.js가 계속 담당한다. 이
 *   컨트롤러는 onSettingsChange 콜백으로 main.js에 알리기만 한다.
 *
 * 공개 API
 * --------
 * createSettingsPanelController(deps) →
 *   { load, getSettings, setSetting, savePartial, syncPanelFromCurrent, open, close }
 *   - load(): 페이지 로드 시 1회 호출, settings 스토어에서 값을 읽어와
 *     반영하고 패널 폼도 맞춘 뒤 Promise를 반환한다.
 *   - getSettings(): 현재 설정값 객체를 참조로 반환한다(복사본이 아님).
 *     main.js와 각 모듈의 onSettingsChange 콜백이 이 객체의 필드를
 *     직접 읽고/쓰는 기존 흐름을 그대로 지원하기 위함이다.
 *   - setSetting(key, value) / savePartial(partial): 개별 키 갱신 / 영구 저장.
 *   - syncPanelFromCurrent(): 현재 설정값을 패널 입력 엘리먼트에 반영한다
 *     (모듈 내부에서 값이 바뀌었을 때도 패널이 열려 있다면 호출됨).
 *   - open()/close(): 모달을 열고 닫는다.
 *
 * 의존성 (deps로 주입받음 — 상태를 직접 소유하지 않음)
 * --------------------------------------------------
 * - dom: 설정 패널에 필요한 DOM 엘리먼트 모음
 * - wordStore: core/wordStore.js (getSettings/saveSetting 호출용)
 * - defaults: 설정 기본값 객체(SETTINGS_DEFAULTS)
 * - onSettingsChange(currentSettings): 값이 바뀔 때마다 호출되는 콜백
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.settingsPanelController = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {object} deps
   * @param {object} deps.dom - 설정 패널 모달/입력/라벨 DOM 참조 모음(각 필드는
   *   settingXxx / settingXxxLabel 형태로, index.html의 id와 1:1 대응한다)
   * @param {object} deps.wordStore
   * @param {object} deps.defaults - SETTINGS_DEFAULTS
   * @param {function(object):void} [deps.onSettingsChange]
   */
  function createSettingsPanelController(deps) {
    const dom = deps.dom;
    const wordStore = deps.wordStore;
    const defaults = deps.defaults;
    const onSettingsChange = deps.onSettingsChange || function () {};

    // 메모리에 캐시해두는 현재 설정값(모듈이 재마운트될 때마다 다시
    // 조회하지 않도록). main.js를 비롯해 여러 모듈의 onSettingsChange
    // 콜백이 이 객체의 필드를 직접 읽고/쓰는 기존 흐름을 유지하기 위해
    // getSettings()는 이 객체를 복사하지 않고 참조 그대로 반환한다.
    let currentSettings = { ...defaults };

    /**
     * 페이지 로드 시 settings 스토어에서 전역 설정을 불러와 currentSettings에
     * 반영하고, 설정 패널 폼의 초기값도 함께 맞춘다.
     *
     * @returns {Promise<void>}
     */
    function load() {
      return wordStore.getSettings(defaults).then((settings) => {
        currentSettings = { ...defaults, ...settings };
        syncPanelFromCurrent();
      });
    }

    function getSettings() {
      return currentSettings;
    }

    function setSetting(key, value) {
      currentSettings[key] = value;
    }

    /**
     * currentSettings의 일부 키만 골라 settings 스토어에 저장한다.
     * (모듈에서 바뀐 값을 즉시 저장할 때 사용)
     *
     * @param {Object<string, *>} partial
     */
    function savePartial(partial) {
      Object.keys(partial).forEach((key) => {
        wordStore.saveSetting(key, partial[key]).catch((err) => {
          console.error('설정 저장 중 오류:', err);
        });
      });
    }

    function open() {
      syncPanelFromCurrent();
      dom.settingsOverlay.classList.add('open');
      dom.settingsCloseButton.focus();
    }

    function close() {
      dom.settingsOverlay.classList.remove('open');
    }

    /**
     * currentSettings 값을 설정 패널의 각 입력 엘리먼트에 반영한다.
     * (모듈 내부에서 값이 바뀌었을 때도 패널이 열려 있다면 동기화되도록 호출)
     */
    function syncPanelFromCurrent() {
      dom.settingIntervalSeconds.value = String(currentSettings.flashcardIntervalSeconds);
      dom.settingIntervalSecondsLabel.textContent = `${Number(currentSettings.flashcardIntervalSeconds).toFixed(1)}초`;
      dom.settingAutoplay.checked = !!currentSettings.flashcardAutoplay;

      dom.settingQuizCount.value = currentSettings.quizCount ? String(currentSettings.quizCount) : '';
      dom.settingQuizOrder.value = currentSettings.quizOrder;
      dom.settingQuizDirection.value = currentSettings.quizDirection;
      dom.settingRevealOnWrong.checked = !!currentSettings.quizRevealOnWrong;
      dom.settingQuizDelay.value = String(currentSettings.quizDelaySeconds);
      dom.settingQuizDelayLabel.textContent = `${Number(currentSettings.quizDelaySeconds).toFixed(1)}초`;

      // 문장 모드 설정 동기화
      dom.settingSentenceStageOneSeconds.value = String(currentSettings.sentenceStageOneSeconds);
      dom.settingSentenceStageTwoSeconds.value = String(currentSettings.sentenceStageTwoSeconds);
      dom.settingSentenceCompareSeconds.value = String(currentSettings.sentenceCompareSeconds);
      dom.settingSentenceAdvanceMode.value = currentSettings.sentenceAdvanceMode;

      // 회화 모드 설정 동기화
      dom.settingConversationTurnASeconds.value = String(currentSettings.conversationTurnASeconds);
      dom.settingConversationTurnASecondsLabel.textContent = `${Number(currentSettings.conversationTurnASeconds).toFixed(1)}초`;
      dom.settingConversationTurnBSeconds.value = String(currentSettings.conversationTurnBSeconds);
      dom.settingConversationTurnBSecondsLabel.textContent = `${Number(currentSettings.conversationTurnBSeconds).toFixed(1)}초`;
    }

    /**
     * 설정 패널에서 사용자가 값을 바꿀 때마다 호출된다. currentSettings를
     * 갱신하고 settings 스토어에 저장한 뒤, onSettingsChange 콜백으로
     * main.js에 알려 지금 열려 있는 모드가 있다면 새 설정으로 다시
     * 마운트해 즉시 반영하도록 한다.
     */
    function handlePanelChange() {
      currentSettings = {
        flashcardIntervalSeconds: Number(dom.settingIntervalSeconds.value),
        flashcardAutoplay: !!dom.settingAutoplay.checked,
        quizCount: dom.settingQuizCount.value.trim() === '' ? null : Number(dom.settingQuizCount.value),
        quizOrder: dom.settingQuizOrder.value,
        quizDirection: dom.settingQuizDirection.value,
        quizRevealOnWrong: !!dom.settingRevealOnWrong.checked,
        quizDelaySeconds: Number(dom.settingQuizDelay.value),

        // 문장 모드 설정
        sentenceStageOneSeconds: Number(dom.settingSentenceStageOneSeconds.value),
        sentenceStageTwoSeconds: Number(dom.settingSentenceStageTwoSeconds.value),
        sentenceCompareSeconds: Number(dom.settingSentenceCompareSeconds.value),
        sentenceAdvanceMode: dom.settingSentenceAdvanceMode.value,

        // 회화 모드 설정
        conversationTurnASeconds: Number(dom.settingConversationTurnASeconds.value),
        conversationTurnBSeconds: Number(dom.settingConversationTurnBSeconds.value),
      };

      dom.settingIntervalSecondsLabel.textContent = `${currentSettings.flashcardIntervalSeconds.toFixed(1)}초`;
      dom.settingQuizDelayLabel.textContent = `${currentSettings.quizDelaySeconds.toFixed(1)}초`;
      dom.settingConversationTurnASecondsLabel.textContent = `${currentSettings.conversationTurnASeconds.toFixed(1)}초`;
      dom.settingConversationTurnBSecondsLabel.textContent = `${currentSettings.conversationTurnBSeconds.toFixed(1)}초`;

      savePartial(currentSettings);

      dom.settingsSaveLine.textContent = '설정이 저장되었습니다.';
      clearTimeout(handlePanelChange._clearTimer);
      handlePanelChange._clearTimer = setTimeout(() => {
        dom.settingsSaveLine.textContent = '';
      }, 1500);

      onSettingsChange(currentSettings);
    }

    function bindEvents() {
      dom.settingsOpenButton.addEventListener('click', open);
      dom.settingsCloseButton.addEventListener('click', close);
      dom.settingsOverlay.addEventListener('click', (e) => {
        if (e.target === dom.settingsOverlay) close();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && dom.settingsOverlay.classList.contains('open')) {
          close();
        }
      });

      dom.settingIntervalSeconds.addEventListener('input', handlePanelChange);
      dom.settingAutoplay.addEventListener('change', handlePanelChange);
      dom.settingQuizCount.addEventListener('change', handlePanelChange);
      dom.settingQuizOrder.addEventListener('change', handlePanelChange);
      dom.settingQuizDirection.addEventListener('change', handlePanelChange);
      dom.settingRevealOnWrong.addEventListener('change', handlePanelChange);
      dom.settingQuizDelay.addEventListener('input', handlePanelChange);

      // 문장 모드 설정 필드도 동일한 방식으로 등록한다.
      dom.settingSentenceStageOneSeconds.addEventListener('input', handlePanelChange);
      dom.settingSentenceStageTwoSeconds.addEventListener('input', handlePanelChange);
      dom.settingSentenceCompareSeconds.addEventListener('input', handlePanelChange);
      dom.settingSentenceAdvanceMode.addEventListener('change', handlePanelChange);

      // 회화 모드 설정 필드도 동일한 방식으로 등록한다.
      dom.settingConversationTurnASeconds.addEventListener('input', handlePanelChange);
      dom.settingConversationTurnBSeconds.addEventListener('input', handlePanelChange);
    }

    bindEvents();

    return {
      load,
      getSettings,
      setSetting,
      savePartial,
      syncPanelFromCurrent,
      open,
      close,
    };
  }

  return { createSettingsPanelController };
});
