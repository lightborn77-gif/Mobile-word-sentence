// PDF 단어장 로더 v4
// pdfplumber extract_tables() 동등 로직을 PDF.js + 좌표 클러스터링으로 구현
// 표 구조: 번호 | 단어(어떤 언어든) | 뜻  ← 같은 번호 매칭 구조면 자동 인식
// 영어, 일본어, 중국어, 스페인어, 프랑스어 등 모든 언어 지원

(function () {
  'use strict';

  // ── PDF.js 로드 ───────────────────────────────────────────────
  function _ensurePdfJs(cb) {
    if (window.pdfjsLib) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = function () {
      window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      cb();
    };
    s.onerror = function () { alert('PDF.js 로드 실패. 인터넷 연결 확인.'); };
    document.head.appendChild(s);
  }

  // ── 유틸 ─────────────────────────────────────────────────────
  function _isDigit(t) {
    return /^\d+$/.test(t);
  }
  function _cleanMeaning(s) {
    return s.replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  }

  // ── 핵심 파싱 ─────────────────────────────────────────────────
  // PDF.js 텍스트 아이템 → pdfplumber extract_tables() 동등 결과
  //
  // 전략:
  //   1) 모든 아이템을 Y좌표(±4px)로 행 그룹핑
  //   2) 각 행을 X좌표로 정렬
  //   3) 페이지 중앙(mid_x) 기준으로 왼쪽(번호+영단어) / 오른쪽(뜻) 분리
  //   4) 왼쪽에서 숫자=번호, 번호 외 첫 번째 셀=단어(언어 무관) / 오른쪽=뜻
  //   5) 셀 내 줄바꿈(continuation) 처리: 오른쪽 단만 있는 행은 직전 번호에 붙임
  //      단, 직후에 번호 행이 바로 이어지면 직후 번호에 붙임

  async function _parsePdf(arrayBuffer) {
    const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const vocabMap = {};

    for (let p = 1; p <= pdf.numPages; p++) {
      const page     = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 1 });
      const content  = await page.getTextContent();
      const midX     = viewport.width / 2;

      // 1) 아이템 수집
      const items = content.items
        .filter(i => i.str && i.str.trim())
        .map(i => ({ x: i.transform[4], y: i.transform[5], text: i.str.trim() }));

      // 2) Y 기준 행 그룹핑 (±4px)
      const rowMap = {};
      for (const it of items) {
        const ry = Math.round(it.y);
        let key = null;
        for (const k of Object.keys(rowMap)) {
          if (Math.abs(+k - ry) <= 4) { key = k; break; }
        }
        if (key === null) { key = ry; rowMap[key] = []; }
        rowMap[key].push(it);
      }

      // 3) Y 내림차순 정렬 (PDF Y = 아래→위, 내림차순 = 문서 위→아래)
      const rows = Object.values(rowMap)
        .sort((a, b) => b[0].y - a[0].y)
        .map(r => r.slice().sort((a, b) => a.x - b.x));

      // 4) 각 행 파싱
      const parsed = rows.map(row => {
        const leftRow  = row.filter(i => i.x < midX);
        const rightRow = row.filter(i => i.x >= midX && !_isDigit(i.text));
        const allRight = rightRow.length > 0 && leftRow.length === 0;

        const numText  = (leftRow.find(i => _isDigit(i.text)) || {}).text;
        const num      = numText ? parseInt(numText) : null;
        // 번호가 아닌 셀 중 첫 번째 = 단어 (언어 무관)
        const nonNumCells = leftRow.filter(i => !_isDigit(i.text));
        const wordText = nonNumCells.length > 0 ? nonNumCells.map(i => i.text).join(' ') : null;
        const meaning  = _cleanMeaning(rightRow.map(i => i.text).join(' '));

        return { num, word: wordText, meaning, allRight };
      });

      // 5) 번호+단어 있는 행 먼저 등록 (2-pass)
      for (const pr of parsed) {
        if (pr.num && pr.word) {
          if (!vocabMap[pr.num]) {
            vocabMap[pr.num] = { num: pr.num, word: pr.word, meaning: pr.meaning };
          } else if (pr.meaning) {
            vocabMap[pr.num].meaning = (vocabMap[pr.num].meaning + ' ' + pr.meaning).trim();
          }
        }
      }

      // 6) continuation 행 처리 (3-pass)
      for (let i = 0; i < parsed.length; i++) {
        const pr = parsed[i];
        if (pr.num || pr.word || !pr.meaning) continue;
        if (!pr.allRight) continue;

        // 직전 번호
        let prevNum = null;
        for (let j = i - 1; j >= 0; j--) {
          if (parsed[j].num) { prevNum = parsed[j].num; break; }
        }
        // 직후 번호
        let nextNum = null;
        for (let j = i + 1; j < parsed.length; j++) {
          if (parsed[j].num) { nextNum = parsed[j].num; break; }
        }

        // 직전 번호에 붙임 (오른쪽 단 continuation은 항상 직전 번호의 뜻)
        const target = prevNum;
        if (target && vocabMap[target]) {
          vocabMap[target].meaning = _cleanMeaning(vocabMap[target].meaning + ' ' + pr.meaning);
        }
      }
    }

    // 7) 정리
    return Object.values(vocabMap)
      .filter(v => v.word && v.meaning)
      .sort((a, b) => a.num - b.num)
      .map(v => ({
        num: v.num,
        word: v.word,
        meaning: v.meaning,
        w: 0, m: false, wrongDates: [],
        quizCount: 0, correctStreak: 0, totalCorrect: 0, isSafe: false,
        lastSeen: null, interval: 1, ease: 2.5
      }));
  }

  // ── 앱에 반영 ─────────────────────────────────────────────────
  function _applyVocabulary(vocabulary, fileName) {
    const App = window.App || {};

    // 저장 데이터 복원
    const saved = Storage.get('mem_' + fileName);
    if (saved) {
      try {
        JSON.parse(saved).forEach(s => {
          const it = vocabulary.find(v => v.num === (s.n || s.num));
          if (!it) return;
          ['m','w','lastSeen','interval','wrongDates','quizCount',
           'correctStreak','totalCorrect','isSafe'].forEach(k => {
            if (s[k] !== undefined) it[k] = s[k];
          });
        });
      } catch (e) {
        console.warn('[pdf_loader] 저장 데이터 파싱 실패:', e);
      }
    }

    // State 세팅
    if (App.State && App.State.setVocab) {
      App.State.setVocab(vocabulary, fileName);
      if (App.State.setDialog) App.State.setDialog([], '');
    } else {
      window.vocabulary      = vocabulary;
      window.currentFileName = fileName;
      window.dialogScript    = [];
      window.dialogFileName  = '';
    }

    // UI 업데이트
    const s = document.getElementById('startIdx');
    const e = document.getElementById('endIdx');
    if (s) s.value = vocabulary[0].num;
    if (e) e.value = vocabulary[vocabulary.length - 1].num;

    const stMsg = document.getElementById('stMsg');
    if (stMsg) stMsg.innerText = `✅ PDF 로드 완료: ${vocabulary.length}개 단어`;

    if (typeof clearCache    === 'function') clearCache();
    if (typeof window.currentIndex !== 'undefined') window.currentIndex = 0;
    if (typeof getFiltered   === 'function') {
      try { window.currentPool = getFiltered(); } catch (_) {}
    }
    if (typeof updateDisplay === 'function') updateDisplay();
    setTimeout(() => { if (typeof updateDisplay === 'function') updateDisplay(); }, 80);
    if (typeof updateStats   === 'function') updateStats();
  }

  function _onFileLoaded(arrayBuffer, fileName) {
    const stMsg = document.getElementById('stMsg');
    if (stMsg) stMsg.innerText = '⏳ PDF 파싱 중...';

    _parsePdf(arrayBuffer).then(vocab => {
      if (!vocab.length) {
        alert('단어를 찾지 못했습니다.\n번호·영단어·뜻이 표 형식으로 된 PDF인지 확인하세요.');
        if (stMsg) stMsg.innerText = '❌ 단어 없음';
        return;
      }
      _applyVocabulary(vocab, fileName);
    }).catch(err => {
      console.error('PDF 파싱 오류:', err);
      alert('PDF 파싱 오류: ' + err.message);
      if (stMsg) stMsg.innerText = '❌ 파싱 오류';
    });
  }

  // ── 외부 인터페이스 ──────────────────────────────────────────
  window.PDFLoader = {
    triggerPdfInput: function () {
      let inp = document.getElementById('pdfFileInput');
      if (!inp) {
        inp = document.createElement('input');
        inp.type    = 'file';
        inp.id      = 'pdfFileInput';
        inp.accept  = '.pdf';
        inp.style.display = 'none';
        inp.onchange = function (e) {
          const file = e.target.files[0];
          if (!file) return;
          inp.value = '';
          const reader = new FileReader();
          reader.onload = ev => {
            _ensurePdfJs(() => _onFileLoaded(ev.target.result, file.name));
          };
          reader.readAsArrayBuffer(file);
        };
        document.body.appendChild(inp);
      }
      inp.click();
    }
  };

})();
