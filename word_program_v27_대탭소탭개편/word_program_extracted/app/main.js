/**
 * app/main.js
 *
 * 앱 전체의 진입점 겸 오케스트레이터.
 * 단어 목록/업로드 화면을 직접 다루고, 나머지 모드(깜박이/퀴즈/문장/
 * 회화/단어편집)는 각 modules/* 를 컨테이너에 마운트하는 방식으로
 * 조립한다. core(wordStore 등)와 각 modules/*는 서로를 직접 참조하지
 * 않고 이 파일을 통해서만 연결된다(아키텍처 원칙).
 *
 * ── 화면 구조 ────────────────────────────────────────────────
 * 상단 탭 네비게이션(단어 목록·업로드 / 깜박이 모드 / 퀴즈 모드 /
 * 문장 모드 / 회화 모드)으로 모드를 전환한다. 모든 탭은 동일한 레벨의
 * 화면이며, 결과 화면은 별도 탭 없이 퀴즈 탭 안에서 퀴즈 종료 시
 * 자동 전환된다. 단어 편집 화면(wordEditor)은 탭이 아니라 별도
 * 오버레이 화면으로 열고 닫는다.
 *
 * ── "현재 필터에 해당하는 단어만" 옵션 ──────────────────────────
 * 깜박이/퀴즈 탭 각각에 체크박스를 두고, 켜져 있으면 단어 목록
 * 탭에서 선택된 필터(미테스트/별표/안정권)를 해당 모듈이 사용할
 * getWords(범위) 함수에 함께 적용한다(범위 지정 + 필터 지정을 함께
 * 사용 가능하도록). 이 함수는 wordStore.getWordsWithStatus + 범위
 * 좁히기 조합으로 구현되며, main.js가 필터 로직을 알고 있는 유일한
 * 곳이다(flashcard/quiz는 "범위→단어배열" 함수라는 계약만 알 뿐
 * 필터 자체는 모른다 — 모듈 독립성 유지).
 *
 * ── 전역 설정 패널 ──────────────────────────────────────────────
 * 재생속도/자동재생(깜박이), 문제 수/출제순서/출제방식/정답표시여부/
 * 문제 전환 대기(퀴즈), 노출·대조 시간(문장 모드), A/B 턴 시간(회화
 * 모드)을 한 곳에서 확인·수정할 수 있는 모달이다. DOM 참조·열기/닫기/
 * 값 읽기/저장은 app/controllers/settingsPanelController.js가 전담하며,
 * settings 스토어에 저장되어 다음 방문 시에도 유지된다. 각 모듈은 mount
 * 시 이 값을 initialSettings로 받고, 값이 바뀌면 onSettingsChange로
 * 알려와 즉시 저장한다. main.js는 settingsPanelInstance가 소유한 현재
 * 설정값을 각 모듈에 전달하는 조립자 역할만 한다.
 *
 * ── 다국어 TTS(activeLang) 연동 ──────────────────────────────────
 * "현재 학습 언어"는 settingsPanelInstance.getSettings().activeLang
 * 하나로 관리되며, 리스트를 저장/불러올 때 setActiveLang이 갱신하고
 * 열려 있는 탭을 다시 마운트해 즉시 반영한다. 드롭다운 UI 자체는
 * app/controllers/langSelectController.js가 담당한다.
 *
 * ── 전체 흐름 ────────────────────────────────────────────────────
 * 파일 업로드 → 파싱 → 저장 → (단어 목록 탭에서) 범위/필터 선택 →
 * 깜박이 또는 퀴즈 탭으로 이동해 실행 → (퀴즈의 경우) 결과 화면 →
 * 학습 상태 갱신 → 단어 목록 탭의 필터에 반영, 전체가 하나의 앱
 * 안에서 매끄럽게 연결된다.
 *
 * ── 분리된 컨트롤러 ──────────────────────────────────────────────
 * 이 파일에서 응집도 높은 일부 기능은 app/controllers/*로 분리했다.
 * - tableRenderer.js: 단어 표의 셀 생성/페이지네이션/정답오답 검증
 * - langSelectController.js: 저장 화면 언어 선택 드롭다운
 * - settingsPanelController.js: 전역 설정 모달 DOM/열기·닫기/저장·로드
 * - tabNavController.js: 탭 버튼 활성 클래스/패널 표시 전환
 *   (탭 전환 시 모듈 mount/unmount는 main.js에 남음)
 * main.js는 이 컨트롤러들을 생성하고 필요한 의존성을 주입하는
 * 조립자(orchestrator) 역할을 한다.
 */

