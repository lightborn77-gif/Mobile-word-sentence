/**
 * modules/wordLists/wordLists.js
 *
 * "저장된 리스트" 패널 모듈.
 * 오직 core(wordStore)만 참조하며, flashcard/quiz/result 등 다른 모듈의
 * 내부 코드는 직접 참조하지 않는다(아키텍처 원칙).
 *
 * 책임:
 * - wordStore.getWordLists()로 저장된 리스트 전체를 조회해 목록 UI를 그린다.
 * - 각 항목의 [불러오기]/[삭제], 상단의 [전체 선택]/[선택 삭제]를 처리한다.
 * - "불러오기"로 활성 단어장이 갱신되면 options.onListLoaded(words, list)를
 *   호출해, 단어 목록 탭 등 상위 화면이 새로고침할 수 있게 한다.
 *
 * 이 모듈은 "리스트를 저장하는 시점"(파일 업로드 → 저장)은 다루지 않는다.
 * 그 흐름은 app/main.js의 handleSaveClicked가 여전히 담당하며, 저장이
 * 끝난 뒤 refresh()를 호출해 이 패널을 갱신해달라고 요청하는 방식으로
 * 연결된다(계약: mount가 반환하는 핸들의 refresh 메서드).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../core/wordStore.js'));
  } else {
    root.wordListsModule = factory(root.wordStore);
  }
})(typeof self !== 'undefined' ? self : this, function (wordStore) {
  'use strict';

  /**
   * 저장된 리스트 패널을 containerEl 내부에 마운트한다.
   *
   * @param {HTMLElement} containerEl - 패널 UI를 그릴 컨테이너
   * @param {object} [options]
   * @param {(words: Array, list: {id:number, name:string}) => void} [options.onListLoaded] -
   *        "불러오기"로 활성 단어장(words/wordState)이 갱신된 직후 호출된다.
   *        상위(app/main.js)는 이 콜백에서 단어 목록 탭의 범위/필터 뷰를
   *        새로고침하면 된다.
   * @param {(list: {id:number, name:string}) => void} [options.onEditRequested] -
   *        리스트 항목의 [편집] 버튼 클릭 시 호출된다. 상위(app/main.js)가
   *        이 콜백에서 modules/wordEditor를 별도 화면으로 열어준다. 이 모듈은
   *        wordEditor를 직접 참조하지 않는다(아키텍처 원칙: wordLists는 core만 참조).
   * @returns {{ refresh: () => Promise<void>, destroy: () => void }}
   */
  function mount(containerEl, options) {
    if (!containerEl) {
      throw new Error('wordListsModule.mount: containerEl이 필요합니다.');
    }

    const modeOptions = options || {};

    containerEl.innerHTML = buildMarkup();

    const els = {
      emptyState: containerEl.querySelector('[data-wl="emptyState"]'),
      listUl: containerEl.querySelector('[data-wl="listUl"]'),
      selectAllCheckbox: containerEl.querySelector('[data-wl="selectAllCheckbox"]'),
      deleteSelectedButton: containerEl.querySelector('[data-wl="deleteSelectedButton"]'),
      newWordButton: containerEl.querySelector('[data-wl="newWordButton"]'),
    };

    let destroyed = false;

    init();

    function init() {
      els.selectAllCheckbox.addEventListener('change', handleSelectAllChange);
      els.deleteSelectedButton.addEventListener('click', handleDeleteSelectedClicked);
      els.newWordButton.addEventListener('click', handleNewWordClicked);
      refresh();
    }

    function destroy() {
      destroyed = true;
      els.selectAllCheckbox.removeEventListener('change', handleSelectAllChange);
      els.deleteSelectedButton.removeEventListener('click', handleDeleteSelectedClicked);
      els.newWordButton.removeEventListener('click', handleNewWordClicked);
    }

    /**
     * "+ 새 단어 추가" 클릭. 기존 리스트를 선택하지 않고 바로
     * 편집 화면을 "신규 추가" 모드(list: null)로 여는 요청을 상위에 전달한다.
     */
    function handleNewWordClicked() {
      if (typeof modeOptions.onEditRequested === 'function') {
        modeOptions.onEditRequested(null);
      }
    }

    /**
     * wordStore.getWordLists()로 저장된 리스트 전체를 다시 조회하여
     * 패널을 새로 그린다. 삭제/불러오기/외부 저장 직후 호출한다
     * (상위가 mount() 반환값의 refresh()를 통해 트리거).
     *
     * @returns {Promise<void>}
     */
    function refresh() {
      return wordStore.getWordLists().then((lists) => {
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
      li.className = 'word-list-item';
      li.dataset.listId = String(list.id);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'word-list-checkbox';
      checkbox.dataset.listId = String(list.id);
      checkbox.addEventListener('change', updateSelectionUI);
      li.appendChild(checkbox);

      const info = document.createElement('div');
      info.className = 'word-list-info';

      const nameEl = document.createElement('span');
      nameEl.className = 'word-list-name';
      nameEl.textContent = list.name;
      info.appendChild(nameEl);

      const metaEl = document.createElement('span');
      metaEl.className = 'word-list-meta';
      metaEl.textContent = `${list.count}개 단어 · ${formatDateTime(list.createdAt)}`;
      info.appendChild(metaEl);

      li.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'word-list-item-actions';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'btn-secondary word-list-load-btn';
      loadBtn.textContent = '불러오기';
      loadBtn.addEventListener('click', () => handleLoadClicked(list));
      actions.appendChild(loadBtn);

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'btn-secondary word-list-edit-btn';
      editBtn.textContent = '편집';
      editBtn.title = '이 리스트의 단어를 추가/수정합니다.';
      editBtn.addEventListener('click', () => {
        if (typeof modeOptions.onEditRequested === 'function') {
          modeOptions.onEditRequested(list);
        }
      });
      actions.appendChild(editBtn);

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-ghost word-list-delete-btn';
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
      return Array.from(els.listUl.querySelectorAll('.word-list-checkbox'));
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

      wordStore.deleteWordLists(ids)
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

      wordStore.deleteWordList(list.id)
        .then(() => refresh())
        .catch((err) => {
          console.error(err);
          window.alert('리스트 삭제 중 오류가 발생했습니다: ' + err.message);
        });
    }

    /**
     * 리스트 항목 하나의 [불러오기] 버튼 클릭. 현재 활성 단어장(words/wordState)에
     * 해당 리스트 스냅샷을 반영한 뒤, 상위에 onListLoaded로 알린다.
     * (기존 학습 이력이 있는 단어 id는 wordStore.saveWords 규칙에 따라 보존된다.)
     *
     * @param {{id:number, name:string}} list
     */
    function handleLoadClicked(list) {
      const confirmed = window.confirm(`"${list.name}" 리스트를 현재 단어장으로 불러올까요?\n(기존 단어 목록은 이 리스트 내용으로 갱신됩니다. 학습 이력은 유지됩니다.)`);
      if (!confirmed) return;

      wordStore.loadWordList(list.id)
        .then(({ words, lang }) => {
          if (typeof modeOptions.onListLoaded === 'function') {
            // list는 getWordLists()가 이미 lang을 포함해 넘겨준 값이지만,
            // loadWordList가 방금 조회한 최신 lang으로 한 번 더 맞춰 넘긴다.
            modeOptions.onListLoaded(words, { ...list, lang: lang || list.lang });
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
      <div class="word-lists-header">
        <span class="word-lists-title">저장된 리스트</span>
        <div class="word-lists-actions">
          <button type="button" class="btn-primary" data-wl="newWordButton">+ 새 단어 추가</button>
          <label class="word-lists-select-all">
            <input type="checkbox" data-wl="selectAllCheckbox">전체 선택
          </label>
          <button type="button" class="btn-ghost" data-wl="deleteSelectedButton" disabled>선택 삭제</button>
        </div>
      </div>
      <div class="empty-state" data-wl="emptyState">아직 저장된 리스트가 없습니다. 파일을 업로드하고 "IndexedDB에 저장"을 누르면 이곳에 쌓입니다.</div>
      <ul class="word-lists-ul" data-wl="listUl" style="display:none;"></ul>
    `;
  }

  return { mount };
});
