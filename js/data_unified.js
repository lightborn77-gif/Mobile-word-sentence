/* =========================================================
 * App.Data - 통합 데이터 관리 모듈
 * Refactored: 2026-02-12 Phase 2
 * 
 * 통합된 파일:
 * - data_validator.js (검증)
 * - data_parser.js (파싱/로드)
 * - data_storage.js (저장/내보내기)
 * - data_io.js (파일 입력 이벤트)
 * ========================================================= */

(() => {
  'use strict';
  
  const W = window;
  const App = W.App = W.App || {};

  // ============================================
  // 📋 Validator (검증 및 정규화)
  // ============================================
  const Validator = {
    /**
     * 단어장 데이터 검증
     * @param {Array} items - 검증할 단어 배열
     * @returns {Object} { ok: boolean, reason: string, items: Array }
     */
    validateVocabulary(items) {
      if (!Array.isArray(items)) {
        return { ok: false, reason: 'not_array', items: [] };
      }
      
      const validItems = [];
      for (const item of items) {
        if (!item) continue;
        
        const word = (item.word ?? item.eng ?? '').toString().trim();
        const meaning = (item.meaning ?? item.kor ?? item.mean ?? '').toString().trim();
        
        if (!word) continue;
        
        validItems.push({
          ...item,
          word,
          meaning,
          m: !!item.m,
          s: !!item.s,
          g: item.g ?? item.group ?? undefined
        });
      }
      
      return {
        ok: validItems.length > 0,
        reason: validItems.length > 0 ? '' : 'empty',
        items: validItems
      };
    },

    /**
     * 회화 스크립트 검증
     * @param {Array} items - 검증할 회화 배열
     * @returns {Object} { ok: boolean, reason: string, items: Array }
     */
    validateDialog(items) {
      if (!Array.isArray(items)) {
        return { ok: false, reason: 'not_array', items: [] };
      }
      
      const validItems = [];
      for (const item of items) {
        if (!item) continue;
        
        const role = (item.role ?? '').toString().trim().toUpperCase();
        const text = (item.text ?? '').toString().trim();
        const translation = (item.translation ?? item.trans ?? '').toString().trim();
        
        if (!role || !text) continue;
        
        validItems.push({ role, text, translation });
      }
      
      return {
        ok: validItems.length > 0,
        reason: validItems.length > 0 ? '' : 'empty',
        items: validItems
      };
    }
  };

  // ============================================
  // 🔍 Parser (파일 형식 감지 및 파싱)
  // ============================================
  const Parser = {
    /**
     * 파일 형식 자동 감지
     * @param {Array} lines - 파일 줄 배열
     * @returns {string} 'vocabulary' | 'dialog' | 'unknown'
     */
    detectFileType(lines) {
      const sampleLines = lines
        .slice(0, 20)
        .map(l => l.trim())
        .filter(l => l.length > 0);
      
      let vocabScore = 0;
      let dialogScore = 0;
      
      for (const line of sampleLines) {
        if (/^\d+\s*[\.\s-]+/.test(line)) vocabScore += 2;
        if (/^[AB]\s*:\s*.+/i.test(line)) dialogScore += 2;
      }
      
      if (vocabScore > dialogScore && vocabScore >= 2) return 'vocabulary';
      if (dialogScore > vocabScore && dialogScore >= 2) return 'dialog';
      return 'unknown';
    },

    /**
     * 단어장 파싱
     * @param {string} content - 파일 내용
     * @returns {Array} 파싱된 단어 배열
     */
    parseVocabulary(content) {
      const lines = content
        .trim()
        .split('\n')
        .map(line => line.trim())
        .filter(line => line);
      
      const groups = {};
      
      lines.forEach(line => {
        const match = line.match(/^(\d+)\.(.*)/);
        if (match) {
          const num = parseInt(match[1]);
          const text = match[2].trim();
          
          if (!groups[num]) {
            groups[num] = { num, word: '', meaning: '' };
          }
          
          // 한글 감지
          if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(text)) {
            groups[num].meaning = text;
          } else {
            groups[num].word = text;
          }
        }
      });
      
      return Object.values(groups)
        .filter(item => item.word && item.meaning)
        .sort((a, b) => a.num - b.num)
        .map(item => ({
          num: item.num,
          word: item.word,
          meaning: item.meaning,
          m: false,
          w: 0,
          star: false,
          lastSeen: null,
          interval: 1,
          wrongDates: [],
          quizCount: 0,
          correctStreak: 0,
          totalCorrect: 0,
          isSafe: false
        }));
    },

    /**
     * 회화 스크립트 파싱
     * @param {string} content - 파일 내용
     * @returns {Array} 파싱된 회화 배열
     */
    parseDialog(content) {
      const lines = content.split(/\r?\n/);
      const dialogScript = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const match = line.match(/^(A|B):\s*(.+)/i);
        
        if (match) {
          const role = match[1].toUpperCase();
          const text = match[2].trim();
          
          let translation = '';
          if (i + 1 < lines.length) {
            const nextLine = lines[i + 1].trim();
            if (nextLine && !nextLine.match(/^(A|B):/i)) {
              translation = nextLine;
              i++;
            }
          }
          
          dialogScript.push({ role, text, translation });
        }
      }
      
      return dialogScript;
    }
  };

  // ============================================
  // 💾 Storage (로컬 저장 및 내보내기)
  // ============================================
  const DataStorage = {
    /**
     * 로컬 스토리지에 저장
     */
    saveLocal() {
      const fileName = App.State.getCurrentFileName();
      if (!fileName) return;
      
      const vocabulary = App.State.getVocabulary();
      const saveData = vocabulary.map(v => ({
        n: v.num,
        m: v.m,
        w: v.w,
        star: v.star,
        lastSeen: v.lastSeen,
        interval: v.interval,
        wrongDates: v.wrongDates,
        quizCount: v.quizCount,
        correctStreak: v.correctStreak,
        totalCorrect: v.totalCorrect,
        isSafe: v.isSafe
      }));
      
      W.Storage.setJSON('mem_' + fileName, saveData);
      
      // 현재 선택된 음성 저장
      const voiceSelect = document.getElementById('voiceSelect');
      if (voiceSelect && voiceSelect.value && W.currentStudyLang) {
        W.Storage.set('selectedVoice_' + W.currentStudyLang, voiceSelect.value);
      }
    },

    /**
     * 저장된 진행 상태 불러오기
     * @param {string} fileName - 파일명
     * @param {Array} vocabulary - 단어 배열
     */
    loadProgress(fileName, vocabulary) {
      const saved = W.Storage.get('mem_' + fileName);
      if (!saved) return;
      
      try {
        const savedData = JSON.parse(saved);
        savedData.forEach(d => {
          // 기존 저장 데이터 하위호환 처리 (eng/kor → word/meaning)
          if (d.eng && !d.word) d.word = d.eng;
          if (d.kor && !d.meaning) d.meaning = d.kor;
          const item = vocabulary.find(v => v.num === d.n);
          if (item) {
            item.m = d.m;
            item.w = d.w;
            item.star = d.star || false;
            if (d.lastSeen) item.lastSeen = d.lastSeen;
            if (d.interval) item.interval = d.interval;
            if (d.wrongDates) item.wrongDates = d.wrongDates;
            if (d.quizCount !== undefined) item.quizCount = d.quizCount;
            if (d.correctStreak !== undefined) item.correctStreak = d.correctStreak;
            if (d.totalCorrect !== undefined) item.totalCorrect = d.totalCorrect;
            if (d.isSafe !== undefined) item.isSafe = d.isSafe;
          }
        });
      } catch (e) {
        console.error('진행 상태 로드 실패:', e);
      }
    },

    /**
     * JSON으로 내보내기
     */
    exportData() {
      const vocabulary = App.State.getVocabulary();
      if (vocabulary.length === 0) {
        alert(W.UI_TEXT?.[W.currentUILang]?.noData || '데이터가 없습니다');
        return;
      }
      
      const fileName = App.State.getCurrentFileName();
      const exportData = vocabulary.map(v => ({
        n: v.num,
        m: v.m,
        w: v.w,
        star: v.star,
        lastSeen: v.lastSeen,
        interval: v.interval,
        wrongDates: v.wrongDates,
        quizCount: v.quizCount,
        correctStreak: v.correctStreak,
        totalCorrect: v.totalCorrect,
        isSafe: v.isSafe
      }));
      
      const blob = new Blob([JSON.stringify(exportData)], {
        type: 'application/json'
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `save_${fileName}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      if (W.closePopup) W.closePopup('menuPopup');
    },

    /**
     * JSON에서 가져오기
     * @param {HTMLInputElement} input - 파일 입력 요소
     */
    importData(input) {
      const file = input.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          const vocabulary = App.State.getVocabulary();
          
          importedData.forEach(d => {
            const item = vocabulary.find(v => v.num === d.n);
            if (item) {
              item.m = d.m;
              item.w = d.w;
              item.star = d.star || false;
              if (d.lastSeen) item.lastSeen = d.lastSeen;
              if (d.interval) item.interval = d.interval;
              if (d.wrongDates) item.wrongDates = d.wrongDates;
              if (d.quizCount !== undefined) item.quizCount = d.quizCount;
              if (d.correctStreak !== undefined) item.correctStreak = d.correctStreak;
              if (d.totalCorrect !== undefined) item.totalCorrect = d.totalCorrect;
              if (d.isSafe !== undefined) item.isSafe = d.isSafe;
            }
          });
          
          App.State.setVocabulary(vocabulary);
          
          if (W.updateDisplay) W.updateDisplay();
          alert(W.UI_TEXT?.[W.currentUILang]?.dataLoaded || '데이터 로드 완료');
        } catch (err) {
          alert(W.UI_TEXT?.[W.currentUILang]?.invalidFile || '잘못된 파일 형식');
        }
      };
      reader.readAsText(file);
      
      if (W.closePopup) W.closePopup('menuPopup');
    }
  };

  // ============================================
  // 📂 Loader (파일 로드 메인 로직)
  // ============================================
  const Loader = {
    /**
     * 단어장 로드
     * @param {string} content - 파일 내용
     * @param {string} fileName - 파일명
     */
    loadVocabulary(content, fileName) {
      const cleanFileName = fileName.replace('.txt', '');
      App.State.setCurrentFileName(cleanFileName);
      
      // 파싱
      let vocabulary = Parser.parseVocabulary(content);
      
      // 검증
      const validation = Validator.validateVocabulary(vocabulary);
      vocabulary = validation.items;
      
      if (!validation.ok) {
        alert(
          W.UI_TEXT?.[W.currentUILang]?.invalidWordFile ||
          '단어 파일 형식이 올바르지 않습니다'
        );
      }
      
      // 저장된 진행 상태 로드
      DataStorage.loadProgress(cleanFileName, vocabulary);
      
      // 상태 업데이트
      App.State.setVocabulary(vocabulary);
      App.State.setCurrentIndex(0);
      
      // 회화 데이터 초기화
      App.State.setDialogScript([]);
      App.State.setDialogFileName('');
      
      // 캐시 초기화
      App.State.clearCache();
      
      // UI 업데이트
      const endIdxInput = document.getElementById('endIdx');
      if (endIdxInput) {
        endIdxInput.value = vocabulary.length;
      }
      
      if (W.setRangeAll) W.setRangeAll();
      
      const cardWord = document.getElementById('cardWord');
      if (cardWord) {
        cardWord.innerHTML = '';
        cardWord.style.fontSize = App.State.getSetting('fontSize') + 'px';
      }
      
      if (W.updateDisplay) W.updateDisplay();
      if (W.updateStats) W.updateStats();
      if (W.closePopup) W.closePopup('menuPopup');
      
      {
        const _t = W.UI_TEXT?.[W.currentUILang] || {};
        const _msg = _t.vocabLoaded ? `✅ ${_t.vocabLoaded}: ${vocabulary.length}` : `✅ 단어장 로드: ${vocabulary.length}개`;
        alert(_msg);
      }
    },

    /**
     * 회화 스크립트 로드
     * @param {string} content - 파일 내용
     * @param {string} fileName - 파일명
     */
    loadDialog(content, fileName) {
      App.State.setDialogFileName(fileName);
      
      // 파싱
      let dialogScript = Parser.parseDialog(content);
      
      // 검증
      const validation = Validator.validateDialog(dialogScript);
      dialogScript = validation.items;
      
      if (!validation.ok) {
        alert(
          W.UI_TEXT?.[W.currentUILang]?.invalidDialogFile ||
          '대화 파일 형식이 올바르지 않습니다'
        );
      }
      
      if (dialogScript.length === 0) {
        alert((W.UI_TEXT?.[W.currentUILang]?.noValidDialog) || '유효한 대화를 찾을 수 없습니다.\n형식: A: 영어문장\\n한글해석');
        return;
      }
      
      // 상태 업데이트
      App.State.setDialogScript(dialogScript);
      App.State.setCurrentIndex(0);
      
      // 단어장 데이터 초기화
      App.State.setVocabulary([]);
      App.State.setCurrentFileName('');
      
      // 캐시 초기화
      App.State.clearCache();
      
      // 모드 전환
      App.State.setCurrentMode('dialog');
      
      // 모드 버튼 UI 업데이트
      const modeButtons = document.querySelectorAll('.mode-btn');
      modeButtons.forEach(btn => btn.classList.remove('active'));
      const dialogBtn = Array.from(modeButtons).find(btn =>
        btn.textContent.includes('회화')
      );
      if (dialogBtn) dialogBtn.classList.add('active');
      
      // UI 업데이트
      if (W.updateDisplay) W.updateDisplay();
      if (W.closePopup) W.closePopup('menuPopup');
      
      {
        const _t = W.UI_TEXT?.[W.currentUILang] || {};
        const _msg = _t.dialogLoaded ? `✅ ${_t.dialogLoaded}: ${dialogScript.length}` : `✅ 회화 로드: ${dialogScript.length}줄`;
        alert(_msg);
      }
    }
  };

  // ============================================
  // 🎯 Public API
  // ============================================
  App.Data = {
    // Validator
    validateVocabulary: Validator.validateVocabulary,
    validateDialog: Validator.validateDialog,
    
    // Parser
    detectFileType: Parser.detectFileType,
    parseVocabulary: Parser.parseVocabulary,
    parseDialog: Parser.parseDialog,
    
    // Storage
    saveLocal: DataStorage.saveLocal,
    loadProgress: DataStorage.loadProgress,
    exportData: DataStorage.exportData,
    importData: DataStorage.importData,
    
    // Loader
    loadVocabulary: Loader.loadVocabulary,
    loadDialog: Loader.loadDialog
  };

  // ============================================
  // 📁 파일 입력 이벤트 리스너
  // ============================================
  const fileInput = document.getElementById('fileInput');
  if (fileInput) {
    fileInput.addEventListener('change', function(event) {
      const file = event.target.files[0];
      if (!file) return;
      
      const reader = new FileReader();
      
      reader.onerror = () => alert((W.UI_TEXT?.[W.currentUILang]?.fileReadError) || '파일 읽기 실패!');
      
      reader.onload = function(e) {
        try {
          const content = e.target.result;
          const lines = content.split(/\r?\n/);
          
          // 파일 형식 자동 감지
          const fileType = App.Data.detectFileType(lines);
          
          if (fileType === 'vocabulary') {
            App.Data.loadVocabulary(content, file.name);
          } else if (fileType === 'dialog') {
            App.Data.loadDialog(content, file.name);
          } else {
            {
              const _t2 = W.UI_TEXT?.[W.currentUILang] || {};
              alert(
                _t2.unknownFileFormat ||
                '파일 형식을 인식할 수 없습니다.\n\n단어장: "1. apple"\n회화: "A: Hello"'
              );
            }
          }
        } catch (err) {
          { const _t3 = W.UI_TEXT?.[W.currentUILang] || {}; alert((_t3.fileProcessError || '파일 처리 중 오류') + ': ' + err.message); }
        }
      };
      
      reader.readAsText(file, 'UTF-8');
    });
  }

  // ============================================
  // 🔗 Backward Compatibility (전역 함수)
  // ============================================
  W.validateVocabularyItems = Validator.validateVocabulary;
  W.validateDialogScriptItems = Validator.validateDialog;
  W.detectFileTypeMobile = Parser.detectFileType;
  W.loadVocabularyMobile = Loader.loadVocabulary;
  W.loadDialogMobile = Loader.loadDialog;
  W.saveLocal = DataStorage.saveLocal;
  W.exportData = DataStorage.exportData;
  W.importData = DataStorage.importData;
  W.clearCache = () => App.State.clearCache();
  W.getSettingsHash = () => {
    const settings = App.State.getSettings();
    const mode = App.State.getCurrentMode();
    return JSON.stringify({
      mode,
      unmem: settings.unmem,
      star: settings.star,
      safe: settings.safe,
      wrongRevive: settings.wrongRevive,
      wrongDays: settings.wrongDays,
      srsNew: settings.srsNewOnly,
      srsHard: settings.srsHardOnly
    });
  };

  // ============================================
  // 🎉 초기화 완료
  // ============================================
  console.debug('✅ App.Data initialized');

})();