(function () {
  'use strict';

  // ── 단어 목록/업로드 화면(mainView) 관련 엘리먼트 ──
  const fileInput = document.getElementById('fileInput');
  const saveButton = document.getElementById('saveButton');
  // 다국어 TTS: 저장 시 발음 언어를 선택하는 드롭다운.
  const saveLangSelect = document.getElementById('saveLangSelect');
  const statusLine = document.getElementById('statusLine');
  const wordCountEl = document.getElementById('wordCount');
  const emptyState = document.getElementById('emptyState');
  const wordTable = document.getElementById('wordTable');
  const wordTableBody = document.getElementById('wordTableBody');
  const dbBadge = document.getElementById('dbBadge');
  const dbBadgeText = document.getElementById('dbBadgeText');
  const rangeStartInput = document.getElementById('rangeStart');
  const rangeEndInput = document.getElementById('rangeEnd');
  const rangeApplyButton = document.getElementById('rangeApplyButton');
  const rangeResetButton = document.getElementById('rangeResetButton');
  const filterUntestedCheckbox = document.getElementById('filterUntested');
  const filterStarredCheckbox = document.getElementById('filterStarred');
  const filterStableCheckbox = document.getElementById('filterStable');
  const filterClearButton = document.getElementById('filterClearButton');

  // 단어 목록 탭 상태 요약 카드(표 대신 기본으로 보여주는 가벼운 요약).
  const summaryCountTotal = document.getElementById('summaryCountTotal');
  const summaryCountUntested = document.getElementById('summaryCountUntested');
  const summaryCountStarred = document.getElementById('summaryCountStarred');
  const summaryCountBigStarred = document.getElementById('summaryCountBigStarred');
  const summaryCountStable = document.getElementById('summaryCountStable');
  const wordTableDetails = document.getElementById('wordTableDetails');
  const wordTablePager = document.getElementById('wordTablePager');
  const wordTablePagerInfo = document.getElementById('wordTablePagerInfo');
  const wordTablePagerPrev = document.getElementById('wordTablePagerPrev');
  const wordTablePagerNext = document.getElementById('wordTablePagerNext');

  // ── 저장된 리스트(wordLists) 패널 — modules/wordLists로 분리됨 ──
  const wordListsContainer = document.getElementById('wordListsContainer');
  let wordListsInstance = null;

  // ── 문장 모드(정식 탭으로 통합됨) ──
  // modules/sentenceLists는 core/sentenceStore.js만 참조하는 완전히 독립된
  // 모듈이며, 아래 단어 관련 초기화 로직과는 별개로 동작한다. 깜박이/퀴즈
  // 탭과 동일하게 "문장 모드" 탭 진입 시에만 지연 마운트된다
  // (mountSentence/unmountSentence 참고).
  const sentenceListsContainer = document.getElementById('sentenceListsContainer');
  let sentenceListsInstance = null;

  // ── 문장 학습 모드: 입눈(자동재생)+타이핑 방식 화면 ──
  // modules/sentenceMode 역시 core/sentenceStore.js, core/ttsEngine.js만
  // 참조하는 완전히 독립된 모듈이다.
  const sentenceModeContainer = document.getElementById('sentenceModeContainer');
  let sentenceModeInstance = null;

  // ── 회화 모드(정식 탭으로 통합됨) ──
  // modules/conversationMode는 core/conversationStore.js, core/conversationParser.js,
  // core/ttsEngine.js, 같은 모듈 폴더의 conversationAutoMode.js만 참조하는
  // 완전히 독립된 모듈이다(업로드/저장/목록/역할선택/시간설정/재생을 모두
  // 이 모듈 하나가 담당한다).
  const conversationModeContainer = document.getElementById('conversationModeContainer');
  let conversationModeInstance = null;

  // ── 통계 모달(modules/stats) ──
  // core/wordStore.js만 참조하는 완전히 독립된 모듈이다(quiz/flashcard 등
  // 다른 모듈의 내부 코드를 참조하지 않음). 예전에는 탭이었으나 상단 탭이
  // 많아 복잡해 보인다는 이유로 아이콘 버튼 + 모달(전역 설정과 동일한
  // .settings-overlay 패턴)로 옮겼다. 모달을 열 때마다 refresh()를 호출해
  // 최신 학습 상태를 반영한다.
  const statsContainer = document.getElementById('statsContainer');
  let statsInstance = null;
  const statsOpenButton = document.getElementById('statsOpenButton');
  const statsCloseButton = document.getElementById('statsCloseButton');
  const statsOverlay = document.getElementById('statsOverlay');

  // ── 단어 추가/편집 화면(modules/wordEditor) ──
  const wordEditorView = document.getElementById('wordEditorView');
  const wordEditorContainer = document.getElementById('wordEditorContainer');
  const mainViewEl = document.getElementById('mainView');
  let wordEditorInstance = null;

  // ── 헤더 메모 입력란: 기존 고정 안내 문구 자리를 대체하는 자유 입력란.
  //    값은 core/wordStore.getSetting/saveSetting을 통해 settings 스토어
  //    (key: "headerNote")에 저장되며, 새로고침 후에도 유지된다. ──
  const headerNoteEl = document.getElementById('headerNote');
  const HEADER_NOTE_SETTING_KEY = 'headerNote';

  // ── 상단 탭 네비게이션 엘리먼트 ── DOM/전환 로직은 tabNavController.js 참고.

  // ── 다크모드 토글 버튼 ──
  const themeToggleButton = document.getElementById('themeToggleButton');
  const THEME_SETTING_KEY = 'theme'; // 'light' | 'dark'

  const flashcardContainer = document.getElementById('flashcardContainer');
  const quizContainer = document.getElementById('quizContainer');
  const resultContainer = document.getElementById('resultContainer');

  // "현재 필터 사용" 단일 체크박스 대신, 깜박이/퀴즈 탭 각각에 미테스트/
  // 별표/안정권 체크박스를 직접 내장한다(단어 목록 탭에 가지 않아도
  // 그 자리에서 바로 필터를 선택할 수 있도록).
  const flashcardFilterCheckboxes = {
    untested: document.getElementById('flashcardFilterUntested'),
    starred: document.getElementById('flashcardFilterStarred'),
    stable: document.getElementById('flashcardFilterStable'),
  };
  const flashcardFilterClearButton = document.getElementById('flashcardFilterClearButton');

  const quizFilterCheckboxes = {
    untested: document.getElementById('quizFilterUntested'),
    starred: document.getElementById('quizFilterStarred'),
    stable: document.getElementById('quizFilterStable'),
  };
  const quizFilterClearButton = document.getElementById('quizFilterClearButton');

  // ── 전역 설정 패널 엘리먼트 ── DOM/열기·닫기/저장 로직은 settingsPanelController.js 참고.

  // 현재 마운트된 각 모드 인스턴스(destroy 가능한 핸들). 닫혀 있으면 null.
  let flashcardInstance = null;
  let quizInstance = null;
  let resultInstance = null;

  // 현재 활성 탭은 tabNavController.js가 소유(조회: getActiveContentTab()).

  // 방금 파일에서 새로 파싱한 결과(아직 저장 전일 수 있음).
  let pendingParsedWords = null;
  // 방금 선택한 파일명(저장 시 wordLists 항목의 기본 이름으로 사용).
  let pendingFileName = null;

  // 현재 표에 보여줄 "기본 범위"를 기억해둔다.
  let currentViewRange = { mode: 'all', start: null, end: null };

  // ── 전역 설정 기본값 및 settings 스토어 키 ──
  const SETTINGS_DEFAULTS = {
    flashcardIntervalSeconds: 2.5,
    flashcardAutoplay: true,
    quizCount: null,
    quizOrder: 'sequential',
    quizDirection: 'wordToMeaning',
    quizRevealOnWrong: true,
    quizDelaySeconds: 1.5,
    quizType: 'multipleChoice',
    quizOxRatio: 50,
    quizOxDifficulty: 'easy',

    // 문장 모드 설정 기본값
    sentenceStageOneSeconds: 4,
    sentenceStageTwoSeconds: 4,
    sentenceCompareSeconds: 3,
    sentenceAdvanceMode: 'auto',

    // 회화 모드 설정 기본값. conversationMode.js 내부의
    // DEFAULT_A_SECONDS/DEFAULT_B_SECONDS와 반드시 일치시킨다(4.0초).
    conversationTurnASeconds: 4.0,
    conversationTurnBSeconds: 4.0,

    // 다국어 TTS: 현재 학습 중인 리스트의 발음 언어. 리스트를 저장/불러올
    // 때마다 그 리스트의 lang으로 갱신되고, flashcard/quiz/result/
    // sentenceMode에 그대로 전달된다.
    activeLang: wordStore.DEFAULT_LANG,
  };

  function init() {
    fileInput.addEventListener('change', handleFileSelected);
    saveButton.addEventListener('click', handleSaveClicked);
    rangeApplyButton.addEventListener('click', handleRangeApply);
    rangeResetButton.addEventListener('click', handleRangeReset);

    filterUntestedCheckbox.addEventListener('change', refreshTableView);
    filterStarredCheckbox.addEventListener('change', refreshTableView);
    filterStableCheckbox.addEventListener('change', refreshTableView);
    filterClearButton.addEventListener('click', handleFilterClear);
    // 표는 <details>가 펼쳐질 때만 그리면 된다(닫힌 상태에서 필터를 바꿔도
    // 무거운 렌더링을 미리 할 필요가 없다). 펼쳐지는 순간 최신 상태로 그린다.
    wordTableDetails.addEventListener('toggle', () => {
      if (wordTableDetails.open) refreshTableView();
    });

    // 표 페이지 이동 버튼. tableRendererInstance가 기억해둔 현재 단어
    // 목록을 다시 조회하지 않고 그대로 재사용해 페이지만 바꿔 그린다.
    wordTablePagerPrev.addEventListener('click', () => {
      renderTable(tableRendererInstance.getCurrentWords(), tableRendererInstance.getCurrentPage() - 1);
    });
    wordTablePagerNext.addEventListener('click', () => {
      renderTable(tableRendererInstance.getCurrentWords(), tableRendererInstance.getCurrentPage() + 1);
    });

    // 저장된 리스트 패널은 modules/wordLists가 자체적으로 이벤트를
    // 바인딩한다(mountWordLists에서 마운트, 아래 init 하단 참고).

    // 탭 전환 버튼 바인딩: tabNavController.js가 자체 수행(파일 하단
    // wordGroupTabNavInstance/sentenceGroupTabNavInstance), 대탭 전환은
    // switchMainGroup()이 직접 처리(파일 하단).

    // 다크모드 토글
    themeToggleButton.addEventListener('click', handleThemeToggleClicked);

    // 깜박이/퀴즈 탭에 내장된 필터 체크박스 — 켜고 끌 때마다 해당
    // 탭을 다시 마운트해 반영한다(단어 목록 탭에 갈 필요 없이 그 자리에서 바로 적용).
    Object.values(flashcardFilterCheckboxes).forEach((cb) => {
      cb.addEventListener('change', () => {
        if (getActiveContentTab() === 'flashcard') mountFlashcard();
      });
    });
    flashcardFilterClearButton.addEventListener('click', () => {
      Object.values(flashcardFilterCheckboxes).forEach((cb) => { cb.checked = false; });
      if (getActiveContentTab() === 'flashcard') mountFlashcard();
    });

    Object.values(quizFilterCheckboxes).forEach((cb) => {
      cb.addEventListener('change', () => {
        if (getActiveContentTab() === 'quiz') mountQuiz();
      });
    });
    quizFilterClearButton.addEventListener('click', () => {
      Object.values(quizFilterCheckboxes).forEach((cb) => { cb.checked = false; });
      if (getActiveContentTab() === 'quiz') mountQuiz();
    });

    // 설정 패널 열기/닫기·입력 이벤트 바인딩: settingsPanelController.js가 자체 수행(파일 하단 settingsPanelInstance).

    // 헤더 메모 입력란: 포커스를 벗어나면 저장. Enter는 줄바꿈 대신
    // 저장 + blur로 처리해 한 줄 메모로 유지한다.
    // 포커스가 들어올 때는 기존 문구 전체를 선택 상태로 만들어, 새로
    // 문구를 쓰고 싶을 때 지우지 않고 바로 타이핑해서 덮어쓸 수 있게 한다.
    headerNoteEl.addEventListener('focus', handleHeaderNoteFocus);
    headerNoteEl.addEventListener('blur', handleHeaderNoteCommit);
    headerNoteEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        headerNoteEl.blur();
      }
    });

    // 저장된 리스트 패널 마운트(내부적으로 최초 refresh까지 수행).
    mountWordLists();

    // 다국어 TTS: 저장 시 언어 선택 드롭다운을 브라우저가 가진 실제 음성
    // 목록으로 채운다. 목록이 비동기로 늦게 채워지는 브라우저를 위해
    // voiceschanged도 함께 구독한다(langSelectController 내부에서 처리).
    initSaveLangSelect();

    // 문장 모드(sentenceLists/sentenceMode)는 페이지 로드 시 무조건
    // 마운트하지 않는다. 깜박이/퀴즈 탭과 동일하게 "문장 모드" 탭에
    // 처음 진입할 때 tabNavController의 onTabChange(handleTabChange)가
    // mountSentence()를 호출해 지연 마운트한다.

    // 페이지 로드 시 기존에 저장된 데이터 + 전역 설정을 함께 불러온다.
    Promise.all([
      loadAndRenderAll(),
      settingsPanelInstance.load(),
      loadHeaderNote(),
      loadTheme(),
    ]).then(() => {
      setDbBadge(true, 'DB 연결됨');
    }).catch((err) => {
      console.error(err);
      setDbBadge(false, 'DB 연결 실패');
      setStatus('IndexedDB를 여는 중 오류가 발생했습니다: ' + err.message, true);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 다국어 TTS — 언어 선택/현재 언어 관리
  // ═══════════════════════════════════════════════════════════
  //
  // "언어"는 이 파일(app/main.js)만 아는 개념이다. flashcard/quiz/result/
  // sentenceMode/wordLists는 언어를 스스로 판단하지 않고, 이 파일이 넘겨주는
  // lang 값을 (있으면) ttsEngine.speak 호출에 그대로 얹기만 한다.
  //
  // 드롭다운 옵션을 채우는 실제 로직(브라우저 음성 목록 조회, 중복 제거,
  // 라벨 포맷)은 app/controllers/langSelectController.js가 전담한다.
  // 이 파일은 "현재 학습 언어가 바뀌면 어떤 탭들을 다시 마운트해야
  // 하는지"만 안다(setActiveLang) — 그건 여러 모듈을 조립하는
  // main.js만의 책임이라 컨트롤러로 옮기지 않았다.
  const langSelectInstance = langSelectController.createLangSelectController({
    selectEl: saveLangSelect,
    ttsEngine,
    defaultLang: wordStore.DEFAULT_LANG,
    getPreferredLang: () => settingsPanelInstance.getSettings().activeLang,
  });

  /**
   * 저장 화면의 언어 선택 드롭다운을 초기화한다(페이지 로드 시 1회 호출).
   */
  function initSaveLangSelect() {
    langSelectInstance.init();
  }

  /**
   * "현재 학습 언어"를 바꾸고 settings 스토어에 저장한다. 리스트를
   * 저장하거나 불러올 때 호출된다. 이미 열려 있는 flashcard/quiz/sentence
   * 탭이 있으면 새 언어가 바로 반영되도록 다시 마운트한다.
   *
   * @param {string} lang
   */
  function setActiveLang(lang) {
    if (!lang || lang === settingsPanelInstance.getSettings().activeLang) return;
    settingsPanelInstance.setSetting('activeLang', lang);
    settingsPanelInstance.savePartial({ activeLang: lang });

    // 드롭다운에 해당 언어 옵션이 아직 없을 수 있다(예: 브라우저가 그 사이
    // 음성 목록을 바꿨거나, 리스트를 다른 기기에서 저장한 언어일 때).
    // value 대입이 조용히 무시되는 것을 막기 위해 없으면 옵션을 만들어준다.
    if (saveLangSelect) {
      const hasOption = Array.from(saveLangSelect.options).some((o) => o.value === lang);
      if (!hasOption) {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = langSelectController.formatLangOptionLabel(lang);
        saveLangSelect.appendChild(opt);
      }
      saveLangSelect.value = lang;
    }

    if (getActiveContentTab() === 'flashcard') mountFlashcard();
    if (getActiveContentTab() === 'quiz') mountQuiz();
    if (getActiveContentTab() === 'sentence') remountSentenceMode();
    if (getActiveContentTab() === 'conversation') remountConversationMode();
  }

  // ═══════════════════════════════════════════════════════════
  // 저장된 리스트(wordLists) 패널 마운트
  // ═══════════════════════════════════════════════════════════

  /**
   * modules/wordLists를 wordListsContainer에 마운트한다. "불러오기"로
   * 활성 단어장이 갱신되면 onListLoaded 콜백을 통해 단어 목록 탭의
   * 범위를 초기화하고 현재 뷰를 새로고침한다.
   */
  function mountWordLists() {
    wordListsInstance = wordListsModule.mount(wordListsContainer, {
      onListLoaded: (words, list) => {
        setStatus(`"${list.name}" (${words.length}개 단어)를 현재 단어장으로 불러왔습니다.`, 'success');
        rangeStartInput.value = '';
        rangeEndInput.value = '';
        currentViewRange = { mode: 'all', start: null, end: null };
        // 다국어 TTS: 불러온 리스트의 언어로 "현재 학습 언어"를 맞춘다.
        // (list.lang은 wordStore.getWordLists/loadWordList가 채워준 값을
        // wordLists 모듈이 그대로 전달해준 것 — 이 파일은 language 정책을
        // 몰라도 되고, 그냥 받은 값을 반영만 한다.)
        if (list && list.lang) {
          setActiveLang(list.lang);
        }
        loadAndRenderAll();
      },
      // [편집]/[+ 새 단어 추가] 버튼 클릭 시 편집 화면을 연다.
      // list가 null이면 "신규 추가" 모드, 있으면 해당 리스트를 불러와 편집 모드로 연다.
      onEditRequested: (list) => {
        openWordEditor(list);
      },
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 문장 모드 탭 마운트/해제 (sentenceLists + sentenceMode)
  // ═══════════════════════════════════════════════════════════

  /**
   * 문장 모드 탭에 처음 진입할 때 호출된다. modules/sentenceLists와
   * modules/sentenceMode를 각각의 컨테이너에 마운트한다. 기존
   * mountFlashcard/mountQuiz와 동일한 지연 마운트 패턴을 따른다.
   *
   * - sentenceLists: 업로드→파싱→저장까지 자체적으로 완결하며,
   *   core/sentenceStore.js만 참조하는 완전히 독립된 모듈이다.
   * - sentenceMode: 문장을 실제로 보여주는 학습 화면이며,
   *   core/sentenceStore.js, core/ttsEngine.js만 참조하는
   *   완전히 독립된 모듈이다(다른 모듈 참조 금지).
   */
  function mountSentence() {
    if (sentenceListsContainer && !sentenceListsInstance) {
      sentenceListsInstance = sentenceListsModule.mount(sentenceListsContainer, {
        onListLoaded: (sentences, list) => {
          // 문장 학습 모드 화면(sentenceMode)이 sentenceStore에서 직접
          // 범위를 지정해 불러오는 방식이라, 여기서는 콘솔 로그만 남긴다
          // (사용자가 문장 학습 모드에서 직접 "불러오기"를 누르면 최신
          // 저장된 문장을 가져간다).
          console.log(`[sentenceLists] "${list.name}" 불러옴 (${sentences.length}개 문장)`);
        },
      });
    }

    if (sentenceModeContainer && !sentenceModeInstance) {
      sentenceModeInstance = mountSentenceModeInstance();
    }
  }

  /**
   * sentenceMode 모듈을 현재 settingsPanelInstance의 설정값으로 마운트한다.
   * initialSettings로 저장된 노출 시간/대조 화면 유지 시간/자동-수동 전환
   * 값을 전달하고, 사용자가 화면 안에서 값을 바꾸면 onSettingsChange를 통해
   * settingsPanelInstance의 설정값 갱신 + savePartial로 영구 저장한다
   * (flashcard 마운트 코드와 동일한 패턴).
   */
  function mountSentenceModeInstance() {
    return sentenceModeModule.mount(sentenceModeContainer, {
      // 다국어 TTS: 문장모드는 자체 리스트에 언어를 저장하지 않고, 현재
      // 학습 언어(activeLang, 단어 리스트 저장/불러오기로 결정됨)를 그대로
      // 공유해서 쓴다.
      lang: settingsPanelInstance.getSettings().activeLang,
      initialSettings: {
        stageOneSeconds: settingsPanelInstance.getSettings().sentenceStageOneSeconds,
        stageTwoSeconds: settingsPanelInstance.getSettings().sentenceStageTwoSeconds,
        compareSeconds: settingsPanelInstance.getSettings().sentenceCompareSeconds,
        advanceMode: settingsPanelInstance.getSettings().sentenceAdvanceMode,
      },
      onSettingsChange: (settings) => {
        settingsPanelInstance.getSettings().sentenceStageOneSeconds = settings.stageOneSeconds;
        settingsPanelInstance.getSettings().sentenceStageTwoSeconds = settings.stageTwoSeconds;
        settingsPanelInstance.getSettings().sentenceCompareSeconds = settings.compareSeconds;
        settingsPanelInstance.getSettings().sentenceAdvanceMode = settings.advanceMode;
        settingsPanelInstance.savePartial({
          sentenceStageOneSeconds: settings.stageOneSeconds,
          sentenceStageTwoSeconds: settings.stageTwoSeconds,
          sentenceCompareSeconds: settings.compareSeconds,
          sentenceAdvanceMode: settings.advanceMode,
        });
        settingsPanelInstance.syncPanelFromCurrent();
      },
    });
  }

  /**
   * 전역 설정 패널에서 문장 모드 설정값이 바뀌었을 때, 문장 모드 탭이
   * 열려 있다면 학습 화면(sentenceMode)만 다시 마운트해 새 설정을 즉시
   * 반영한다. sentenceLists(불러오기 패널)는 건드리지 않는다 — 사용자가
   * 이미 범위를 지정해둔 상태를 유지하기 위해서다.
   */
  function remountSentenceMode() {
    if (!sentenceModeContainer) return;
    if (sentenceModeInstance) {
      sentenceModeInstance.destroy();
      sentenceModeInstance = null;
    }
    sentenceModeContainer.innerHTML = '';
    sentenceModeInstance = mountSentenceModeInstance();
  }

  /**
   * 문장 모드 탭을 벗어날 때 호출된다. sentenceLists/sentenceMode 각각의
   * destroy()를 호출해 정리한다(기존 unmountFlashcard/unmountQuiz와
   * 동일한 패턴).
   */
  function unmountSentence() {
    if (sentenceListsInstance) {
      sentenceListsInstance.destroy();
      sentenceListsInstance = null;
    }
    if (sentenceListsContainer) sentenceListsContainer.innerHTML = '';

    if (sentenceModeInstance) {
      sentenceModeInstance.destroy();
      sentenceModeInstance = null;
    }
    if (sentenceModeContainer) sentenceModeContainer.innerHTML = '';
  }

  // ═══════════════════════════════════════════════════════════
  // 회화 모드 탭 마운트/해제 (modules/conversationMode)
  // ═══════════════════════════════════════════════════════════

  /**
   * 회화 모드 탭에 처음 진입할 때 호출된다. modules/conversationMode는
   * 업로드/저장/목록/역할선택/시간설정/재생을 모두 한 모듈이 담당하므로,
   * flashcard/quiz와 동일한 지연 마운트 패턴을 그대로 따르되 컨테이너는
   * 하나뿐이다.
   */
  function mountConversation() {
    if (conversationModeInstance) return;
    conversationModeInstance = mountConversationModeInstance();
  }

  /**
   * conversationMode 모듈을 현재 settingsPanelInstance의 설정값으로 마운트한다.
   * initialSettings로 A/B 턴 시간을 전달하고, 사용자가 화면 안(또는 전역
   * 설정 패널)에서 값을 바꾸면 onSettingsChange를 통해 설정값
   * 갱신 + settingsPanelInstance.savePartial로 영구 저장한다(mountSentenceModeInstance와
   * 동일 패턴).
   * 다국어 TTS: 리스트를 "불러오기"하면 onListLoaded(turns, list)로
   * list.lang을 받아 setActiveLang을 호출한다(wordLists/sentenceLists의
   * onListLoaded와 동일 패턴).
   */
  function mountConversationModeInstance() {
    return conversationModeModule.mount(conversationModeContainer, {
      lang: settingsPanelInstance.getSettings().activeLang,
      initialSettings: {
        turnASeconds: settingsPanelInstance.getSettings().conversationTurnASeconds,
        turnBSeconds: settingsPanelInstance.getSettings().conversationTurnBSeconds,
      },
      onSettingsChange: (settings) => {
        settingsPanelInstance.getSettings().conversationTurnASeconds = settings.turnASeconds;
        settingsPanelInstance.getSettings().conversationTurnBSeconds = settings.turnBSeconds;
        settingsPanelInstance.savePartial({
          conversationTurnASeconds: settings.turnASeconds,
          conversationTurnBSeconds: settings.turnBSeconds,
        });
        settingsPanelInstance.syncPanelFromCurrent();
      },
      onListLoaded: (turns, list) => {
        setStatus(`"${list.name}" (${turns.length}개 턴)를 현재 회화로 불러왔습니다.`, 'success');
        if (list && list.lang) {
          setActiveLang(list.lang);
        }
      },
    });
  }

  /**
   * 전역 설정 패널에서 회화 모드 A/B 시간 설정값이 바뀌었을 때, 회화 모드
   * 탭이 열려 있다면 다시 마운트해 새 설정을 즉시 반영한다
   * (remountSentenceMode와 동일 패턴).
   */
  function remountConversationMode() {
    if (!conversationModeContainer) return;
    if (conversationModeInstance) {
      conversationModeInstance.destroy();
      conversationModeInstance = null;
    }
    conversationModeContainer.innerHTML = '';
    conversationModeInstance = mountConversationModeInstance();
  }

  /**
   * 회화 모드 탭을 벗어날 때 호출된다(unmountSentence와 동일 패턴).
   */
  function unmountConversation() {
    if (conversationModeInstance) {
      conversationModeInstance.destroy();
      conversationModeInstance = null;
    }
    if (conversationModeContainer) conversationModeContainer.innerHTML = '';
  }

  // ═══════════════════════════════════════════════════════════
  // 단어 추가/편집 화면(wordEditor) 열기/닫기
  // ═══════════════════════════════════════════════════════════

  /**
   * 단어 추가/편집 화면을 연다. mainView를 숨기고 wordEditorView를 보여준
   * 뒤, modules/wordEditor를 마운트한다.
   *
   * @param {{id:number, name:string}|null} list - 편집할 리스트(메타데이터).
   *        null이면 "신규 추가" 모드로 빈 화면에서 시작한다.
   */
  function openWordEditor(list) {
    const proceed = () => {
      mainViewEl.style.display = 'none';
      wordEditorView.style.display = '';

      if (wordEditorInstance) {
        wordEditorInstance.destroy();
        wordEditorInstance = null;
      }

      wordEditorInstance = wordEditorModule.mount(wordEditorContainer, {
        list: list, // { id, name, createdAt, words } 형태 또는 null
        onClose: closeWordEditor,
        onSaved: () => {
          // 저장된 리스트 패널과 단어 목록 탭을 최신 상태로 갱신한다.
          if (wordListsInstance) wordListsInstance.refresh();
        },
      });
    };

    if (!list) {
      proceed();
      return;
    }

    // list는 wordLists 패널에서 넘어온 메타데이터(words 미포함)이므로
    // 편집에 필요한 words 원본 배열까지 포함해 다시 조회한다.
    wordStore.getWordListById(list.id).then((full) => {
      if (!full) {
        setStatus('리스트를 불러오는 중 오류가 발생했습니다: 리스트를 찾을 수 없습니다.', 'error');
        return;
      }
      list = full;
      proceed();
    }).catch((err) => {
      console.error(err);
      setStatus('리스트를 불러오는 중 오류가 발생했습니다: ' + err.message, 'error');
    });
  }

  /**
   * 단어 추가/편집 화면을 닫고 mainView로 복귀한다.
   * (편집 화면의 저장은 저장된 리스트 자체만 갱신하고 활성 단어장(words
   * 스토어)은 건드리지 않으므로, 방금 편집한 내용을 메인 표에서 보려면
   * 저장된 리스트 패널에서 [불러오기]를 눌러야 한다. 여기서는 학습 상태
   * 등 다른 값이 바뀌었을 가능성에 대비해 가볍게 새로고침만 한다.)
   */
  function closeWordEditor() {
    if (wordEditorInstance) {
      wordEditorInstance.destroy();
      wordEditorInstance = null;
    }
    wordEditorContainer.innerHTML = '';
    wordEditorView.style.display = 'none';
    mainViewEl.style.display = '';

    // 편집 중 활성 단어장(words 스토어)이 바뀌었을 수 있으므로 새로고침.
    loadAndRenderAll();
  }

  // ═══════════════════════════════════════════════════════════
  // 탭 전환
  // ═══════════════════════════════════════════════════════════

  /**
   * tabNavController의 onTabChange 콜백. 탭 UI 전환은 컨트롤러가 이미
   * 마쳤으므로, 여기서는 이전 탭 모듈 destroy + 새 탭 모듈 mount만 한다.
   *
   * @param {'main'|'flashcard'|'quiz'|'sentence'|'conversation'} tab
   * @param {string} previousTab
   */
  /**
   * previousTab에 해당하는 모듈이 mount되어 있다면 unmount한다.
   * handleTabChange 본체와 switchMainGroup(대탭 전환 시 다른 그룹의
   * 콘텐츠 탭을 정리할 때)이 함께 사용하는 공용 헬퍼로 분리했다.
   */
  function unmountTabModule(previousTab) {
    if (previousTab === 'flashcard') {
      unmountFlashcard();
    } else if (previousTab === 'quiz') {
      unmountQuiz();
    } else if (previousTab === 'sentence') {
      unmountSentence();
    } else if (previousTab === 'conversation') {
      unmountConversation();
    }
  }

  function handleTabChange(tab, previousTab) {
    // 이전 탭 정리
    unmountTabModule(previousTab);

    // 깜박이/퀴즈/문장/회화 탭은 학습 화면이 길게 나올 수 있어 넓게
    // 보이도록 컨테이너를 확장한다(카드/문장/표가 좁으면 잘려 보이므로).
    document.body.classList.toggle(
      'wide-tab-active',
      tab === 'flashcard' || tab === 'quiz' || tab === 'sentence' || tab === 'conversation'
    );

    if (tab === 'flashcard') {
      mountFlashcard();
    } else if (tab === 'quiz') {
      mountQuiz();
    } else if (tab === 'sentence') {
      mountSentence();
    } else if (tab === 'conversation') {
      mountConversation();
    } else {
      // 단어 목록 탭으로 돌아올 때는 방금 반영되었을 수 있는 학습 상태를
      // 즉시 확인할 수 있도록 요약(+ 표가 열려있다면 표까지) 다시 조회한다.
      loadAndRenderAll();
    }
  }

  /**
   * 통계 모달을 연다. 이미 마운트되어 있으면(재진입) refresh()만 호출해
   * 최신 학습 상태를 반영하고, 처음이면 새로 mount한다. 탭이었을 때와
   * 달리 모달을 닫아도 destroy하지 않는다 — 통계는 내부 상태(재생 중인
   * 오디오, 타이머 등)가 없는 순수 조회 화면이라 DOM을 유지해도 부담이
   * 없고, 다음에 열 때 refresh만으로 항상 최신 값을 보여줄 수 있기
   * 때문이다.
   */
  function openStatsOverlay() {
    if (!statsContainer) return;
    if (!statsInstance) {
      statsInstance = statsModule.mount(statsContainer);
    } else {
      statsInstance.refresh();
    }
    if (statsOverlay) statsOverlay.classList.add('open');
  }

  function closeStatsOverlay() {
    if (statsOverlay) statsOverlay.classList.remove('open');
  }

  // ═══════════════════════════════════════════════════════════
  // 필터 + 범위를 함께 반영하는 조회 함수
  // ═══════════════════════════════════════════════════════════

  /**
   * 단어 목록 탭(표)에서 체크된 필터 라벨 배열을 반환한다. ('untested'/'starred'/'stable')
   */
  function getSelectedFilters() {
    return readFilterCheckboxes({
      untested: filterUntestedCheckbox,
      starred: filterStarredCheckbox,
      stable: filterStableCheckbox,
    });
  }

  /**
   * 체크박스 맵({ untested, starred, stable })에서 체크된 라벨 배열을 읽는다.
   * 단어 목록 탭뿐 아니라 깜박이/퀴즈 탭에도 각자의 체크박스 세트가
   * 있으므로, 어느 세트든 동일하게 읽을 수 있도록 공통 함수로 뺐다.
   *
   * @param {{untested: HTMLInputElement, starred: HTMLInputElement, stable: HTMLInputElement}} checkboxes
   * @returns {Array<'untested'|'starred'|'stable'>}
   */
  function readFilterCheckboxes(checkboxes) {
    const filters = [];
    if (checkboxes.untested.checked) filters.push('untested');
    if (checkboxes.starred.checked) filters.push('starred');
    if (checkboxes.stable.checked) filters.push('stable');
    return filters;
  }

  /**
   * 깜박이/퀴즈 모듈에 주입할 "범위를 받아 단어 배열을 반환하는 함수"를 만든다.
   *
   * 깜박이/퀴즈 탭에는 각자의 필터 체크박스가 내장되어 있으므로, 해당
   * 탭의 체크박스 세트를 직접 전달받아 사용한다. 그 탭에서 하나 이상
   * 체크되어 있으면 필터를 적용하고(+ 범위가 있으면 그 안에서 더 좁힘),
   * 아무것도 체크되어 있지 않으면 범위(또는 전체)만 사용한다.
   *
   * @param {{untested: HTMLInputElement, starred: HTMLInputElement, stable: HTMLInputElement}} checkboxes
   * @returns {(startId:number|null, endId:number|null) => Promise<Array>}
   */
  function makeGetWordsFn(checkboxes) {
    return function (startId, endId) {
      const hasRange = startId !== null && startId !== undefined && endId !== null && endId !== undefined;
      const filters = readFilterCheckboxes(checkboxes);

      if (filters.length === 0) {
        return hasRange
          ? wordStore.getWordsInRange(startId, endId)
          : wordStore.getAllWords();
      }

      return wordStore.getWordsWithStatus(filters).then((words) => {
        if (!hasRange) return words;
        const lo = Math.min(startId, endId);
        const hi = Math.max(startId, endId);
        return words.filter((w) => w.id >= lo && w.id <= hi);
      });
    };
  }

  /**
   * 깜박이/퀴즈 탭에 내장된 필터 체크박스 상태를 바탕으로, 지금 어떤
   * 필터가 적용 중인지 안내하는 문구를 만든다. 아무것도 체크되어 있지
   * 않으면 안내 없이 null을 반환한다(범위/전체를 그대로 쓴다는 뜻이므로
   * 굳이 안내할 필요가 없다).
   *
   * @param {{untested: HTMLInputElement, starred: HTMLInputElement, stable: HTMLInputElement}} checkboxes
   * @returns {string|null}
   */
  function makeFilterLabel(checkboxes) {
    const filters = readFilterCheckboxes(checkboxes);
    if (filters.length === 0) return null;

    const labelMap = { untested: '미테스트', starred: '별표(큰별표 포함)', stable: '안정권' };
    const labels = filters.map((f) => labelMap[f]).join(', ');
    return `현재 필터(${labels})가 적용된 단어만 대상으로 합니다. 범위를 함께 지정하면 그 안에서 더 좁혀집니다.`;
  }

  // ═══════════════════════════════════════════════════════════
  // 깜박이 모드 마운트/해제
  // ═══════════════════════════════════════════════════════════

  function mountFlashcard() {
    if (flashcardInstance) {
      flashcardInstance.destroy();
      flashcardInstance = null;
    }

    flashcardInstance = flashcardModule.mount(flashcardContainer, {
      getWords: makeGetWordsFn(flashcardFilterCheckboxes),
      filterLabel: makeFilterLabel(flashcardFilterCheckboxes),
      // 다국어 TTS: 현재 학습 언어를 그대로 전달. flashcard 모듈은 이 값을
      // 판단하지 않고 ttsEngine.speak(..., { lang })에 얹기만 한다.
      lang: settingsPanelInstance.getSettings().activeLang,
      initialSettings: {
        intervalSeconds: settingsPanelInstance.getSettings().flashcardIntervalSeconds,
        autoplay: settingsPanelInstance.getSettings().flashcardAutoplay,
      },
      onSettingsChange: (settings) => {
        settingsPanelInstance.getSettings().flashcardIntervalSeconds = settings.intervalSeconds;
        settingsPanelInstance.getSettings().flashcardAutoplay = settings.autoplay;
        settingsPanelInstance.savePartial({
          flashcardIntervalSeconds: settings.intervalSeconds,
          flashcardAutoplay: settings.autoplay,
        });
        settingsPanelInstance.syncPanelFromCurrent();
      },
    });
  }

  function unmountFlashcard() {
    if (flashcardInstance) {
      flashcardInstance.destroy();
      flashcardInstance = null;
    }
    flashcardContainer.innerHTML = '';
  }

  // ═══════════════════════════════════════════════════════════
  // 퀴즈 모드 마운트/해제 (+ 결과 화면 연동)
  // ═══════════════════════════════════════════════════════════

  function mountQuiz() {
    closeResultScreen();

    if (quizInstance) {
      quizInstance.destroy();
      quizInstance = null;
    }

    quizContainer.style.display = 'block';
    quizInstance = mountQuizInstance();
  }

  function mountQuizInstance() {
    return quizModule.mount(quizContainer, {
      onFinish: handleQuizFinish,
      getWords: makeGetWordsFn(quizFilterCheckboxes),
      filterLabel: makeFilterLabel(quizFilterCheckboxes),
      // 퀴즈 모드는 별도의 자동재생 체크박스를 두지 않고, 전역 설정
      // 패널의 "자동 발음 재생"(깜박이 모드와 공유하는 flashcardAutoplay) 값을
      // 그대로 사용한다. 이 값이 켜져 있으면 문제/정답 표시 시 발음을 읽어준다.
      autoplay: settingsPanelInstance.getSettings().flashcardAutoplay,
      // 다국어 TTS: 현재 학습 언어. quiz 모듈은 이 값을 판단하지 않고
      // ttsEngine.speak(..., { lang })에 얹기만 한다.
      lang: settingsPanelInstance.getSettings().activeLang,
      initialSettings: {
        count: settingsPanelInstance.getSettings().quizCount,
        order: settingsPanelInstance.getSettings().quizOrder,
        direction: settingsPanelInstance.getSettings().quizDirection,
        revealOnWrong: settingsPanelInstance.getSettings().quizRevealOnWrong,
        delaySeconds: settingsPanelInstance.getSettings().quizDelaySeconds,
        quizType: settingsPanelInstance.getSettings().quizType,
        oxRatio: settingsPanelInstance.getSettings().quizOxRatio,
        oxDifficulty: settingsPanelInstance.getSettings().quizOxDifficulty,
      },
      onSettingsChange: (settings) => {
        settingsPanelInstance.getSettings().quizCount = settings.count;
        settingsPanelInstance.getSettings().quizOrder = settings.order;
        settingsPanelInstance.getSettings().quizDirection = settings.direction;
        settingsPanelInstance.getSettings().quizRevealOnWrong = settings.revealOnWrong;
        settingsPanelInstance.getSettings().quizDelaySeconds = settings.delaySeconds;
        settingsPanelInstance.getSettings().quizType = settings.quizType;
        settingsPanelInstance.getSettings().quizOxRatio = settings.oxRatio;
        settingsPanelInstance.getSettings().quizOxDifficulty = settings.oxDifficulty;
        settingsPanelInstance.savePartial({
          quizCount: settings.count,
          quizOrder: settings.order,
          quizDirection: settings.direction,
          quizRevealOnWrong: settings.revealOnWrong,
          quizDelaySeconds: settings.delaySeconds,
          quizType: settings.quizType,
          quizOxRatio: settings.oxRatio,
          quizOxDifficulty: settings.oxDifficulty,
        });
        settingsPanelInstance.syncPanelFromCurrent();
      },
    });
  }

  function unmountQuiz() {
    closeResultScreen();
    if (quizInstance) {
      quizInstance.destroy();
      quizInstance = null;
    }
    quizContainer.innerHTML = '';
  }

  /**
   * 퀴즈 종료 콜백. quiz 모듈이 wordStore.recordResult 반영까지 마친 뒤
   * 정오답 기록 배열(records)을 넘겨준다. quizContainer를 숨기고
   * resultContainer에 modules/result를 마운트해 결과 화면을 보여준다.
   *
   * @param {Array} records
   */
  function handleQuizFinish(records) {
    quizContainer.style.display = 'none';
    resultContainer.style.display = 'block';

    if (resultInstance) {
      resultInstance.destroy();
      resultInstance = null;
    }

    resultInstance = resultModule.mount(resultContainer, records, {
      onRestart: handleResultRestart,
      // 다국어 TTS: 결과 화면의 발음 재생 버튼도 현재 학습 언어를 따른다.
      lang: settingsPanelInstance.getSettings().activeLang,
    });

    // 학습 상태가 방금 갱신되었으므로, 단어 목록 탭으로 돌아갔을 때 바로
    // 최신 상태가 보이도록 요약을 미리 갱신해둔다(카운트만 계산하므로 저렴하다).
    refreshSummary();
  }

  /**
   * 결과 화면의 "새 퀴즈 시작" 버튼 처리.
   */
  function handleResultRestart() {
    closeResultScreen();

    if (quizInstance) {
      quizInstance.destroy();
      quizInstance = null;
    }
    quizContainer.style.display = 'block';
    quizInstance = mountQuizInstance();
  }

  function closeResultScreen() {
    if (resultInstance) {
      resultInstance.destroy();
      resultInstance = null;
    }
    resultContainer.style.display = 'none';
    resultContainer.innerHTML = '';
  }

  // ═══════════════════════════════════════════════════════════
  // 헤더 메모 입력란
  // ═══════════════════════════════════════════════════════════

  /**
   * settings 스토어에서 저장된 헤더 메모를 불러와 입력란에 반영한다.
   * 저장된 값이 없으면(최초 방문) 빈 문자열로 두어 CSS placeholder
   * ("Want to say...")가 보이게 한다.
   *
   * @returns {Promise<void>}
   */
  function loadHeaderNote() {
    return wordStore.getSetting(HEADER_NOTE_SETTING_KEY, '').then((note) => {
      headerNoteEl.textContent = note || '';
    });
  }

  /**
   * settings 스토어에서 저장된 테마('light'|'dark')를 불러와 즉시
   * 적용한다. 저장된 값이 없으면(최초 방문) 라이트 모드를 기본값으로
   * 쓴다(시스템 설정을 따라가지 않는 수동 토글 방식).
   *
   * @returns {Promise<void>}
   */
  function loadTheme() {
    return wordStore.getSetting(THEME_SETTING_KEY, 'light').then((theme) => {
      applyTheme(theme === 'dark' ? 'dark' : 'light');
    });
  }

  /**
   * <html data-theme="..."> 속성과 토글 버튼 표시를 갱신한다. 실제 색상
   * 전환은 index.html의 CSS(:root / html[data-theme="dark"])가 담당하며,
   * 이 함수는 어떤 테마를 적용할지 상태만 반영한다.
   *
   * @param {'light'|'dark'} theme
   */
  function applyTheme(theme) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    themeToggleButton.textContent = isDark ? '☀️ 라이트모드' : '🌙 다크모드';
    themeToggleButton.setAttribute('aria-pressed', String(isDark));
    updateThemeColorMeta(isDark);
  }

  /**
   * (세션 01 추가) 모바일 브라우저 상단 바 색상(<meta name="theme-color">)을
   * 현재 앱 테마에 맞춰 갱신한다. index.html에는 OS 설정 기반의
   * prefers-color-scheme 메타 태그 2개가 있는데, 앱 내부 토글(이 함수)이
   * 실제로 눌리면 OS 설정과 무관하게 앱이 지금 보여주는 테마 색을
   * 두 메타 태그 모두에 동일하게 반영해 화면과 상단 바 색이 항상 일치하게
   * 만든다. main.css의 --bg 값과 반드시 맞춰야 한다(라이트 #f7f8fa,
   * 다크 #14161c).
   * @param {boolean} isDark
   */
  function updateThemeColorMeta(isDark) {
    const color = isDark ? '#14161c' : '#f7f8fa';
    const lightMeta = document.getElementById('themeColorMetaLight');
    const darkMeta = document.getElementById('themeColorMetaDark');
    if (lightMeta) lightMeta.setAttribute('content', color);
    if (darkMeta) darkMeta.setAttribute('content', color);
  }

  /**
   * 다크모드 토글 버튼 클릭 시 호출된다. 현재 <html data-theme>를 보고
   * 반대 테마로 전환한 뒤 settings 스토어(key: "theme")에 저장해 다음
   * 방문 시에도 유지되게 한다.
   */
  function handleThemeToggleClicked() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const nextTheme = isDark ? 'light' : 'dark';
    applyTheme(nextTheme);
    wordStore.saveSetting(THEME_SETTING_KEY, nextTheme).catch((err) => {
      console.error('테마 저장 실패:', err);
    });
  }

  /**
   * 헤더 메모 입력란에 포커스가 들어올 때 호출된다. 기존 문구가 있으면
   * 전체를 선택 상태로 만들어, 사용자가 바로 타이핑해서 새 문구로
   * 덮어쓸 수 있게 한다(직접 지우지 않아도 됨).
   */
  function handleHeaderNoteFocus() {
    if (!headerNoteEl.textContent) return;
    const range = document.createRange();
    range.selectNodeContents(headerNoteEl);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /**
   * 헤더 메모 입력란에서 포커스가 벗어날 때 호출된다. 현재 내용을
   * settings 스토어에 저장한다(기존 값은 자동으로 덮어써져 최신 문구
   * 하나만 유지된다). 빈 문자열로 저장하면 다음 방문 시 placeholder가
   * 다시 나타난다.
   */
  function handleHeaderNoteCommit() {
    const note = headerNoteEl.textContent.trim();
    // 트리밍된 값으로 화면도 맞춰준다(앞뒤 공백/개행 정리).
    if (headerNoteEl.textContent !== note) {
      headerNoteEl.textContent = note;
    }
    wordStore.saveSetting(HEADER_NOTE_SETTING_KEY, note).catch((err) => {
      console.error('헤더 메모 저장 중 오류:', err);
    });
  }

  // ═══════════════════════════════════════════════════════════
  // 전역 설정 패널 — DOM/저장/로드는 settingsPanelController.js가 전담
  // ═══════════════════════════════════════════════════════════

  /**
   * settingsPanelController의 onSettingsChange 콜백. 지금 열려 있는
   * 모드가 있다면 새 설정으로 다시 마운트해 즉시 반영한다.
   */
  function handleGlobalSettingsChange() {
    if (getActiveContentTab() === 'flashcard') {
      mountFlashcard();
    } else if (getActiveContentTab() === 'quiz' && !resultInstance) {
      mountQuiz();
    } else if (getActiveContentTab() === 'sentence') {
      remountSentenceMode();
    } else if (getActiveContentTab() === 'conversation') {
      remountConversationMode();
    }
  }

  // ═══════════════════════════════════════════════════════════
  // 단어 목록/업로드 화면 (mainView)
  // ═══════════════════════════════════════════════════════════

  function setDbBadge(ready, text) {
    dbBadge.classList.toggle('ready', !!ready);
    dbBadgeText.textContent = text;
  }

  function handleFileSelected(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) return;

    setStatus(`"${file.name}" 읽는 중...`, 'neutral');
    saveButton.disabled = true;

    const reader = new FileReader();

    reader.onload = function (e) {
      const rawText = e.target.result;
      try {
        pendingParsedWords = dataParser.parseVocabText(rawText);
        pendingFileName = file.name;
        renderTable(pendingParsedWords);
        wordCountEl.textContent = pendingParsedWords.length;
        saveButton.disabled = pendingParsedWords.length === 0;
        if (pendingParsedWords.length === 0) {
          const hasNumberedLine = /^\d+\./m.test(rawText);
          const message = hasNumberedLine
            ? `"${file.name}"에서 번호 형식의 줄은 있지만 유효한 단어를 인식하지 못했습니다. 파일 형식을 확인해주세요 (형식 안내 참고).`
            : '인식된 단어가 없습니다. 파일 형식을 확인해주세요 (형식 안내 참고).';
          setStatus(message, 'error');
        } else {
          setStatus(
            `"${file.name}" 파싱 완료 (${pendingParsedWords.length}개 단어 인식됨). "IndexedDB에 저장"을 눌러 저장하세요.`,
            'neutral'
          );
        }
      } catch (err) {
        console.error(err);
        pendingParsedWords = null;
        pendingFileName = null;
        saveButton.disabled = true;
        setStatus('파싱 중 오류가 발생했습니다: ' + err.message, 'error');
      }
    };

    reader.onerror = function () {
      setStatus('파일을 읽는 중 오류가 발생했습니다.', 'error');
    };

    reader.readAsText(file, 'utf-8');
  }

  function handleSaveClicked() {
    if (!pendingParsedWords || pendingParsedWords.length === 0) return;

    saveButton.disabled = true;
    setStatus('IndexedDB에 저장하는 중...', 'neutral');

    const listName = pendingFileName || `단어 리스트 (${pendingParsedWords.length}개)`;
    // 다국어 TTS: 저장 시점에 선택된 발음 언어. 드롭다운이 비어 있으면(음성
    // 목록을 못 가져온 브라우저 등) 기본값으로 방어한다.
    const selectedLang = (saveLangSelect && saveLangSelect.value) || wordStore.DEFAULT_LANG;

    // 활성 단어장(words/wordState) 갱신과 함께, "저장된 리스트" 목록에도
    // 이번 업로드 스냅샷을 별도로 남겨 이후 선택 삭제/불러오기가 가능하게 한다.
    // 다국어 TTS: 리스트에 선택된 언어(selectedLang)를 함께 저장한다.
    Promise.all([
      wordStore.saveWords(pendingParsedWords),
      wordStore.saveWordList(listName, pendingParsedWords, undefined, selectedLang),
    ])
      .then(() => {
        setStatus(`${pendingParsedWords.length}개 단어를 IndexedDB에 저장했습니다.`, 'success');
        rangeStartInput.value = '';
        rangeEndInput.value = '';
        currentViewRange = { mode: 'all', start: null, end: null };
        setActiveLang(selectedLang);
        return Promise.all([loadAndRenderAll(), wordListsInstance.refresh()]);
      })
      .catch((err) => {
        console.error(err);
        setStatus('저장 중 오류가 발생했습니다: ' + err.message, 'error');
      })
      .finally(() => {
        saveButton.disabled = false;
      });
  }

  function handleRangeApply() {
    const startVal = rangeStartInput.value.trim();
    const endVal = rangeEndInput.value.trim();

    if (startVal === '' || endVal === '') {
      setStatus('범위 조회를 하려면 시작과 끝 번호를 모두 입력하세요.', 'error');
      return;
    }

    const start = Number(startVal);
    const end = Number(endVal);

    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      setStatus('시작/끝 번호는 숫자로 입력해주세요.', 'error');
      return;
    }

    currentViewRange = { mode: 'range', start, end };
    refreshTableView().then(() => {
      setStatus(`${Math.min(start, end)}~${Math.max(start, end)} 범위 조회 결과 표시 중`, 'neutral');
    });
  }

  function handleRangeReset() {
    rangeStartInput.value = '';
    rangeEndInput.value = '';
    currentViewRange = { mode: 'all', start: null, end: null };
    refreshTableView().then(() => {
      setStatus('전체 단어 목록을 표시합니다.', 'neutral');
    });
  }

  function handleFilterClear() {
    filterUntestedCheckbox.checked = false;
    filterStarredCheckbox.checked = false;
    filterStableCheckbox.checked = false;
    refreshTableView().then(() => {
      setStatus('필터를 해제했습니다.', 'neutral');
    });
  }

  /**
   * 단어 목록 탭 전체를 새로고침한다. 표(details)가 열려 있을 때만
   * 표까지 다시 그리고, 항상 상태 요약 카드는 갱신한다. 저장/불러오기
   * 직후처럼 "지금 데이터가 바뀌었으니 화면 전체를 최신으로 맞춰야 하는"
   * 지점에서 호출한다.
   */
  function loadAndRenderAll() {
    currentViewRange = { mode: 'all', start: null, end: null };
    return Promise.all([refreshSummary(), refreshTableView()]);
  }

  /**
   * 상태별 개수 요약 카드를 갱신한다. wordStore.getStatusCounts는
   * 단어 배열을 DOM으로 그리지 않고 개수만 계산해 반환하므로, 단어 수가
   * 많아도 이 호출 자체는 가볍다.
   */
  function refreshSummary() {
    return wordStore.getStatusCounts().then((counts) => {
      wordCountEl.textContent = counts.total;
      summaryCountTotal.textContent = counts.total;
      summaryCountUntested.textContent = counts.untested;
      summaryCountStarred.textContent = counts.starred;
      summaryCountBigStarred.textContent = counts.bigStarred;
      summaryCountStable.textContent = counts.stable;
    }).catch((err) => {
      console.error(err);
      setStatus('현황 요약을 불러오는 중 오류가 발생했습니다: ' + err.message, 'error');
    });
  }

  /**
   * 단어별 상세 표를 갱신한다("표로 자세히 보기"가 펼쳐져 있을 때만
   * 실제로 그린다). 범위/필터 입력 UI는 표 영역 안에 그대로 남아있어,
   * 필요할 때만 이 무거운 렌더링 비용을 들인다.
   */
  function refreshTableView() {
    if (!wordTableDetails.open) {
      return Promise.resolve();
    }

    const filters = getSelectedFilters();

    const basePromise = filters.length > 0
      ? wordStore.getWordsWithStatus(filters)
      : (currentViewRange.mode === 'range'
          ? wordStore.getWordsInRange(currentViewRange.start, currentViewRange.end)
          : wordStore.getAllWords()
        ).then(wordStore.attachStatusToWords);

    return basePromise.then((words) => {
      let result = words;

      if (filters.length > 0 && currentViewRange.mode === 'range') {
        const lo = Math.min(currentViewRange.start, currentViewRange.end);
        const hi = Math.max(currentViewRange.start, currentViewRange.end);
        result = result.filter((w) => w.id >= lo && w.id <= hi);
      }

      renderTable(result);
    }).catch((err) => {
      console.error(err);
      setStatus('목록을 불러오는 중 오류가 발생했습니다: ' + err.message, 'error');
    });
  }

  function setStatus(message, kind) {
    statusLine.textContent = message;
    statusLine.classList.toggle('error', kind === 'error');
    statusLine.classList.toggle('success', kind === 'success');
  }

  // ══════════════════════════════════════════════════════════
  // 단어 표 렌더링 — app/controllers/tableRenderer.js에 위임
  // ══════════════════════════════════════════════════════════
  //
  // 표의 실제 DOM 생성(셀 만들기, 페이지네이션, 정답/오답 검증 버튼)은
  // app/controllers/tableRenderer.js가 전담한다. main.js는 "무엇을
  // 보여줄지"(필터/범위 계산)만 결정하고, tableRendererInstance.render()를
  // 호출해 그리기를 위임한다. 이전/다음 페이지 버튼도 tableRendererInstance가
  // 기억해둔 현재 단어 목록/페이지를 그대로 재사용한다(init() 참고).
  const tableRendererInstance = tableRenderer.createTableRenderer({
    dom: {
      wordTable,
      wordTableBody,
      emptyState,
      wordTablePager,
      wordTablePagerInfo,
      wordTablePagerPrev,
      wordTablePagerNext,
    },
    wordStore,
    stateManager,
    onStatusMessage: setStatus,
    pageSize: 100,
  });

  function renderTable(words, page) {
    tableRendererInstance.render(words, page);
  }

  // ── 전역 설정 패널 / 상단 탭 네비게이션 — app/controllers/*에 위임 ──
  // DOM 참조 수집·열기닫기·값 동기화·저장은 settingsPanelController.js가,
  // 탭 버튼 활성 클래스/패널 표시 전환은 tabNavController.js가 전담한다.
  // main.js는 handleGlobalSettingsChange/handleTabChange 콜백으로 모듈
  // mount/unmount만 반응한다(조립자만의 책임이라 컨트롤러로 옮기지 않음).
  const byId = (id) => document.getElementById(id);

  const settingsPanelInstance = settingsPanelController.createSettingsPanelController({
    dom: {
      settingsOpenButton: byId('settingsOpenButton'),
      settingsCloseButton: byId('settingsCloseButton'),
      settingsOverlay: byId('settingsOverlay'),
      settingsSaveLine: byId('settingsSaveLine'),
      settingIntervalSeconds: byId('settingIntervalSeconds'),
      settingIntervalSecondsLabel: byId('settingIntervalSecondsLabel'),
      settingAutoplay: byId('settingAutoplay'),
      settingQuizCount: byId('settingQuizCount'),
      settingQuizOrder: byId('settingQuizOrder'),
      settingQuizDirection: byId('settingQuizDirection'),
      settingRevealOnWrong: byId('settingRevealOnWrong'),
      settingQuizDelay: byId('settingQuizDelay'),
      settingQuizDelayLabel: byId('settingQuizDelayLabel'),
      settingSentenceStageOneSeconds: byId('settingSentenceStageOneSeconds'),
      settingSentenceStageTwoSeconds: byId('settingSentenceStageTwoSeconds'),
      settingSentenceCompareSeconds: byId('settingSentenceCompareSeconds'),
      settingSentenceAdvanceMode: byId('settingSentenceAdvanceMode'),
      settingConversationTurnASeconds: byId('settingConversationTurnASeconds'),
      settingConversationTurnASecondsLabel: byId('settingConversationTurnASecondsLabel'),
      settingConversationTurnBSeconds: byId('settingConversationTurnBSeconds'),
      settingConversationTurnBSecondsLabel: byId('settingConversationTurnBSecondsLabel'),
    },
    wordStore,
    defaults: SETTINGS_DEFAULTS,
    onSettingsChange: handleGlobalSettingsChange,
  });

  // ── 대탭(단어장 모드/문장 모드) + 소탭 2단 구조 ──────────────────
  // tabNavController.js 자체는 "flat한 탭 목록 하나"만 다루는 범용
  // 컨트롤러라 수정하지 않고 그대로 재사용한다. 대신 소탭 그룹별로
  // 인스턴스를 2개 만든다:
  //   1) wordGroupTabNavInstance     — 단어장 모드 소탭(main/flashcard/quiz)
  //   2) sentenceGroupTabNavInstance — 문장 모드 소탭(sentence/conversation)
  // 소탭의 name 값은 기존 탭 이름을 그대로 유지해 handleTabChange 등
  // 기존 로직을 건드리지 않는다. 대탭(word/sentence) 전환은 별도
  // 컨트롤러 없이 아래 switchMainGroup()이 직접 처리한다(대탭이 2개뿐
  // 이라 컨트롤러를 새로 만들 만큼 복잡하지 않음).
  const TAB_GROUPS = {
    word: ['main', 'flashcard', 'quiz'],
    sentence: ['sentence', 'conversation'],
  };

  // initialTab을 각 그룹의 첫 탭으로 주면, tabNavController 내부의
  // switchTab()이 "같은 탭이면 아무 것도 안 함" guard 때문에 나중에
  // switchMainGroup()에서 같은 이름으로 다시 전환을 시도해도 DOM의
  // active 클래스/aria-selected가 갱신되지 않는 문제가 있다(생성자는
  // activeTab 변수만 세팅할 뿐 applyActiveState를 호출하지 않으므로,
  // "초기 상태"와 "그 탭으로 실제 전환된 상태"가 겉보기엔 같아 보여도
  // DOM은 아직 비어있는 상태일 수 있음). 그래서 initialTab을 빈 문자열로
  // 두어 최초 switchTab 호출이 항상 실제로 DOM을 갱신하도록 한다.
  const wordGroupTabNavInstance = tabNavController.createTabNavController({
    tabs: [
      { name: 'main', button: byId('tabButtonMain'), panel: byId('tabPanelMain') },
      { name: 'flashcard', button: byId('tabButtonFlashcard'), panel: byId('tabPanelFlashcard') },
      { name: 'quiz', button: byId('tabButtonQuiz'), panel: byId('tabPanelQuiz') },
    ],
    initialTab: '',
    onTabChange: handleTabChange,
  });

  const sentenceGroupTabNavInstance = tabNavController.createTabNavController({
    tabs: [
      { name: 'sentence', button: byId('tabButtonSentence'), panel: byId('tabPanelSentence') },
      { name: 'conversation', button: byId('tabButtonConversation'), panel: byId('tabPanelConversation') },
    ],
    initialTab: '',
    onTabChange: handleTabChange,
  });

  const GROUP_TAB_NAV = {
    word: wordGroupTabNavInstance,
    sentence: sentenceGroupTabNavInstance,
  };

  // 대탭 버튼/소탭 nav 엘리먼트.
  const mainTabButtonWord = byId('mainTabButtonWord');
  const mainTabButtonSentence = byId('mainTabButtonSentence');
  const tabNavWordGroupEl = byId('tabNavWordGroup');
  const tabNavSentenceGroupEl = byId('tabNavSentenceGroup');

  let activeGroup = 'word';

  /**
   * 현재 화면에 보이고 있는 콘텐츠 탭 이름을 반환한다(main/flashcard/
   * quiz/sentence/conversation). 기존 코드 전반에 걸쳐
   * `getActiveContentTab()`로 참조되던 자리를 대체한다 — 이제
   * 콘텐츠 탭 컨트롤러가 그룹별로 2개(word/sentence)로 나뉘어 있어,
   * 대탭 상태(activeGroup)에 따라 그 중 하나에게 물어봐야 한다.
   */
  function getActiveContentTab() {
    return GROUP_TAB_NAV[activeGroup].getActiveTab();
  }

  /**
   * 대탭(단어장 모드/문장 모드)을 전환한다. 요구사항에 따라 그룹을
   * 바꿀 때마다 항상 그 그룹의 "첫 소탭"으로 초기화한다(마지막으로
   * 보던 소탭을 기억하지 않음).
   *
   * @param {'word'|'sentence'} group
   */
  function switchMainGroup(group) {
    if (group === activeGroup) return;
    const previousGroup = activeGroup;
    activeGroup = group;

    mainTabButtonWord.classList.toggle('active', group === 'word');
    mainTabButtonWord.setAttribute('aria-selected', String(group === 'word'));
    mainTabButtonSentence.classList.toggle('active', group === 'sentence');
    mainTabButtonSentence.setAttribute('aria-selected', String(group === 'sentence'));

    tabNavWordGroupEl.hidden = group !== 'word';
    tabNavSentenceGroupEl.hidden = group !== 'sentence';

    // 이전 그룹에서 열려 있던 콘텐츠 탭 모듈을 정리(unmount)한다.
    const leavingTab = GROUP_TAB_NAV[previousGroup].getActiveTab();
    unmountTabModule(leavingTab);

    // 이전 그룹의 탭 버튼/패널에서 active 클래스를 걷어낸다. 이걸 안
    // 하면 이전 그룹의 활성 패널(예: tabPanelMain)이 .active를 계속
    // 들고 있어, 새 그룹의 활성 패널과 동시에 display:block이 되어
    // 화면에 두 패널이 겹쳐 보이는 문제가 생긴다(각 소탭 컨트롤러는
    // 서로의 존재를 모르는 별개 인스턴스라 자동으로 정리되지 않음).
    GROUP_TAB_NAV[previousGroup].clearActiveState();

    // 새 그룹은 항상 그 그룹의 "첫 소탭"으로 초기화한다(마지막으로
    // 보던 소탭을 기억하지 않음 — 요구사항). resetTo()는 이미
    // activeTab이 그 값이어도(그룹을 나갔다 다시 들어온 경우) guard 없이
    // 항상 DOM을 재적용해준다.
    const enteringGroupNav = GROUP_TAB_NAV[group];
    const enteringDefaultTab = TAB_GROUPS[group][0];
    enteringGroupNav.resetTo(enteringDefaultTab);

    // 새 그룹의 첫 소탭 모듈을 mount한다. main 탭은 별도 모듈 mount가
    // 없고 요약/표를 다시 그리는 것으로 충분하므로 loadAndRenderAll을,
    // 나머지는 unmountTabModule과 대응되는 mount 함수를 부른다.
    if (enteringDefaultTab === 'flashcard') {
      mountFlashcard();
    } else if (enteringDefaultTab === 'quiz') {
      mountQuiz();
    } else if (enteringDefaultTab === 'sentence') {
      mountSentence();
    } else if (enteringDefaultTab === 'conversation') {
      mountConversation();
    } else {
      loadAndRenderAll();
    }

    // 깜박이/퀴즈/문장/회화 소탭은 학습 화면이 길게 나올 수 있어 넓게
    // 보이도록 컨테이너를 확장한다(카드/문장/표가 좁으면 잘려 보이므로).
    document.body.classList.toggle(
      'wide-tab-active',
      enteringDefaultTab === 'flashcard' || enteringDefaultTab === 'quiz' ||
      enteringDefaultTab === 'sentence' || enteringDefaultTab === 'conversation'
    );
  }

  mainTabButtonWord.addEventListener('click', () => switchMainGroup('word'));
  mainTabButtonSentence.addEventListener('click', () => switchMainGroup('sentence'));

  // 최초 로드: 단어장 모드 그룹의 "단어 목록·업로드" 소탭으로 명시
  // 진입시킨다(initialTab을 ''로 뒀으므로 이 호출이 없으면 어떤 탭도
  // active 상태로 표시되지 않는다).
  wordGroupTabNavInstance.switchTab('main');

  // 통계 모달 열기/닫기(전역 설정 모달과 동일한 .settings-overlay 패턴).
  if (statsOpenButton) statsOpenButton.addEventListener('click', openStatsOverlay);
  if (statsCloseButton) statsCloseButton.addEventListener('click', closeStatsOverlay);
  if (statsOverlay) {
    statsOverlay.addEventListener('click', (e) => {
      if (e.target === statsOverlay) closeStatsOverlay();
    });
  }

  // ── 세션 02: 탭 전환 스와이프 ────────────────────────────────────
  // 두 가지 후보 영역을 검토했다:
  //  (a) 탭 버튼 영역(.top-bar) 자체 — 카드 콘텐츠와는 안 겹치지만,
  //      .tab-nav 스스로도 overflow-x:auto 가로 스크롤을 쓰기 때문에
  //      "탭 목록을 손가락으로 훑어보려는" 네이티브 스크롤 제스처와
  //      "탭 전환 스와이프"가 같은 영역에서 충돌한다(touchGesture가
  //      수평 이동을 감지하면 preventDefault를 걸어 네이티브 스크롤을
  //      막아버림). 그래서 이 방식은 채택하지 않았다.
  //  (b) 단어 목록 탭(#tabPanelMain) 안에서만 탭 전환 스와이프를 켜는
  //      방식 — 채택. 깜박이/문장/회화 등 카드형 콘텐츠는 애초에 이
  //      패널 밖에 있으므로 세션 03~05가 각 카드 영역에 붙일 "카드
  //      넘기기" 스와이프와 아예 겹칠 일이 없고, .tab-nav의 가로
  //      스크롤과도 무관한 영역이라 두 번째 문제도 생기지 않는다.
  // 결과적으로 탭 전환 스와이프는 "단어 목록·업로드 탭이 보이고 있을
  // 때, 그 탭 콘텐츠 영역 어디를 스와이프해도" 인접 소탭으로 이동하는
  // 것으로 구현한다. 좌우 스와이프는 현재 활성 대탭 그룹(activeGroup)
  // 안의 TAB_GROUPS[activeGroup] 배열 순서만 따르며, 그 그룹의 처음/
  // 끝에서는 더 이상 넘어가지 않는다(다른 대탭으로는 스와이프로 넘어
  //가지 않음 — 대탭 전환은 항상 명시적 버튼 클릭으로만 일어난다).
  const tabPanelMainEl = byId('tabPanelMain');

  // #tableWrapper(표 가로 스크롤 컨테이너, 세션 02에서 추가)는 그 자체로
  // 좌우 스와이프가 "표를 옆으로 스크롤한다"는 의미를 이미 갖고 있다.
  // #tabPanelMain에 붙는 탭 전환 스와이프가 이 제스처를 가로채 표
  // 스크롤 대신 탭이 넘어가버리면 안 되므로, 터치 시작 지점이
  // #tableWrapper 내부이면 탭 전환 스와이프 판단 자체를 캡처 단계에서
  // 막는다(표 자체 스크롤은 브라우저 네이티브 동작이라 그대로 유지됨).
  const tableWrapperEl = byId('tableWrapper');
  if (tableWrapperEl) {
    tableWrapperEl.addEventListener('touchstart', function (e) {
      e.stopPropagation();
    }, { capture: true, passive: true });
    tableWrapperEl.addEventListener('mousedown', function (e) {
      e.stopPropagation();
    }, { capture: true });
  }

  if (tabPanelMainEl && touchGesture && typeof touchGesture.attachSwipe === 'function') {
    touchGesture.attachSwipe(tabPanelMainEl, {
      onSwipeLeft: function () {
        // 단어 목록 탭 자체는 항상 단어장 그룹의 첫 소탭이므로 왼쪽
        // 스와이프는 곧 "다음 소탭(깜박이)으로"를 의미한다.
        const order = TAB_GROUPS[activeGroup];
        const groupNav = GROUP_TAB_NAV[activeGroup];
        const currentIndex = order.indexOf(groupNav.getActiveTab());
        if (currentIndex === -1 || currentIndex >= order.length - 1) return;
        groupNav.switchTab(order[currentIndex + 1]);
      },
      onSwipeRight: function () {
        const order = TAB_GROUPS[activeGroup];
        const groupNav = GROUP_TAB_NAV[activeGroup];
        const currentIndex = order.indexOf(groupNav.getActiveTab());
        if (currentIndex <= 0) return;
        groupNav.switchTab(order[currentIndex - 1]);
      },
    });
  }

  // const/let 선언이 모두 끝난 뒤 마지막에 init()을 호출한다(TDZ 회피).
  init();
})();
