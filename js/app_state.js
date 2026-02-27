/* =========================================================
 * App State Management
 * Refactored: 2026-02-12 - 전역 변수 → State 객체 패턴
 * ========================================================= */

(() => {
  'use strict';
  
  const W = window;
  const App = W.App = W.App || {};

  // ============================================
  // 📦 State 초기화
  // ============================================
  const createInitialState = () => ({
    // 📚 단어장 데이터
    vocabulary: [],
    currentIndex: 0,
    currentPool: [],
    currentFileName: '',
    
    // 🏃 실행 상태
    isRunning: false,
    autoTimer: null,
    currentMode: 'study',
    
    // ✍️ 퀴즈 관련
    quizPool: [],
    quizHistory: [],
    totalQuizHistory: Storage.getJSON('totalQuizHistory', []),
    
    // 📊 학습 로그
    studyLog: Storage.getJSON('studyLog', {}),
    
    // 💬 회화 모드
    dialogScript: [],
    dialogFileName: '',
    
    // 💡 캐싱
    cache: {},
    currentSettingsHash: ''
  });

  // ============================================
  // ⚙️ Settings 초기화
  // ============================================
  const createInitialSettings = () => ({
    // 학습 설정
    speed: 2.0,
    fontSize: 48,
    shuffle: true,
    autoSpeak: true,
    
    // 퀴즈 설정
    quizCount: 20,
    quizDelay: 1.0,
    quizHint: true,
    quizShuffle: true,
    quizDirection: 'wordToMeaning',
    
    // 필터 설정
    unmem: false,
    star: false,
    safe: false,
    
    // 색상 필터
    colorLearning: false,
    colorWrong: false,
    colorSafe: false,
    
    // 오답 설정
    wrongRevive: false,
    wrongDays: 7,
    
    // SRS 설정
    srsNewOnly: true,
    srsHardOnly: false,
    easeMode: 2.5,
    lapseMode: 0.0
  });

  // ============================================
  // 🎯 State 객체 (Private)
  // ============================================
  let _state = createInitialState();
  let _settings = createInitialSettings();

  // ============================================
  // 📖 Public API - State Getters
  // ============================================
  App.State = {
    // 전체 상태 접근 (읽기 전용)
    get: () => ({ ..._state }),
    
    // 개별 속성 접근
    getVocabulary: () => _state.vocabulary,
    getCurrentIndex: () => _state.currentIndex,
    getCurrentPool: () => _state.currentPool,
    getCurrentFileName: () => _state.currentFileName,
    getIsRunning: () => _state.isRunning,
    getAutoTimer: () => _state.autoTimer,
    getCurrentMode: () => _state.currentMode,
    getQuizPool: () => _state.quizPool,
    getQuizHistory: () => _state.quizHistory,
    getTotalQuizHistory: () => _state.totalQuizHistory,
    getStudyLog: () => _state.studyLog,
    getDialogScript: () => _state.dialogScript,
    getDialogFileName: () => _state.dialogFileName,
    getCache: () => _state.cache,
    getCurrentSettingsHash: () => _state.currentSettingsHash,

    // 설정 접근
    getSettings: () => ({ ..._settings }),
    getSetting: (key) => _settings[key],

    // ============================================
    // ✏️ State Setters (Controlled Updates)
    // ============================================
    setVocabulary: (value) => {
      _state.vocabulary = value;
      App.State.emit('vocabulary:changed', value);
    },
    
    setCurrentIndex: (value) => {
      _state.currentIndex = value;
      App.State.emit('index:changed', value);
    },
    
    setCurrentPool: (value) => {
      _state.currentPool = value;
    },
    
    setCurrentFileName: (value) => {
      _state.currentFileName = value;
    },
    
    setIsRunning: (value) => {
      _state.isRunning = value;
      App.State.emit('running:changed', value);
    },
    
    setAutoTimer: (value) => {
      _state.autoTimer = value;
    },
    
    setCurrentMode: (value) => {
      const oldMode = _state.currentMode;
      _state.currentMode = value;
      App.State.emit('mode:changed', { old: oldMode, new: value });
    },
    
    setQuizPool: (value) => {
      _state.quizPool = value;
    },
    
    setQuizHistory: (value) => {
      _state.quizHistory = value;
    },
    
    addQuizHistory: (item) => {
      _state.quizHistory.push(item);
    },
    
    setTotalQuizHistory: (value) => {
      _state.totalQuizHistory = value;
      Storage.setJSON('totalQuizHistory', value);
    },
    
    addTotalQuizHistory: (item) => {
      _state.totalQuizHistory.push(item);
      Storage.setJSON('totalQuizHistory', _state.totalQuizHistory);
    },
    
    setStudyLog: (value) => {
      _state.studyLog = value;
      Storage.setJSON('studyLog', value);
    },
    
    setDialogScript: (value) => {
      _state.dialogScript = value;
    },
    
    setDialogFileName: (value) => {
      _state.dialogFileName = value;
    },
    
    setCache: (value) => {
      _state.cache = value;
    },
    
    clearCache: () => {
      _state.cache = {};
      _state.currentSettingsHash = '';
    },
    
    setCurrentSettingsHash: (value) => {
      _state.currentSettingsHash = value;
    },

    // ============================================
    // ⚙️ Settings Setters
    // ============================================
    setSetting: (key, value) => {
      if (key in _settings) {
        _settings[key] = value;
        App.State.emit('setting:changed', { key, value });
      }
    },
    
    updateSettings: (updates) => {
      Object.keys(updates).forEach(key => {
        if (key in _settings) {
          _settings[key] = updates[key];
        }
      });
      App.State.emit('settings:updated', updates);
    },

    // ============================================
    // 🔄 Reset Functions
    // ============================================
    resetState: () => {
      _state = createInitialState();
      App.State.emit('state:reset');
    },
    
    resetSettings: () => {
      _settings = createInitialSettings();
      App.State.emit('settings:reset');
    },

    // ============================================
    // 📡 Simple Event System (for future use)
    // ============================================
    _listeners: {},
    
    on: (event, callback) => {
      if (!App.State._listeners[event]) {
        App.State._listeners[event] = [];
      }
      App.State._listeners[event].push(callback);
    },
    
    off: (event, callback) => {
      if (!App.State._listeners[event]) return;
      App.State._listeners[event] = App.State._listeners[event].filter(cb => cb !== callback);
    },
    
    emit: (event, data) => {
      if (!App.State._listeners[event]) return;
      App.State._listeners[event].forEach(callback => {
        try {
          callback(data);
        } catch (e) {
          console.error(`Error in event listener for ${event}:`, e);
        }
      });
    }
  };

  // ============================================
  // 🔗 Backward Compatibility (Legacy 코드 지원)
  // ============================================
  // 기존 전역 변수들을 App.State로 리다이렉트
  Object.defineProperties(W, {
    vocabulary: {
      get: () => _state.vocabulary,
      set: (v) => App.State.setVocabulary(v)
    },
    currentIndex: {
      get: () => _state.currentIndex,
      set: (v) => App.State.setCurrentIndex(v)
    },
    isRunning: {
      get: () => _state.isRunning,
      set: (v) => App.State.setIsRunning(v)
    },
    autoTimer: {
      get: () => _state.autoTimer,
      set: (v) => App.State.setAutoTimer(v)
    },
    currentPool: {
      get: () => _state.currentPool,
      set: (v) => App.State.setCurrentPool(v)
    },
    currentFileName: {
      get: () => _state.currentFileName,
      set: (v) => App.State.setCurrentFileName(v)
    },
    currentMode: {
      get: () => _state.currentMode,
      set: (v) => App.State.setCurrentMode(v)
    },
    quizPool: {
      get: () => _state.quizPool,
      set: (v) => App.State.setQuizPool(v)
    },
    quizHistory: {
      get: () => _state.quizHistory,
      set: (v) => App.State.setQuizHistory(v)
    },
    totalQuizHistory: {
      get: () => _state.totalQuizHistory,
      set: (v) => App.State.setTotalQuizHistory(v)
    },
    studyLog: {
      get: () => _state.studyLog,
      set: (v) => App.State.setStudyLog(v)
    },
    dialogScript: {
      get: () => _state.dialogScript,
      set: (v) => App.State.setDialogScript(v)
    },
    dialogFileName: {
      get: () => _state.dialogFileName,
      set: (v) => App.State.setDialogFileName(v)
    },
    settings: {
      get: () => _settings,
      set: (v) => {
        // settings 객체 전체 교체는 허용하지 않고 업데이트만
        if (typeof v === 'object') {
          App.State.updateSettings(v);
        }
      }
    },
    cache: {
      get: () => _state.cache,
      set: (v) => App.State.setCache(v)
    },
    currentSettingsHash: {
      get: () => _state.currentSettingsHash,
      set: (v) => App.State.setCurrentSettingsHash(v)
    }
  });

  // ============================================
  // 🎉 초기화 완료 로그
  // ============================================
  console.debug('✅ App.State initialized with backward compatibility');

})();
