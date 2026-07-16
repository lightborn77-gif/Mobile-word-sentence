/**
 * modules/wordEditor/wordEditor.js
 *
 * 단어 "추가/편집" 화면.
 * - 단어/뜻/파생어/예문을 한 "세트"로 묶어 여러 개를 한 번에 폼으로
 *   생성하고, 필요한 만큼 채운 뒤 저장한다.
 * - 저장된 리스트(wordLists)를 편집 모드로 불러오면 기존 단어들이
 *   세트 폼에 값이 채워진 채로 나타나고, 그 아래에 새 세트를 추가로
 *   생성해 이어서 작성할 수 있다.
 *
 * core(wordStore)만 참조하며, 다른 모듈의 내부 코드는 참조하지 않는다
 * (아키텍처 원칙 유지).
 *
 * ── 세트 ↔ 단어 객체 변환 규칙 ──────────────────────────────
 * core/dataParser.js가 텍스트 파일을 파싱해 만드는 단어 객체와 동일한
 * 형태로 데이터를 "직접 조립"한다(파일을 거치지 않고 최종 형태를 바로
 * 만든다는 뜻). 파생어 유형 접두 규칙(-반의어, =유의어, &파생어, 접두
 * 없음=기타)과 "*"(단어*뜻 구분), 예문의 ">"(문장>해석 구분) 규칙은
 * dataParser와 동일하게 맞춘다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../core/wordStore.js'), require('../../core/htmlUtil.js'));
  } else {
    root.wordEditorModule = factory(root.wordStore, root.htmlUtil);
  }
})(typeof self !== 'undefined' ? self : this, function (wordStore, htmlUtil) {
  'use strict';

  const DERIV_TYPES = [
    { value: 'synonym', label: '유의어', prefix: '=' },
    { value: 'antonym', label: '반의어', prefix: '-' },
    { value: 'derived', label: '파생어', prefix: '&' },
    { value: 'other', label: '기타', prefix: '' },
  ];

  let uidCounter = 0;
  function nextUid() {
    uidCounter += 1;
    return 'set_' + Date.now() + '_' + uidCounter;
  }
  function nextDerivUid() {
    uidCounter += 1;
    return 'deriv_' + Date.now() + '_' + uidCounter;
  }

  /**
   * 세트 하나의 초기 상태를 만든다.
   * existingWord가 주어지면(편집 모드) 그 값으로 채운다.
   *
   * @param {object|null} existingWord - dataParser 형식의 단어 객체
   * @returns {object} 세트 상태
   */
  function makeSet(existingWord) {
    const set = {
      uid: nextUid(),
      // id가 null이면 "신규"로 간주하여 저장 시 시작번호부터 자동 채번된다.
      // 편집 모드로 불러온 기존 단어는 원래 id를 그대로 보존한다.
      id: existingWord ? existingWord.id : null,
      isExisting: !!existingWord,
      word: existingWord ? existingWord.word || '' : '',
      meaning: existingWord ? existingWord.meaning || '' : '',
      derivRows: [],
      exampleSentence: existingWord && existingWord.example ? existingWord.example.sentence || '' : '',
      exampleTranslation: existingWord && existingWord.example ? existingWord.example.translation || '' : '',
    };

    if (existingWord && existingWord.derivatives) {
      const d = existingWord.derivatives;
      const typeKeyMap = { synonym: 'synonyms', antonym: 'antonyms', derived: 'derived', other: 'other' };
      for (const typeInfo of DERIV_TYPES) {
        const arr = d[typeKeyMap[typeInfo.value]] || [];
        for (const item of arr) {
          set.derivRows.push({
            uid: nextDerivUid(),
            type: typeInfo.value,
            text: item.text || '',
            meaning: item.meaning || '',
          });
        }
      }
    }

    return set;
  }

  function makeDerivRow() {
    return { uid: nextDerivUid(), type: 'synonym', text: '', meaning: '' };
  }

  /**
   * 세트가 "완전히 빈 세트"인지 판단한다. 단어/뜻/파생어/예문 중
   * 무엇 하나라도 값이 있으면 빈 세트가 아니다.
   */
  function isSetEmpty(set) {
    if (set.word.trim() !== '') return false;
    if (set.meaning.trim() !== '') return false;
    if (set.exampleSentence.trim() !== '') return false;
    if (set.exampleTranslation.trim() !== '') return false;
    for (const row of set.derivRows) {
      if (row.text.trim() !== '' || row.meaning.trim() !== '') return false;
    }
    return true;
  }

  /**
   * 세트를 dataParser 형식의 단어 객체로 변환한다.
   * id는 호출부에서 미리 배정해 넘겨준다.
   *
   * @param {object} set
   * @param {number} id
   * @returns {object}
   */
  function setToWordObject(set, id) {
    const derivatives = { antonyms: [], synonyms: [], derived: [], other: [] };
    const typeKeyMap = { synonym: 'synonyms', antonym: 'antonyms', derived: 'derived', other: 'other' };

    for (const row of set.derivRows) {
      const text = row.text.trim();
      if (text === '') continue; // 값 없는 파생어 행은 저장에서 생략(폼에는 계속 남아있음)
      derivatives[typeKeyMap[row.type]].push({ text, meaning: row.meaning.trim() });
    }

    const sentence = set.exampleSentence.trim();
    const translation = set.exampleTranslation.trim();

    return {
      id,
      word: set.word.trim(),
      meaning: set.meaning.trim(),
      derivatives,
      example: { sentence, translation: sentence ? translation : '' },
    };
  }

  /**
   * 편집기 화면을 containerEl 내부에 마운트한다.
   *
   * @param {HTMLElement} containerEl
   * @param {object} [options]
   * @param {{id:number, name:string, words:Array}} [options.list] - 편집 모드로 열 때
   *        불러올 저장된 리스트(words 포함). 없으면 "신규 추가" 모드로 빈 화면에서 시작.
   * @param {() => void} [options.onClose] - 닫기/뒤로가기 버튼 클릭 시 호출.
   * @param {(info:{listId:number, name:string, wordCount:number}) => void} [options.onSaved] -
   *        저장 완료 후 호출(상위가 리스트 패널/단어 목록 탭을 새로고침할 수 있게).
   * @returns {{ destroy: () => void }}
   */
  function mount(containerEl, options) {
    if (!containerEl) {
      throw new Error('wordEditorModule.mount: containerEl이 필요합니다.');
    }

    const opts = options || {};
    let editingList = opts.list || null;

    // 세트 배열: 편집 모드면 기존 단어들로 미리 채워서 시작.
    let sets = [];
    if (editingList && Array.isArray(editingList.words)) {
      sets = editingList.words
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((w) => makeSet(w));
    }
    if (sets.length === 0) {
      sets.push(makeSet(null));
    }

    let saveTarget = editingList ? 'append' : 'new'; // 'append' | 'new'
    let newListName = editingList ? '' : '';

    containerEl.innerHTML = buildMarkup(editingList);

    const els = {
      title: containerEl.querySelector('[data-we="title"]'),
      subtitle: containerEl.querySelector('[data-we="subtitle"]'),
      closeButton: containerEl.querySelector('[data-we="closeButton"]'),
      setsWrapper: containerEl.querySelector('[data-we="setsWrapper"]'),
      addCountInput: containerEl.querySelector('[data-we="addCountInput"]'),
      addSetsButton: containerEl.querySelector('[data-we="addSetsButton"]'),
      startIdInput: containerEl.querySelector('[data-we="startIdInput"]'),
      endIdInput: containerEl.querySelector('[data-we="endIdInput"]'),
      autoCleanCheckbox: containerEl.querySelector('[data-we="autoCleanCheckbox"]'),
      saveTargetAppend: containerEl.querySelector('[data-we="saveTargetAppend"]'),
      saveTargetNew: containerEl.querySelector('[data-we="saveTargetNew"]'),
      newListNameInput: containerEl.querySelector('[data-we="newListNameInput"]'),
      appendTargetLabel: containerEl.querySelector('[data-we="appendTargetLabel"]'),
      saveButton: containerEl.querySelector('[data-we="saveButton"]'),
      statusLine: containerEl.querySelector('[data-we="statusLine"]'),
    };

    let destroyed = false;

    init();

    function init() {
      els.closeButton.addEventListener('click', () => {
        if (typeof opts.onClose === 'function') opts.onClose();
      });
      els.addSetsButton.addEventListener('click', handleAddSetsClicked);
      els.saveTargetAppend.addEventListener('change', updateSaveTargetUI);
      els.saveTargetNew.addEventListener('change', updateSaveTargetUI);
      els.saveButton.addEventListener('click', handleSaveClicked);

      if (!editingList) {
        els.saveTargetAppend.parentElement.style.display = 'none';
        saveTarget = 'new';
        els.saveTargetNew.checked = true;
      }

      updateSaveTargetUI();
      renderSets();
    }

    function destroy() {
      destroyed = true;
    }

    // ── 세트 목록 렌더링 ──────────────────────────────────────

    function renderSets() {
      els.setsWrapper.innerHTML = '';
      sets.forEach((set, index) => {
        els.setsWrapper.appendChild(buildSetCard(set, index));
      });
      updateSummary();
    }

    function updateSummary() {
      const total = sets.length;
      const filled = sets.filter((s) => !isSetEmpty(s)).length;
      els.subtitle.textContent = editingList
        ? `"${editingList.name}" 편집 중 · 세트 ${total}개 (작성됨 ${filled}개)`
        : `새 단어 추가 · 세트 ${total}개 (작성됨 ${filled}개)`;
    }

    function buildSetCard(set, index) {
      const card = document.createElement('div');
      card.className = 'we-set-card';
      card.dataset.setUid = set.uid;

      // 헤더
      const header = document.createElement('div');
      header.className = 'we-set-header';

      const badge = document.createElement('span');
      badge.className = 'we-set-badge' + (set.isExisting ? ' existing' : ' newbadge');
      badge.textContent = set.isExisting ? `#${set.id} (기존)` : `세트 ${index + 1} (신규)`;
      header.appendChild(badge);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-ghost we-delete-set-btn';
      delBtn.textContent = '✕ 이 세트 삭제';
      delBtn.addEventListener('click', () => {
        sets = sets.filter((s) => s.uid !== set.uid);
        if (sets.length === 0) sets.push(makeSet(null));
        renderSets();
      });
      header.appendChild(delBtn);

      card.appendChild(header);

      // 단어 / 뜻
      const row1 = document.createElement('div');
      row1.className = 'we-row we-row-2';
      row1.appendChild(buildLabeledInput('단어', set.word, (v) => { set.word = v; updateSummary(); }, '예: abandon'));
      row1.appendChild(buildLabeledInput('단어 뜻', set.meaning, (v) => { set.meaning = v; updateSummary(); }, '예: 버리다, 포기하다'));
      card.appendChild(row1);

      // 파생어 섹션
      card.appendChild(buildDerivSection(set));

      // 예문 섹션
      const row3 = document.createElement('div');
      row3.className = 'we-row we-row-2';
      row3.appendChild(buildLabeledInput('예문', set.exampleSentence, (v) => { set.exampleSentence = v; updateSummary(); }, '예: She abandoned the plan.'));
      row3.appendChild(buildLabeledInput('예문 해석', set.exampleTranslation, (v) => { set.exampleTranslation = v; updateSummary(); }, '예: 그녀는 계획을 포기했다.'));
      card.appendChild(row3);

      return card;
    }

    function buildLabeledInput(labelText, value, onChange, placeholder) {
      const wrap = document.createElement('div');
      wrap.className = 'we-field';

      const label = document.createElement('label');
      label.textContent = labelText;
      wrap.appendChild(label);

      const input = document.createElement('input');
      input.type = 'text';
      input.value = value;
      input.placeholder = placeholder || '';
      input.addEventListener('input', () => onChange(input.value));
      wrap.appendChild(input);

      return wrap;
    }

    function buildDerivSection(set) {
      const section = document.createElement('div');
      section.className = 'we-deriv-section';

      const secHeader = document.createElement('div');
      secHeader.className = 'we-deriv-header';

      const secLabel = document.createElement('span');
      secLabel.className = 'we-deriv-label';
      secLabel.textContent = '파생어 / 유의어 / 반의어';
      secHeader.appendChild(secLabel);

      const countInput = document.createElement('input');
      countInput.type = 'number';
      countInput.min = '1';
      countInput.value = '1';
      countInput.className = 'we-deriv-count-input';
      secHeader.appendChild(countInput);

      const addBtn = document.createElement('button');
      addBtn.type = 'button';
      addBtn.className = 'btn-secondary we-add-deriv-btn';
      addBtn.textContent = '+ 필드 추가';
      addBtn.addEventListener('click', () => {
        const n = Math.max(1, Math.min(50, parseInt(countInput.value, 10) || 1));
        for (let i = 0; i < n; i++) {
          set.derivRows.push(makeDerivRow());
        }
        renderSets();
      });
      secHeader.appendChild(addBtn);

      section.appendChild(secHeader);

      const rowsWrap = document.createElement('div');
      rowsWrap.className = 'we-deriv-rows';

      if (set.derivRows.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'we-deriv-empty-hint';
        hint.textContent = '아직 추가된 파생어/유의어/반의어 필드가 없습니다.';
        rowsWrap.appendChild(hint);
      }

      set.derivRows.forEach((row) => {
        rowsWrap.appendChild(buildDerivRow(set, row));
      });

      section.appendChild(rowsWrap);
      return section;
    }

    function buildDerivRow(set, row) {
      const rowEl = document.createElement('div');
      rowEl.className = 'we-deriv-row';

      const select = document.createElement('select');
      DERIV_TYPES.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.value;
        opt.textContent = t.label;
        if (t.value === row.type) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', () => { row.type = select.value; });
      rowEl.appendChild(select);

      const textInput = document.createElement('input');
      textInput.type = 'text';
      textInput.placeholder = '단어';
      textInput.value = row.text;
      textInput.addEventListener('input', () => { row.text = textInput.value; updateSummary(); });
      rowEl.appendChild(textInput);

      const meaningInput = document.createElement('input');
      meaningInput.type = 'text';
      meaningInput.placeholder = '뜻(선택)';
      meaningInput.value = row.meaning;
      meaningInput.addEventListener('input', () => { row.meaning = meaningInput.value; });
      rowEl.appendChild(meaningInput);

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'btn-ghost we-delete-deriv-btn';
      delBtn.textContent = '✕';
      delBtn.title = '이 파생어 필드 삭제';
      delBtn.addEventListener('click', () => {
        set.derivRows = set.derivRows.filter((r) => r.uid !== row.uid);
        renderSets();
      });
      rowEl.appendChild(delBtn);

      return rowEl;
    }

    // ── 세트 추가 ──────────────────────────────────────────────

    function handleAddSetsClicked() {
      const n = Math.max(1, Math.min(200, parseInt(els.addCountInput.value, 10) || 1));
      for (let i = 0; i < n; i++) {
        sets.push(makeSet(null));
      }
      renderSets();
      // 방금 추가된 첫 세트로 스크롤
      const cards = els.setsWrapper.querySelectorAll('.we-set-card');
      if (cards.length > 0) {
        cards[cards.length - n] && cards[cards.length - n].scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }

    // ── 저장 대상(현재 리스트에 이어붙이기 / 새 리스트) ──────────

    function updateSaveTargetUI() {
      saveTarget = els.saveTargetNew.checked ? 'new' : 'append';
      els.newListNameInput.style.display = saveTarget === 'new' ? '' : 'none';
      if (els.appendTargetLabel) {
        els.appendTargetLabel.style.display = saveTarget === 'append' ? '' : 'none';
      }
    }

    // ── 저장 ──────────────────────────────────────────────────

    function handleSaveClicked() {
      setStatus('', 'neutral');

      const autoClean = els.autoCleanCheckbox.checked;

      // 1) 완전히 빈 세트는 자동 정리 대상에서 제외(옵션이 켜져 있을 때만 필터링해서 저장 대상 산출).
      //    autoClean이 꺼져 있어도 "완전히 빈 세트"는 애초에 저장할 데이터가 없으므로 항상 제외한다.
      const candidateSets = sets.filter((s) => !isSetEmpty(s));

      if (candidateSets.length === 0) {
        setStatus('저장할 내용이 없습니다. 최소 한 세트에 단어를 입력해주세요.', 'error');
        return;
      }

      // 2) 신규 세트(기존 id 없음)와 기존 세트(id 있음)를 분리.
      const existingOnes = candidateSets.filter((s) => s.isExisting && s.id !== null);
      const newOnes = candidateSets.filter((s) => !(s.isExisting && s.id !== null));

      // 3) 신규 세트에 번호 부여.
      const startVal = els.startIdInput.value.trim();
      const endVal = els.endIdInput.value.trim();

      let assignedIds = [];
      if (newOnes.length > 0) {
        if (startVal === '') {
          setStatus('신규 단어가 있습니다. 시작 번호를 입력해주세요.', 'error');
          return;
        }
        const start = parseInt(startVal, 10);
        if (!Number.isFinite(start) || start < 1) {
          setStatus('시작 번호는 1 이상의 숫자여야 합니다.', 'error');
          return;
        }

        if (endVal !== '') {
          const end = parseInt(endVal, 10);
          if (!Number.isFinite(end) || end < start) {
            setStatus('끝 번호는 시작 번호보다 크거나 같은 숫자여야 합니다.', 'error');
            return;
          }
          const expectedCount = end - start + 1;
          if (expectedCount !== newOnes.length) {
            setStatus(
              `번호 범위(${start}~${end} = ${expectedCount}개)와 작성된 신규 세트 수(${newOnes.length}개)가 일치하지 않습니다. 끝 번호를 비워두면 자동으로 채번됩니다.`,
              'error'
            );
            return;
          }
        }

        for (let i = 0; i < newOnes.length; i++) {
          assignedIds.push(start + i);
        }

        // 기존 id와 충돌 확인
        const existingIdsInList = new Set((editingList && editingList.words ? editingList.words : []).map((w) => w.id));
        const conflict = assignedIds.find((id) => existingIdsInList.has(id));
        if (conflict !== undefined) {
          const proceed = window.confirm(
            `번호 ${conflict}번은 이미 사용 중입니다. 계속 저장하면 해당 번호의 기존 단어가 새 내용으로 덮어써집니다. 계속할까요?`
          );
          if (!proceed) return;
        }
      }

      // 4) 세트 → 단어 객체 변환
      const wordObjects = [];
      existingOnes.forEach((s) => wordObjects.push(setToWordObject(s, s.id)));
      newOnes.forEach((s, i) => wordObjects.push(setToWordObject(s, assignedIds[i])));

      /**
       * 저장 성공 후, 방금 저장에 사용된 신규 세트들을 "기존 세트"로 전환한다.
       * 이렇게 해야 저장 직후 같은 화면에서 계속 편집을 이어가다 다시 저장을
       * 눌러도, 방금 저장한 세트가 또 "신규 번호"를 요구하지 않고 원래
       * 배정받은 id로 갱신되는 정상적인 흐름을 탄다.
       */
      function markSetsAsSaved() {
        newOnes.forEach((s, i) => {
          s.id = assignedIds[i];
          s.isExisting = true;
        });
        renderSets();
      }

      // 5) 저장 대상에 따라 처리
      els.saveButton.disabled = true;
      setStatus('저장 중...', 'neutral');

      if (saveTarget === 'append' && editingList) {
        // 현재 리스트에 이어붙이기: 기존 words + 이번에 저장한 단어(같은 id는 갱신)로 병합.
        // 활성 단어장(words 스토어)은 건드리지 않는다 — "저장"은 그 리스트 자체의
        // 데이터만 갱신하고, 화면(메인 표)에 반영하려면 저장된 리스트 패널에서
        // [불러오기]를 눌러 명시적으로 불러오는 기존 흐름을 그대로 따른다.
        const merged = new Map((editingList.words || []).map((w) => [w.id, w]));
        wordObjects.forEach((w) => merged.set(w.id, w));
        const mergedWords = Array.from(merged.values()).sort((a, b) => a.id - b.id);

        // 다국어 TTS: lang을 넘기지 않으면 wordStore.saveWordList가 기존
        // 리스트(editingList.id)의 발음 언어를 그대로 유지한다.
        wordStore.saveWordList(editingList.name, mergedWords, editingList.id)
          .then(() => {
            editingList.words = mergedWords;
            markSetsAsSaved();
            setStatus(`저장 완료: "${editingList.name}"에 ${wordObjects.length}개 세트를 반영했습니다.`, 'success');
            if (typeof opts.onSaved === 'function') {
              opts.onSaved({ listId: editingList.id, name: editingList.name, wordCount: mergedWords.length });
            }
          })
          .catch((err) => {
            console.error(err);
            setStatus('저장 중 오류가 발생했습니다: ' + err.message, 'error');
          })
          .finally(() => {
            els.saveButton.disabled = false;
          });
      } else {
        // 새 리스트로 저장. 이 경우도 활성 단어장(words 스토어)은 건드리지 않는다.
        const name = els.newListNameInput.value.trim() || (editingList ? editingList.name + ' 사본' : '새 단어 리스트');

        // 다국어 TTS: 이 화면에는 별도 언어 선택 UI가 없으므로 lang을
        // 넘기지 않는다 — wordStore.saveWordList가 DEFAULT_LANG('en-US')으로
        // 저장한다. 필요하면 저장된 리스트 패널에서 언어를 다시 지정할 수 있다
        // (업로드 저장 화면의 saveLangSelect와 동일한 값 체계를 공유).
        wordStore.saveWordList(name, wordObjects)
          .then((newListId) => {
            // 새로 생성된 리스트를 "현재 편집 대상"으로 전환한다. 이렇게 해야
            // 저장 직후 같은 화면에서 계속 편집하다 다시 저장할 때, 자동으로
            // "방금 만든 이 새 리스트에 이어붙이기"가 가능한 상태가 된다.
            editingList = { id: newListId, name, createdAt: Date.now(), words: wordObjects.slice() };
            markSetsAsSaved();

            els.saveTargetAppend.parentElement.style.display = '';
            els.saveTargetAppend.checked = true;
            updateSaveTargetUI();
            if (els.appendTargetLabel) {
              els.appendTargetLabel.textContent = `현재 리스트("${name}")에 이어붙여 저장`;
            }
            els.title.textContent = '단어 편집';
            updateSummary();

            setStatus(`저장 완료: 새 리스트 "${name}"(${wordObjects.length}개 단어)로 저장했습니다.`, 'success');
            if (typeof opts.onSaved === 'function') {
              opts.onSaved({ listId: newListId, name, wordCount: wordObjects.length });
            }
          })
          .catch((err) => {
            console.error(err);
            setStatus('저장 중 오류가 발생했습니다: ' + err.message, 'error');
          })
          .finally(() => {
            els.saveButton.disabled = false;
          });
      }
    }

    function setStatus(text, kind) {
      els.statusLine.textContent = text;
      els.statusLine.className = 'we-status-line' + (kind === 'error' ? ' error' : kind === 'success' ? ' success' : '');
    }

    return { destroy };
  }

  const escapeHtml = htmlUtil.escapeHtml;

  function buildMarkup(editingList) {
    return `
      <div class="we-panel">
        <div class="we-top-header">
          <div>
            <h2 data-we="title">${editingList ? '단어 편집' : '단어 추가'}</h2>
            <p class="we-subtitle" data-we="subtitle"></p>
          </div>
          <button type="button" class="btn-ghost" data-we="closeButton">← 목록으로 돌아가기</button>
        </div>

        <div class="we-toolbar">
          <label>추가할 개수</label>
          <input type="number" min="1" max="200" value="1" data-we="addCountInput" class="we-count-input">
          <button type="button" class="btn-secondary" data-we="addSetsButton">+ 세트 추가</button>
        </div>

        <div class="we-sets-wrapper" data-we="setsWrapper"></div>

        <div class="we-save-panel">
          <div class="we-save-row">
            <label>신규 세트 번호</label>
            <span class="we-id-label">시작</span>
            <input type="number" min="1" data-we="startIdInput" class="we-id-input">
            <span class="we-id-label">끝(선택, 비우면 자동)</span>
            <input type="number" min="1" data-we="endIdInput" class="we-id-input">
          </div>

          <div class="we-save-row">
            <label class="we-checkbox-label">
              <input type="checkbox" data-we="autoCleanCheckbox" checked>
              저장 시 완전히 빈 세트는 자동으로 제외
            </label>
          </div>

          <div class="we-save-row we-target-row">
            <label class="we-radio-label">
              <input type="radio" name="we-save-target" data-we="saveTargetAppend" checked>
              <span data-we="appendTargetLabel">${editingList ? `현재 리스트("${escapeHtml(editingList.name)}")에 이어붙여 저장` : '현재 리스트에 이어붙여 저장'}</span>
            </label>
            <label class="we-radio-label">
              <input type="radio" name="we-save-target" data-we="saveTargetNew">
              새 리스트로 저장
            </label>
            <input type="text" placeholder="새 리스트 이름" data-we="newListNameInput" class="we-list-name-input" style="display:none;">
          </div>

          <div class="we-save-row">
            <button type="button" class="btn-primary we-save-button" data-we="saveButton">저장</button>
            <span class="we-status-line" data-we="statusLine"></span>
          </div>
        </div>
      </div>
    `;
  }

  return { mount };
});
