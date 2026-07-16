/**
 * modules/conversationMode/conversationMode.js
 *
 * 회화 모드(A/B 구조)의 진입점 겸 오케스트레이터.
 * modules/sentenceMode/sentenceMode.js + sentenceAutoMode.js 조합과
 * modules/sentenceLists/sentenceLists.js를 참고 템플릿으로 삼았다.
 * 다만 이 모듈은 규모가 sentenceLists 수준이라 "업로드/저장/목록"과
 * "역할선택/시간설정/재생"을 별도 파일로 쪼개지 않고 이 파일 하나에
 * 모두 담았다. 실제 턴 재생/전환 로직만
 * modules/conversationMode/conversationAutoMode.js로 분리했다(엔진을
 * 감싸는 부분이라 sentenceAutoMode.js와 동일하게 독립).
 *
 * core(conversationStore, ttsEngine, playbackEngine) + 같은 모듈 폴더의
 * conversationAutoMode.js만 참조하며, 다른 모듈(wordLists, sentenceMode,
 * sentenceLists 등)의 내부 코드는 절대 직접 참조하지 않는다(아키텍처 원칙
 * — 완전히 독립된 모듈).
 *
 * "언어(lang)"는 이 모듈이 스스로 판단하지 않는다. options.lang으로 받은
 * 값을 conversationAutoModeModule(→ core/playbackEngine)에 그대로 얹기만
 * 한다. 저장 시 발음 언어 선택 드롭다운은 이 모듈 전용으로 독립적으로
 * 만들며(index.html의 기존 saveLangSelect를 공유하지 않는다 — 독립 모듈
 * 원칙), core/ttsEngine.getVoices()로 브라우저가 가진 실제 음성 목록을
 * 읽어와 채운다(app/main.js의 언어 드롭다운과 동일 패턴을 이 모듈
 * 전용으로 복제).
 *
 * ── 주요 기능 ────────────────────────────────────────────────
 * - 파일 업로드 → 파싱(conversationParser) → 저장(conversationStore)
 * - 저장된 리스트 조회/불러오기/삭제(간단한 목록 UI)
 * - 역할 선택("나는 A" / "나는 B")
 * - A 턴 시간 / B 턴 시간 슬라이더(숫자 입력 병행)
 * - 턴 카드 표시(대사 + 해석 + 진행 상태) + 시작/정지/이전/다음
 * - app/main.js를 통해 정식 탭("회화 모드")으로 통합되어 있으며,
 *   전역 설정 패널의 A/B 턴 시간 값과 연동된다(options.initialSettings /
 *   options.onSettingsChange).
 * - 리스트를 불러오면 그 리스트의 발음 언어(lang)가 바뀌었음을
 *   options.onListLoaded(turns, list)로 상위(app/main.js)에 알린다.
 *   상위는 이를 받아 activeLang을 갱신하고 다른 탭에도 반영한다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../../core/conversationStore.js'),
      require('../../core/conversationParser.js'),
      require('../../core/ttsEngine.js'),
      require('./conversationAutoMode.js'),
      require('../../core/touchGesture.js'),
      require('../../core/wakeLock.js')
    );
  } else {
    root.conversationModeModule = factory(
      root.conversationStore,
      root.conversationParser,
      root.ttsEngine,
      root.conversationAutoModeModule,
      root.touchGesture,
      root.wakeLockUtil
    );
  }
})(typeof self !== 'undefined' ? self : this, function (conversationStore, conversationParser, ttsEngine, conversationAutoModeModule, touchGesture, wakeLockUtil) {
  'use strict';

  // A/B 턴 노출/대기 시간 설정 범위(초) — sentenceMode.js의 stage1/stage2와 동일한 범위값 재사용.
  const MIN_SECONDS = 1.0;
  const MAX_SECONDS = 30.0;
  const STEP_SECONDS = 0.5;
  const DEFAULT_A_SECONDS = 4.0;
  const DEFAULT_B_SECONDS = 4.0;

  const SPEECH_RATE = 1; // TTS 발화 속도는 항상 정상 속도로 고정(간격 값과 절대 혼용하지 않음).

  const ROLE_A = 'a';
  const ROLE_B = 'b';

  /**
   * 회화 모드 화면을 containerEl 내부에 마운트한다.
   *
   * @param {HTMLElement} containerEl
   * @param {object} [options]
   * @param {string} [options.lang] - 발음 언어 코드(다국어 TTS, 예: 'en-US').
   *        이 모듈은 언어를 판단하지 않고 conversationAutoModeModule(→
   *        core/playbackEngine)에 그대로 얹기만 한다. 전달하지 않으면
   *        ttsEngine 기본값('en-US')을 쓴다.
   * @param {object} [options.initialSettings] - A/B 시간 초기값
   *        { turnASeconds, turnBSeconds } (전역 설정 패널이 넘겨줄 값.
   *        없으면 이 파일의 기본값을 사용).
   * @param {(settings: {turnASeconds:number, turnBSeconds:number}) => void} [options.onSettingsChange] -
   *        A/B 시간 값이 바뀔 때마다 호출(main.js가 settings
   *        스토어에 저장하도록 연결할 자리).
   * @param {(turns: Array, list: {id:number, name:string, lang:string}) => void} [options.onListLoaded] -
   *        저장된 리스트를 "불러오기"해서 활성 회화 데이터가 갱신된 직후
   *        호출된다(activeLang 동기화에 사용되는 자리).
   * @returns {{ destroy: () => void }}
   */
  function mount(containerEl, options) {
    if (!containerEl) {
      throw new Error('conversationModeModule.mount: containerEl이 필요합니다.');
    }

    const modeOptions = options || {};
    const initialSettings = modeOptions.initialSettings || {};

    containerEl.innerHTML = buildMarkup();

    const els = {
      // 업로드/저장
      fileInput: containerEl.querySelector('[data-cm="fileInput"]'),
      saveLangSelect: containerEl.querySelector('[data-cm="saveLangSelect"]'),
      saveButton: containerEl.querySelector('[data-cm="saveButton"]'),
      uploadStatusLine: containerEl.querySelector('[data-cm="uploadStatusLine"]'),

      // 저장된 리스트
      listEmptyState: containerEl.querySelector('[data-cm="listEmptyState"]'),
      listUl: containerEl.querySelector('[data-cm="listUl"]'),
      selectAllCheckbox: containerEl.querySelector('[data-cm="selectAllCheckbox"]'),
      deleteSelectedButton: containerEl.querySelector('[data-cm="deleteSelectedButton"]'),

      // 역할 선택
      roleA: containerEl.querySelector('[data-cm="roleA"]'),
      roleB: containerEl.querySelector('[data-cm="roleB"]'),

      // 화자별 시간 설정
      aSecondsSlider: containerEl.querySelector('[data-cm="aSecondsSlider"]'),
      aSecondsNumber: containerEl.querySelector('[data-cm="aSecondsNumber"]'),
      bSecondsSlider: containerEl.querySelector('[data-cm="bSecondsSlider"]'),
      bSecondsNumber: containerEl.querySelector('[data-cm="bSecondsNumber"]'),

      // 재생 상태 라인
      statusLine: containerEl.querySelector('[data-cm="statusLine"]'),

      // 카드
      emptyState: containerEl.querySelector('[data-cm="emptyState"]'),
      cardArea: containerEl.querySelector('[data-cm="cardArea"]'),
      card: containerEl.querySelector('[data-cm="cardArea"] .cm-card'),
      cardProgress: containerEl.querySelector('[data-cm="cardProgress"]'),
      speakerBadge: containerEl.querySelector('[data-cm="speakerBadge"]'),
      cardLine: containerEl.querySelector('[data-cm="cardLine"]'),
      cardTranslation: containerEl.querySelector('[data-cm="cardTranslation"]'),

      // 재생 컨트롤
      prevButton: containerEl.querySelector('[data-cm="prevButton"]'),
      nextButton: containerEl.querySelector('[data-cm="nextButton"]'),
      toggleButton: containerEl.querySelector('[data-cm="toggleButton"]'),
    };

    // ── 내부 상태 ────────────────────────────────────────────
    let turns = []; // 현재 로드된(활성) 회화 턴 배열
    let destroyed = false;

    // 방금 파일에서 새로 파싱한 결과(아직 저장 전일 수 있음).
    let pendingParsedTurns = null;
    let pendingFileName = null;

    // touchGesture.attachSwipe()가 반환한 핸들(destroy() 보유).
    // unmount 시점에 destroy()해 리스너 누수를 막는다(세션 03/04와 동일).
    let cardSwipeHandle = null;

    // 세션 03/04의 스와이프 시각 피드백(카드가 드래그를 살짝 따라가는
    // 효과)을 회화 카드에도 동일하게 재사용한다. 실제 턴 전환 판정에는
    // 전혀 관여하지 않는 순수 표시용 리스너.
    let cardSwipeVisualCleanup = null;

    // ── 턴 재생/전환 컨트롤러 ────────────────────────────────
    const autoController = conversationAutoModeModule.createController({
      els: els,
      getTurns: () => turns,
      getMyRole: getMyRole,
      getSpeakerSeconds: (speaker) => (speaker === ROLE_A ? getASeconds() : getBSeconds()),
      speechRate: SPEECH_RATE,
      lang: modeOptions.lang,
      setStatus: setStatus,
      updateNavButtons: updateNavButtons,
    });

    init();

    function init() {
      // 업로드/저장
      els.fileInput.addEventListener('change', handleFileSelected);
      els.saveButton.addEventListener('click', handleSaveClicked);
      initSaveLangSelect();

      // 저장된 리스트
      els.selectAllCheckbox.addEventListener('change', handleSelectAllChange);
      els.deleteSelectedButton.addEventListener('click', handleDeleteSelectedClicked);
      refreshLists();

      // 역할 선택
      els.roleA.addEventListener('change', handleRoleChange);
      els.roleB.addEventListener('change', handleRoleChange);

      // 화자별 시간 설정
      els.aSecondsSlider.min = String(MIN_SECONDS);
      els.aSecondsSlider.max = String(MAX_SECONDS);
      els.aSecondsSlider.step = String(STEP_SECONDS);
      els.aSecondsNumber.min = String(MIN_SECONDS);
      els.aSecondsNumber.max = String(MAX_SECONDS);
      els.aSecondsNumber.step = String(STEP_SECONDS);
      const initASeconds = Number.isFinite(Number(initialSettings.turnASeconds))
        ? Number(initialSettings.turnASeconds) : DEFAULT_A_SECONDS;
      els.aSecondsSlider.value = String(initASeconds);
      els.aSecondsNumber.value = String(initASeconds);

      els.bSecondsSlider.min = String(MIN_SECONDS);
      els.bSecondsSlider.max = String(MAX_SECONDS);
      els.bSecondsSlider.step = String(STEP_SECONDS);
      els.bSecondsNumber.min = String(MIN_SECONDS);
      els.bSecondsNumber.max = String(MAX_SECONDS);
      els.bSecondsNumber.step = String(STEP_SECONDS);
      const initBSeconds = Number.isFinite(Number(initialSettings.turnBSeconds))
        ? Number(initialSettings.turnBSeconds) : DEFAULT_B_SECONDS;
      els.bSecondsSlider.value = String(initBSeconds);
      els.bSecondsNumber.value = String(initBSeconds);

      els.aSecondsSlider.addEventListener('input', () => handleSecondsInput('a', 'slider'));
      els.aSecondsNumber.addEventListener('input', () => handleSecondsInput('a', 'number'));
      els.bSecondsSlider.addEventListener('input', () => handleSecondsInput('b', 'slider'));
      els.bSecondsNumber.addEventListener('input', () => handleSecondsInput('b', 'number'));

      // 값이 바뀔 때마다 상위(main.js)에 알린다.
      els.aSecondsSlider.addEventListener('change', notifySettingsChange);
      els.aSecondsNumber.addEventListener('change', notifySettingsChange);
      els.bSecondsSlider.addEventListener('change', notifySettingsChange);
      els.bSecondsNumber.addEventListener('change', notifySettingsChange);

      // 재생 컨트롤
      els.prevButton.addEventListener('click', () => autoController.goTo(autoController.getCurrentIndex() - 1));
      els.nextButton.addEventListener('click', () => autoController.goTo(autoController.getCurrentIndex() + 1));
      els.toggleButton.addEventListener('click', () => autoController.toggle());

      document.addEventListener('keydown', handleKeydown);

      // ── 스와이프로 턴 넘기기(세션 05) ────────────────────────
      // 회화 카드 영역에서 왼쪽 스와이프 = 다음 턴, 오른쪽 스와이프 =
      // 이전 턴. autoController.goTo()가 이미 범위를 clamp하므로 첫/
      // 마지막 턴에서도 안전하다(sentenceMode.js의 자동 모드 카드와
      // 동일한 패턴).
      cardSwipeHandle = touchGesture.attachSwipe(els.card, {
        onSwipeLeft: () => autoController.goTo(autoController.getCurrentIndex() + 1),
        onSwipeRight: () => autoController.goTo(autoController.getCurrentIndex() - 1),
      });

      // 탭이 백그라운드로 갔다가 돌아왔을 때, 이 순간 재생 중이라면
      // wakeLockUtil이 알아서 wake lock을 재요청하게 등록해둔다(세션
      // 03/04와 동일한 패턴). 실제 요청 시점은 autoController(→엔진의
      // onStart/onStop)가 이미 처리한다.
      wakeLockUtil.enableAutoReacquire(() => autoController.isPlaying());

      // 세션 03/04와 동일한 시각 피드백을 회화 카드에도 적용(필수는
      // 아니지만 일관된 경험을 위해). 턴 전환 판정 로직과는 독립적.
      attachCardSwipeVisualFeedback();

      // 마운트 시점에 현재 활성 회화(conversations 스토어)가 있으면 그대로
      // 이어서 보여준다(sentenceMode.js와 달리 업로드/불러오기 없이도
      // 이전에 활성화된 회화가 있을 수 있으므로).
      loadActiveConversation();

      renderEmpty('회화 파일을 업로드하거나 저장된 리스트를 불러오세요.');
      updateNavButtons();
    }

    function destroy() {
      destroyed = true;
      autoController.destroy();
      document.removeEventListener('keydown', handleKeydown);

      if (cardSwipeHandle) {
        cardSwipeHandle.destroy();
        cardSwipeHandle = null;
      }

      if (cardSwipeVisualCleanup) {
        cardSwipeVisualCleanup();
        cardSwipeVisualCleanup = null;
      }

      // 이 모듈이 등록해둔 "재생 중이면 자동 재요청" 콜백을 해제해,
      // 화면을 벗어난 뒤에도 계속 불리는 일이 없게 한다.
      wakeLockUtil.disableAutoReacquire();
    }

    // ═══════════════════════════════════════════════════════════
    // 업로드 → 파싱 → 저장
    // ═══════════════════════════════════════════════════════════

    function handleFileSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      setUploadStatus(`"${file.name}" 읽는 중...`, 'neutral');
      els.saveButton.disabled = true;

      const reader = new FileReader();

      reader.onload = function (e) {
        const rawText = e.target.result;
        try {
          pendingParsedTurns = conversationParser.parseConversationText(rawText);
          pendingFileName = file.name;
          els.saveButton.disabled = pendingParsedTurns.length === 0;
          if (pendingParsedTurns.length === 0) {
            const hasSpeakerLabel = /^\s*[ab]\s*:/im.test(rawText);
            const message = hasSpeakerLabel
              ? `"${file.name}"에서 화자 라벨(a:/b:)은 있지만 유효한 대사를 인식하지 못했습니다. 파일 형식을 확인해주세요 (형식 안내 참고).`
              : '인식된 대사가 없습니다. 파일 형식을 확인해주세요 (형식 안내 참고).';
            setUploadStatus(message, 'error');
          } else {
            setUploadStatus(
              `"${file.name}" 파싱 완료 (${pendingParsedTurns.length}개 턴 인식됨). "저장"을 눌러 저장하세요.`,
              'neutral'
            );
          }
        } catch (err) {
          console.error(err);
          pendingParsedTurns = null;
          pendingFileName = null;
          els.saveButton.disabled = true;
          setUploadStatus('파싱 중 오류가 발생했습니다: ' + err.message, 'error');
        }
      };

      reader.onerror = function () {
        setUploadStatus('파일을 읽는 중 오류가 발생했습니다.', 'error');
      };

      reader.readAsText(file, 'utf-8');
    }

    function handleSaveClicked() {
      if (!pendingParsedTurns || pendingParsedTurns.length === 0) return;

      els.saveButton.disabled = true;
      setUploadStatus('저장하는 중...', 'neutral');

      const listName = pendingFileName || `회화 리스트 (${pendingParsedTurns.length}개)`;
      const lang = (els.saveLangSelect && els.saveLangSelect.value) || conversationStore.DEFAULT_LANG;

      Promise.all([
        conversationStore.saveConversation(pendingParsedTurns),
        conversationStore.saveConversationList(listName, pendingParsedTurns, undefined, lang),
      ])
        .then(() => {
          turns = pendingParsedTurns;
          setUploadStatus(`${pendingParsedTurns.length}개 턴을 저장했습니다.`, 'success');
          setStatus(`${turns.length}개 턴을 불러왔습니다.`, 'success');
          els.fileInput.value = '';
          pendingParsedTurns = null;
          pendingFileName = null;
          autoController.stop();
          autoController.showCurrent({ speak: false });
          updateNavButtons();
          return refreshLists();
        })
        .catch((err) => {
          console.error(err);
          setUploadStatus('저장 중 오류가 발생했습니다: ' + err.message, 'error');
        })
        .finally(() => {
          els.saveButton.disabled = true;
        });
    }

    function setUploadStatus(text, kind) {
      els.uploadStatusLine.textContent = text;
      els.uploadStatusLine.classList.remove('cm-status-neutral', 'cm-status-success', 'cm-status-error');
      els.uploadStatusLine.classList.add('cm-status-' + (kind || 'neutral'));
    }

    // ═══════════════════════════════════════════════════════════
    // 다국어 TTS — 저장용 언어 선택 드롭다운(이 모듈 전용, 독립)
    // ═══════════════════════════════════════════════════════════

    /**
     * 저장 화면의 언어 선택 드롭다운(saveLangSelect)을 초기화한다.
     * app/main.js의 initSaveLangSelect/populateSaveLangSelect와 동일한
     * 패턴이지만, 독립 모듈 원칙에 따라 이 모듈 전용으로 별도 구현했다
     * (index.html의 기존 saveLangSelect를 공유하지 않는다).
     */
    function initSaveLangSelect() {
      populateSaveLangSelect();
      ttsEngine.onVoicesChanged(populateSaveLangSelect);
    }

    function populateSaveLangSelect() {
      if (!els.saveLangSelect) return;

      const voices = ttsEngine.getVoices();
      const previousValue = els.saveLangSelect.value;

      const seen = new Set();
      const langs = [];
      voices.forEach((v) => {
        if (!v.lang || seen.has(v.lang)) return;
        seen.add(v.lang);
        langs.push(v.lang);
      });

      if (langs.length === 0) {
        langs.push(conversationStore.DEFAULT_LANG);
      }

      langs.sort((a, b) => a.localeCompare(b));

      els.saveLangSelect.innerHTML = '';
      langs.forEach((lang) => {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = formatLangOptionLabel(lang);
        els.saveLangSelect.appendChild(opt);
      });

      const wanted = previousValue || modeOptions.lang;
      if (wanted && langs.includes(wanted)) {
        els.saveLangSelect.value = wanted;
      }
    }

    function formatLangOptionLabel(lang) {
      const KNOWN = {
        'en-US': '영어(미국)', 'en-GB': '영어(영국)',
        'ko-KR': '한국어',
        'ja-JP': '일본어',
        'zh-CN': '중국어(간체)', 'zh-TW': '중국어(번체)',
        'fr-FR': '프랑스어',
        'de-DE': '독일어',
        'es-ES': '스페인어(스페인)', 'es-MX': '스페인어(멕시코)',
        'it-IT': '이탈리아어',
        'ru-RU': '러시아어',
        'vi-VN': '베트남어',
      };
      const label = KNOWN[lang];
      return label ? `${label} (${lang})` : lang;
    }

    // ═══════════════════════════════════════════════════════════
    // 저장된 리스트 조회/렌더
    // ═══════════════════════════════════════════════════════════

    function refreshLists() {
      return conversationStore.getConversationLists().then((lists) => {
        if (destroyed) return;
        renderLists(lists);
      });
    }

    function renderLists(lists) {
      els.listUl.innerHTML = '';

      if (!lists || lists.length === 0) {
        els.listEmptyState.style.display = '';
        els.listUl.style.display = 'none';
        els.selectAllCheckbox.checked = false;
        els.selectAllCheckbox.disabled = true;
        els.deleteSelectedButton.disabled = true;
        return;
      }

      els.listEmptyState.style.display = 'none';
      els.listUl.style.display = '';
      els.selectAllCheckbox.disabled = false;

      for (const list of lists) {
        els.listUl.appendChild(buildListItem(list));
      }

      updateSelectionUI();
    }

    function buildListItem(list) {
      const li = document.createElement('li');
      li.className = 'cm-list-item';
      li.dataset.listId = String(list.id);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'cm-list-checkbox';
      checkbox.dataset.listId = String(list.id);
      checkbox.addEventListener('change', updateSelectionUI);
      li.appendChild(checkbox);

      const info = document.createElement('div');
      info.className = 'cm-list-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'cm-list-name';
      nameEl.textContent = list.name;
      info.appendChild(nameEl);

      const metaEl = document.createElement('span');
      metaEl.className = 'cm-list-meta';
      metaEl.textContent = `${list.count}개 턴 · ${formatLangOptionLabel(list.lang)} · ${formatDateTime(list.createdAt)}`;
      info.appendChild(metaEl);

      li.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'cm-list-item-actions';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'cm-btn cm-btn-secondary';
      loadBtn.textContent = '불러오기';
      loadBtn.addEventListener('click', () => handleLoadClicked(list));
      actions.appendChild(loadBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'cm-btn cm-btn-ghost';
      deleteBtn.textContent = '삭제';
      deleteBtn.addEventListener('click', () => handleDeleteOneClicked(list));
      actions.appendChild(deleteBtn);

      li.appendChild(actions);

      return li;
    }

    function formatDateTime(timestamp) {
      if (!timestamp) return '';
      const d = new Date(timestamp);
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function getCheckboxes() {
      return Array.from(els.listUl.querySelectorAll('.cm-list-checkbox'));
    }

    function getSelectedIds() {
      return getCheckboxes()
        .filter((cb) => cb.checked)
        .map((cb) => Number(cb.dataset.listId));
    }

    function updateSelectionUI() {
      const checkboxes = getCheckboxes();
      const selectedCount = checkboxes.filter((cb) => cb.checked).length;

      els.deleteSelectedButton.disabled = selectedCount === 0;

      if (checkboxes.length === 0) {
        els.selectAllCheckbox.checked = false;
        els.selectAllCheckbox.indeterminate = false;
        return;
      }

      els.selectAllCheckbox.checked = selectedCount === checkboxes.length;
      els.selectAllCheckbox.indeterminate = selectedCount > 0 && selectedCount < checkboxes.length;
    }

    function handleSelectAllChange() {
      const checked = els.selectAllCheckbox.checked;
      getCheckboxes().forEach((cb) => { cb.checked = checked; });
      updateSelectionUI();
    }

    function handleDeleteSelectedClicked() {
      const ids = getSelectedIds();
      if (ids.length === 0) return;

      const confirmed = window.confirm(`선택한 리스트 ${ids.length}개를 삭제할까요? 이 동작은 되돌릴 수 없습니다.`);
      if (!confirmed) return;

      els.deleteSelectedButton.disabled = true;

      conversationStore.deleteConversationLists(ids)
        .then(() => refreshLists())
        .catch((err) => {
          console.error(err);
          window.alert('리스트 삭제 중 오류가 발생했습니다: ' + err.message);
        });
    }

    function handleDeleteOneClicked(list) {
      const confirmed = window.confirm(`"${list.name}" 리스트를 삭제할까요? 이 동작은 되돌릴 수 없습니다.`);
      if (!confirmed) return;

      conversationStore.deleteConversationList(list.id)
        .then(() => refreshLists())
        .catch((err) => {
          console.error(err);
          window.alert('리스트 삭제 중 오류가 발생했습니다: ' + err.message);
        });
    }

    function handleLoadClicked(list) {
      const confirmed = window.confirm(`"${list.name}" 리스트를 현재 활성 회화로 불러올까요?\n(기존 활성 회화는 이 리스트 내용으로 갱신됩니다.)`);
      if (!confirmed) return;

      conversationStore.loadConversationList(list.id)
        .then(({ turns: loadedTurns, lang }) => {
          if (destroyed) return;
          turns = loadedTurns || [];
          autoController.stop();
          if (turns.length === 0) {
            renderEmpty('불러온 리스트에 턴이 없습니다.');
          } else {
            autoController.showCurrent({ speak: false });
          }
          updateNavButtons();
          setStatus(`"${list.name}" (${turns.length}개 턴)를 불러왔습니다.`, 'success');

          // 이 모듈은 언어를 스스로 판단하지 않는다. 리스트의 lang을
          // 상위에 그대로 알려서, activeLang 동기화(다른
          // 탭과의 발음 언어 상태 연동)에 사용할 수 있게 한다.
          if (typeof modeOptions.onListLoaded === 'function') {
            modeOptions.onListLoaded(turns, { id: list.id, name: list.name, lang: lang });
          }
        })
        .catch((err) => {
          console.error(err);
          window.alert('리스트를 불러오는 중 오류가 발생했습니다: ' + err.message);
        });
    }

    /**
     * 마운트 시점에 현재 활성 회화(conversations 스토어)를 조회해
     * 있으면 그대로 이어서 보여준다.
     */
    function loadActiveConversation() {
      conversationStore.getAllTurns().then((loaded) => {
        if (destroyed) return;
        if (!loaded || loaded.length === 0) return;
        turns = loaded;
        autoController.showCurrent({ speak: false });
        setStatus(`${turns.length}개 턴을 불러왔습니다.`, 'success');
        updateNavButtons();
      }).catch((err) => {
        // 활성 회화가 없거나 IndexedDB 접근 실패 시 조용히 빈 상태 유지.
        console.error(err);
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 역할 선택
    // ═══════════════════════════════════════════════════════════

    function getMyRole() {
      return els.roleB.checked ? ROLE_B : ROLE_A;
    }

    function handleRoleChange() {
      // 역할이 바뀌면 현재 턴을 다시 그려서(내 턴/상대 턴 뱃지, 이후 TTS
      // 여부) 즉시 반영한다. 재생 중이었다면 정지 후 다시 그리고 유지
      // 여부는 사용자가 다시 시작을 눌러 판단하게 한다(sentenceMode.js의
      // 방향 전환과 동일하게, 엇갈린 상태가 남지 않도록 정지 후 다시 그림).
      if (turns.length === 0) return;

      const wasPlaying = autoController.isPlaying();
      autoController.stop();
      autoController.showCurrent({ speak: false });
      if (wasPlaying) {
        autoController.start();
      }
    }

    // ═══════════════════════════════════════════════════════════
    // 화자별 노출/대기 시간(초) 입력 처리(숫자 입력 + 슬라이더 병행)
    // ═══════════════════════════════════════════════════════════

    function handleSecondsInput(which, source) {
      const sliderEl = which === 'a' ? els.aSecondsSlider : els.bSecondsSlider;
      const numberEl = which === 'a' ? els.aSecondsNumber : els.bSecondsNumber;

      if (source === 'slider') {
        numberEl.value = sliderEl.value;
      } else {
        // 숫자 입력 중에는 범위를 벗어난 임시값(타이핑 도중)을 강제로
        // 바꾸지 않는다. 실제 계산 시에는 getASeconds/getBSeconds가 clamp한다.
        const n = Number(numberEl.value);
        if (Number.isFinite(n)) {
          sliderEl.value = String(Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, n)));
        }
      }

      // 재생 중이고 아직 이번 턴의 노출 시간이 지나지 않았다면, 현재
      // 턴의 타이머를 새 값으로 다시 건다(발음 종료 대기 상태는 유지).
      autoController.rearmTimer();
    }

    function getASeconds() {
      const v = Number(els.aSecondsNumber.value);
      if (!Number.isFinite(v)) return DEFAULT_A_SECONDS;
      return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, v));
    }

    function getBSeconds() {
      const v = Number(els.bSecondsNumber.value);
      if (!Number.isFinite(v)) return DEFAULT_B_SECONDS;
      return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, v));
    }

    /**
     * A/B 턴 시간 값이 바뀔 때마다 호출된다. options.onSettingsChange가
     * 있으면 현재 값을 모아 넘겨서, main.js가 settings 스토어에
     * 저장하도록 한다(sentenceMode.js의 notifySettingsChange와 동일 패턴).
     */
    function notifySettingsChange() {
      if (typeof modeOptions.onSettingsChange !== 'function') return;
      modeOptions.onSettingsChange({
        turnASeconds: getASeconds(),
        turnBSeconds: getBSeconds(),
      });
    }

    // ═══════════════════════════════════════════════════════════
    // 카드 렌더링(빈 상태) / 내비게이션 / 상태 라인 / 키보드
    // ═══════════════════════════════════════════════════════════

    function renderEmpty(message) {
      els.cardArea.style.display = 'none';
      els.emptyState.style.display = 'block';
      els.emptyState.textContent = message;
    }

    function handleKeydown(event) {
      if (destroyed) return;
      const tag = (event.target && event.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (event.code === 'Space' || event.key === ' ') {
        event.preventDefault();
        autoController.toggle();
      }
    }

    function updateNavButtons() {
      const hasTurns = turns.length > 0;
      const index = autoController.getCurrentIndex();

      els.prevButton.disabled = !hasTurns || index <= 0;
      els.nextButton.disabled = !hasTurns || index >= turns.length - 1;
      els.toggleButton.disabled = !hasTurns;
    }

    function setStatus(message, kind) {
      els.statusLine.textContent = message;
      els.statusLine.classList.toggle('cm-status-error', kind === 'error');
      els.statusLine.classList.toggle('cm-status-success', kind === 'success');
    }

    // ── 스와이프 시각 피드백(선택 사항, 세션 03/04와 동일한 방식) ──
    /**
     * .cm-card-area에서 손가락이 움직이는 동안 카드(els.card)에 살짝
     * translateX를 적용해 "드래그를 따라가는" 느낌을 준다. 실제 스와이프
     * 판정(다음/이전 턴 전환 여부)에는 전혀 관여하지 않으며 오직
     * 표시용이다 — 턴 전환 판정은 touchGesture.attachSwipe의 콜백
     * (cardSwipeHandle)이 전담한다. 여기서 표시가 실패하거나 값이
     * 어긋나도 턴 넘기기 기능 자체에는 영향이 없다.
     */
    function attachCardSwipeVisualFeedback() {
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

      cardSwipeVisualCleanup = function () {
        area.removeEventListener('touchstart', onTouchStart);
        area.removeEventListener('touchmove', onTouchMove);
        area.removeEventListener('touchend', resetCardPosition);
        area.removeEventListener('touchcancel', resetCardPosition);
        card.style.transition = '';
        card.style.transform = '';
      };
    }

    return { destroy };
  }

  function buildMarkup() {
    return `
      <div class="cm-panel">
        <div class="cm-upload-title">회화 파일 업로드</div>
        <div class="cm-upload-row">
          <input type="file" accept=".txt" data-cm="fileInput">
          <label for="cmSaveLangSelect" class="cm-label">발음 언어:</label>
          <select data-cm="saveLangSelect"></select>
          <button type="button" class="cm-btn cm-btn-primary" data-cm="saveButton" disabled>저장</button>
        </div>
        <p class="cm-status-line" data-cm="uploadStatusLine"></p>

        <details class="format-guide">
          <summary>파일 형식 안내</summary>
          <div class="format-guide-body">
            <p class="format-guide-desc">단어장·문장 목록과 달리 <strong>번호가 아니라 "a:" 또는 "b:" 화자 라벨</strong>로 대사를 구분합니다(대소문자 무관). 라벨 줄이 대사, 그 다음 줄이 해석입니다.</p>
            <pre class="format-guide-example"><code>a:Hello, how are you?
안녕, 어떻게 지내?
b:I'm fine, thank you.
난 잘 지내, 고마워.</code></pre>
            <p class="format-guide-note">해석 줄이 없으면 빈 칸으로 저장됩니다. 턴 번호는 파일에 적지 않아도 등장 순서대로 자동으로 매겨집니다.</p>
          </div>
        </details>
      </div>

      <div class="cm-panel">
        <div class="cm-lists-header">
          <span class="cm-lists-title">저장된 회화 리스트</span>
          <div class="cm-lists-actions">
            <label class="cm-select-all">
              <input type="checkbox" data-cm="selectAllCheckbox">전체 선택
            </label>
            <button type="button" class="cm-btn cm-btn-ghost" data-cm="deleteSelectedButton" disabled>선택 삭제</button>
          </div>
        </div>
        <div class="cm-empty-state" data-cm="listEmptyState">아직 저장된 회화 리스트가 없습니다. 파일을 업로드하고 "저장"을 누르면 이곳에 쌓입니다.</div>
        <ul class="cm-lists-ul" data-cm="listUl" style="display:none;"></ul>
      </div>

      <div class="cm-panel">
        <div class="cm-role-row">
          <span class="cm-label">나의 역할</span>
          <label class="cm-radio-label">
            <input type="radio" name="cmRole" data-cm="roleA" checked>
            나는 A
          </label>
          <label class="cm-radio-label">
            <input type="radio" name="cmRole" data-cm="roleB">
            나는 B
          </label>
        </div>

        <div class="cm-timing-row">
          <div class="cm-timing-group">
            <label class="cm-label" for="cmASecondsNumber">A 턴 노출/대기 시간(초)</label>
            <input type="range" data-cm="aSecondsSlider" class="cm-timing-slider">
            <input type="number" data-cm="aSecondsNumber" class="cm-timing-number">
          </div>
          <div class="cm-timing-group">
            <label class="cm-label" for="cmBSecondsNumber">B 턴 노출/대기 시간(초)</label>
            <input type="range" data-cm="bSecondsSlider" class="cm-timing-slider">
            <input type="number" data-cm="bSecondsNumber" class="cm-timing-number">
          </div>
        </div>

        <p class="cm-status-line" data-cm="statusLine">회화 파일을 업로드하거나 저장된 리스트를 불러오세요.</p>
      </div>

      <div class="cm-panel cm-stage">
        <div class="cm-empty-state" data-cm="emptyState">회화 파일을 업로드하거나 저장된 리스트를 불러오세요.</div>

        <div class="cm-card-area" data-cm="cardArea" style="display: none;">
          <div class="cm-card-progress" data-cm="cardProgress"></div>
          <div class="cm-card">
            <div class="cm-speaker-badge" data-cm="speakerBadge"></div>
            <div class="cm-card-line" data-cm="cardLine"></div>
            <div class="cm-divider"></div>
            <div class="cm-card-translation" data-cm="cardTranslation"></div>
          </div>

          <div class="cm-nav-row">
            <button type="button" class="cm-btn cm-btn-ghost" data-cm="prevButton">◀ 이전</button>
            <button type="button" class="cm-btn cm-btn-primary cm-toggle-btn" data-cm="toggleButton">시작</button>
            <button type="button" class="cm-btn cm-btn-ghost" data-cm="nextButton">다음 ▶</button>
          </div>
        </div>
      </div>

      <p class="cm-hint">스페이스바: 시작/정지 토글 · 이전/다음은 버튼으로만 이동합니다. 내 역할 턴에서는 TTS가 침묵하고, 상대 역할 턴만 자동으로 읽어줍니다.</p>
    `;
  }

  return { mount };
});
