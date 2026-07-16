/**
 * modules/sentenceLists/sentenceLists.js
 *
 * 문장 목록 UI 모듈. modules/wordLists/wordLists.js의 구조를 그대로
 * 따르되, 문장 버전이다. 오직 core/sentenceStore.js(및 core/sentenceParser.js)만
 * 참조하며, wordLists.js/wordStore.js 등 단어 관련 모듈/코어는 전혀 참조하지
 * 않는다(완전히 독립된 모듈).
 *
 * wordLists.js와 달리 이 모듈은 "업로드 → 파싱 → 저장"까지 스스로
 * 완결한다(wordLists.js는 그 흐름을 app/main.js의 handleSaveClicked에
 * 맡기지만, 이 모듈은 완전히 독립된 모듈 원칙에 따라 자급자족한다).
 *
 * 책임:
 * - 파일 업로드(.txt) → 읽기 → sentenceParser.parseSentenceText()로 파싱 →
 *   상태 메시지 표시.
 * - "저장" 버튼 → sentenceStore.saveSentences() + sentenceStore.saveSentenceList()로
 *   활성 데이터 반영 + 스냅샷 저장.
 * - sentenceStore.getSentenceLists()로 저장된 리스트 전체를 조회해 목록 UI를 그린다.
 * - 각 항목의 [불러오기]/[삭제], 상단의 [전체 선택]/[선택 삭제]를 처리한다.
 * - "불러오기"로 활성 문장 데이터가 갱신되면 options.onListLoaded(sentences, list)를
 *   호출해, 상위 화면(modules/sentenceMode)이 새로고침할 수 있게 한다.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../core/sentenceStore.js'), require('../../core/sentenceParser.js'));
  } else {
    root.sentenceListsModule = factory(root.sentenceStore, root.sentenceParser);
  }
})(typeof self !== 'undefined' ? self : this, function (sentenceStore, sentenceParser) {
  'use strict';

  /**
   * 문장 목록 패널을 containerEl 내부에 마운트한다.
   *
   * @param {HTMLElement} containerEl - 패널 UI를 그릴 컨테이너
   * @param {object} [options]
   * @param {(sentences: Array, list: {id:number, name:string}) => void} [options.onListLoaded] -
   *        "불러오기"로 활성 문장 데이터(sentences/sentenceState)가 갱신된 직후 호출된다.
   * @returns {{ refresh: () => Promise<void>, destroy: () => void }}
   */
  function mount(containerEl, options) {
    if (!containerEl) {
      throw new Error('sentenceListsModule.mount: containerEl이 필요합니다.');
    }

    const modeOptions = options || {};

    containerEl.innerHTML = buildMarkup();

    const els = {
      fileInput: containerEl.querySelector('[data-sl="fileInput"]'),
      saveButton: containerEl.querySelector('[data-sl="saveButton"]'),
      statusLine: containerEl.querySelector('[data-sl="statusLine"]'),
      emptyState: containerEl.querySelector('[data-sl="emptyState"]'),
      listUl: containerEl.querySelector('[data-sl="listUl"]'),
      selectAllCheckbox: containerEl.querySelector('[data-sl="selectAllCheckbox"]'),
      deleteSelectedButton: containerEl.querySelector('[data-sl="deleteSelectedButton"]'),
    };

    let destroyed = false;

    // 방금 파일에서 새로 파싱한 결과(아직 저장 전일 수 있음).
    let pendingParsedSentences = null;
    // 방금 선택한 파일명(저장 시 리스트 항목의 기본 이름으로 사용).
    let pendingFileName = null;

    init();

    function init() {
      els.fileInput.addEventListener('change', handleFileSelected);
      els.saveButton.addEventListener('click', handleSaveClicked);
      els.selectAllCheckbox.addEventListener('change', handleSelectAllChange);
      els.deleteSelectedButton.addEventListener('click', handleDeleteSelectedClicked);
      refresh();
    }

    function destroy() {
      destroyed = true;
      els.fileInput.removeEventListener('change', handleFileSelected);
      els.saveButton.removeEventListener('click', handleSaveClicked);
      els.selectAllCheckbox.removeEventListener('change', handleSelectAllChange);
      els.deleteSelectedButton.removeEventListener('click', handleDeleteSelectedClicked);
    }

    // ═══════════════════════════════════════════════════════════
    // 업로드 → 파싱 → 저장
    // ═══════════════════════════════════════════════════════════

    function handleFileSelected(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;

      setStatus(`"${file.name}" 읽는 중...`, 'neutral');
      els.saveButton.disabled = true;

      const reader = new FileReader();

      reader.onload = function (e) {
        const rawText = e.target.result;
        try {
          pendingParsedSentences = sentenceParser.parseSentenceText(rawText);
          pendingFileName = file.name;
          els.saveButton.disabled = pendingParsedSentences.length === 0;
          if (pendingParsedSentences.length === 0) {
            const hasNumberedLine = /^\d+\./m.test(rawText);
            const message = hasNumberedLine
              ? `"${file.name}"에서 번호 형식의 줄은 있지만 유효한 문장을 인식하지 못했습니다. 파일 형식을 확인해주세요 (형식 안내 참고).`
              : '인식된 문장이 없습니다. 파일 형식을 확인해주세요 (형식 안내 참고).';
            setStatus(message, 'error');
          } else {
            setStatus(
              `"${file.name}" 파싱 완료 (${pendingParsedSentences.length}개 문장 인식됨). "저장"을 눌러 저장하세요.`,
              'neutral'
            );
          }
        } catch (err) {
          console.error(err);
          pendingParsedSentences = null;
          pendingFileName = null;
          els.saveButton.disabled = true;
          setStatus('파싱 중 오류가 발생했습니다: ' + err.message, 'error');
        }
      };

      reader.onerror = function () {
        setStatus('파일을 읽는 중 오류가 발생했습니다.', 'error');
      };

      reader.readAsText(file, 'utf-8');
    }

    function handleSaveClicked() {
      if (!pendingParsedSentences || pendingParsedSentences.length === 0) return;

      els.saveButton.disabled = true;
      setStatus('저장하는 중...', 'neutral');

      const listName = pendingFileName || `문장 리스트 (${pendingParsedSentences.length}개)`;

      Promise.all([
        sentenceStore.saveSentences(pendingParsedSentences),
        sentenceStore.saveSentenceList(listName, pendingParsedSentences),
      ])
        .then(() => {
          setStatus(`${pendingParsedSentences.length}개 문장을 저장했습니다.`, 'success');
          els.fileInput.value = '';
          pendingParsedSentences = null;
          pendingFileName = null;
          return refresh();
        })
        .catch((err) => {
          console.error(err);
          setStatus('저장 중 오류가 발생했습니다: ' + err.message, 'error');
        })
        .finally(() => {
          els.saveButton.disabled = true;
        });
    }

    function setStatus(text, kind) {
      els.statusLine.textContent = text;
      els.statusLine.classList.remove('sl-status-neutral', 'sl-status-success', 'sl-status-error');
      els.statusLine.classList.add('sl-status-' + (kind || 'neutral'));
    }

    // ═══════════════════════════════════════════════════════════
    // 저장된 리스트 조회/렌더
    // ═══════════════════════════════════════════════════════════

    /**
     * sentenceStore.getSentenceLists()로 저장된 리스트 전체를 다시 조회하여
     * 패널을 새로 그린다.
     *
     * @returns {Promise<void>}
     */
    function refresh() {
      return sentenceStore.getSentenceLists().then((lists) => {
        if (destroyed) return;
        render(lists);
      });
    }

    /**
     * 저장된 리스트 배열을 받아 목록 UI를 그린다.
     * 각 항목: 체크박스 + 이름/개수/저장시각 + [불러오기] [삭제] 버튼.
     *
     * @param {Array<{id:number, name:string, createdAt:number, count:number}>} lists
     */
    function render(lists) {
      els.listUl.innerHTML = '';

      if (!lists || lists.length === 0) {
        els.emptyState.style.display = '';
        els.listUl.style.display = 'none';
        els.selectAllCheckbox.checked = false;
        els.selectAllCheckbox.disabled = true;
        els.deleteSelectedButton.disabled = true;
        return;
      }

      els.emptyState.style.display = 'none';
      els.listUl.style.display = '';
      els.selectAllCheckbox.disabled = false;

      for (const list of lists) {
        els.listUl.appendChild(buildListItem(list));
      }

      updateSelectionUI();
    }

    /**
     * 리스트 하나에 대한 <li> 엘리먼트를 만든다.
     *
     * @param {{id:number, name:string, createdAt:number, count:number}} list
     * @returns {HTMLLIElement}
     */
    function buildListItem(list) {
      const li = document.createElement('li');
      li.className = 'sl-list-item';
      li.dataset.listId = String(list.id);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'sl-list-checkbox';
      checkbox.dataset.listId = String(list.id);
      checkbox.addEventListener('change', updateSelectionUI);
      li.appendChild(checkbox);

      const info = document.createElement('div');
      info.className = 'sl-list-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'sl-list-name';
      nameEl.textContent = list.name;
      info.appendChild(nameEl);

      const metaEl = document.createElement('span');
      metaEl.className = 'sl-list-meta';
      metaEl.textContent = `${list.count}개 문장 · ${formatDateTime(list.createdAt)}`;
      info.appendChild(metaEl);

      li.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'sl-list-item-actions';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'btn-secondary sl-list-load-btn';
      loadBtn.textContent = '불러오기';
      loadBtn.addEventListener('click', () => handleLoadClicked(list));
      actions.appendChild(loadBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-ghost sl-list-delete-btn';
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
      return Array.from(els.listUl.querySelectorAll('.sl-list-checkbox'));
    }

    function getSelectedIds() {
      return getCheckboxes()
        .filter((cb) => cb.checked)
        .map((cb) => Number(cb.dataset.listId));
    }

    /**
     * 개별 체크박스가 바뀔 때마다: "선택 삭제" 버튼 활성화 여부와
     * "전체 선택" 체크박스의 상태(전체/일부/없음)를 함께 맞춘다.
     */
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

    /**
     * 체크된 리스트들을 한 번에 삭제한다(사용자 확인 후).
     */
    function handleDeleteSelectedClicked() {
      const ids = getSelectedIds();
      if (ids.length === 0) return;

      const confirmed = window.confirm(`선택한 리스트 ${ids.length}개를 삭제할까요? 이 동작은 되돌릴 수 없습니다.`);
      if (!confirmed) return;

      els.deleteSelectedButton.disabled = true;

      sentenceStore.deleteSentenceLists(ids)
        .then(() => refresh())
        .catch((err) => {
          console.error(err);
          window.alert('리스트 삭제 중 오류가 발생했습니다: ' + err.message);
        });
    }

    /**
     * 리스트 항목 하나의 [삭제] 버튼 클릭.
     *
     * @param {{id:number, name:string}} list
     */
    function handleDeleteOneClicked(list) {
      const confirmed = window.confirm(`"${list.name}" 리스트를 삭제할까요? 이 동작은 되돌릴 수 없습니다.`);
      if (!confirmed) return;

      sentenceStore.deleteSentenceList(list.id)
        .then(() => refresh())
        .catch((err) => {
          console.error(err);
          window.alert('리스트 삭제 중 오류가 발생했습니다: ' + err.message);
        });
    }

    /**
     * 리스트 항목 하나의 [불러오기] 버튼 클릭. 현재 활성 문장 데이터
     * (sentences/sentenceState)에 해당 리스트 스냅샷을 반영한 뒤,
     * 상위에 onListLoaded로 알린다.
     *
     * @param {{id:number, name:string}} list
     */
    function handleLoadClicked(list) {
      const confirmed = window.confirm(`"${list.name}" 리스트를 현재 문장 데이터로 불러올까요?\n(기존 문장 목록은 이 리스트 내용으로 갱신됩니다. 학습 이력은 유지됩니다.)`);
      if (!confirmed) return;

      sentenceStore.loadSentenceList(list.id)
        .then((sentences) => {
          setStatus(`"${list.name}" (${sentences.length}개 문장)를 불러왔습니다.`, 'success');
          if (typeof modeOptions.onListLoaded === 'function') {
            modeOptions.onListLoaded(sentences, list);
          }
        })
        .catch((err) => {
          console.error(err);
          window.alert('리스트를 불러오는 중 오류가 발생했습니다: ' + err.message);
        });
    }

    return { refresh, destroy };
  }

  function buildMarkup() {
    return `
      <div class="sl-upload-section">
        <div class="sl-upload-title">문장 목록 업로드</div>
        <div class="sl-upload-row">
          <input type="file" accept=".txt" data-sl="fileInput">
          <button type="button" class="btn-primary" data-sl="saveButton" disabled>저장</button>
        </div>
        <p class="sl-status-line" data-sl="statusLine"></p>

        <details class="format-guide">
          <summary>파일 형식 안내</summary>
          <div class="format-guide-body">
            <p class="format-guide-desc">같은 번호로 시작하는 줄이 한 문장입니다. 줄 순서대로 <strong>①영어 문장 ②한글 해석</strong>이며, ②번째 줄(해석)은 생략할 수 있습니다.</p>
            <pre class="format-guide-example"><code>1.She works at a bank.
1.그녀는 은행에서 일한다.</code></pre>
            <p class="format-guide-note">해석 줄이 없어도 영어 문장만으로 저장할 수 있습니다.</p>
          </div>
        </details>
      </div>

      <div class="sl-lists-header">
        <span class="sl-lists-title">저장된 문장 리스트</span>
        <div class="sl-lists-actions">
          <label class="sl-select-all">
            <input type="checkbox" data-sl="selectAllCheckbox">전체 선택
          </label>
          <button type="button" class="btn-ghost" data-sl="deleteSelectedButton" disabled>선택 삭제</button>
        </div>
      </div>
      <div class="empty-state" data-sl="emptyState">아직 저장된 문장 리스트가 없습니다. 파일을 업로드하고 "저장"을 누르면 이곳에 쌓입니다.</div>
      <ul class="sl-lists-ul" data-sl="listUl" style="display:none;"></ul>
    `;
  }

  return { mount };
});
