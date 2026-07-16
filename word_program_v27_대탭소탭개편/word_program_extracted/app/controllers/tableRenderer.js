/**
 * app/controllers/tableRenderer.js
 *
 * 역할
 * ----
 * 단어 목록 탭의 "표로 자세히 보기" 표를 그리는 전담 컨트롤러.
 * 단어 배열을 받아 <tr>/<td> DOM을 생성하고, 페이지네이션과
 * 정답/오답 임시 검증 버튼 클릭 처리까지 담당한다.
 *
 * 이 파일이 하지 않는 일
 * ----------------------
 * - 어떤 단어를 보여줄지 결정하는 필터/범위 계산 (app/main.js가 담당)
 * - 상태 요약 카드(summaryCount*) 갱신 (app/main.js가 담당)
 * 즉 "무엇을 보여줄지"는 main.js가 정하고, "어떻게 그릴지"만 이 파일이 맡는다.
 *
 * 공개 API
 * --------
 * createTableRenderer(deps) → { render(words, page), getCurrentWords(), getCurrentPage() }
 *   - render(words, page): 단어 배열을 표에 그린다. page 생략 시 0페이지.
 *   - getCurrentWords()/getCurrentPage(): 페이저 버튼(이전/다음)이 페이지만
 *     바꿔 다시 그릴 때 필요한 현재 상태를 조회한다.
 *
 * 의존성 (deps로 주입받음 — 상태를 직접 소유하지 않음)
 * --------------------------------------------------
 * - dom: { wordTable, wordTableBody, emptyState, wordTablePager,
 *          wordTablePagerInfo, wordTablePagerPrev, wordTablePagerNext }
 * - wordStore: core/wordStore.js (recordResult 호출용)
 * - stateManager: core/stateManager.js (calculateStatus 호출용)
 * - onStatusMessage(message, kind): 검증 결과를 상태줄에 표시하기 위한 콜백
 * - pageSize: 한 페이지에 그릴 행 수 (기본 100)
 *
 * 삭제/교체 방법
 * --------------
 * 표 UI 자체를 다른 방식(가상 스크롤 등)으로 바꾸려면 이 파일만 교체하면 된다.
 * main.js는 render(words, page) 호출 계약만 알면 되므로 내부 구현에 영향받지 않는다.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.tableRenderer = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {object} deps
   * @param {object} deps.dom - 표 렌더링에 필요한 DOM 엘리먼트 모음
   * @param {object} deps.wordStore
   * @param {object} deps.stateManager
   * @param {function(string, string):void} deps.onStatusMessage
   * @param {number} [deps.pageSize=100]
   */
  function createTableRenderer(deps) {
    const dom = deps.dom;
    const wordStore = deps.wordStore;
    const stateManager = deps.stateManager;
    const onStatusMessage = deps.onStatusMessage || function () {};
    const PAGE_SIZE = deps.pageSize || 100;

    // 이전/다음 페이지 버튼이 재조회 없이 다시 그릴 수 있도록 마지막
    // render() 호출의 단어 배열/페이지를 기억해둔다.
    let currentWords = [];
    let currentPage = 0;

    /**
     * 단어 배열을 표에 렌더링한다(페이지네이션 적용).
     * 컬럼: 번호, 단어, 뜻, 반의어, 유의어, 파생어, 예문, 학습 상태, 임시 검증
     *
     * @param {Array} words - 필터/범위가 이미 적용된 전체 결과 배열
     * @param {number} [page] - 표시할 페이지(0부터 시작). 생략하면 0페이지.
     */
    function render(words, page) {
      currentWords = words || [];
      currentPage = Number.isFinite(page) ? page : 0;

      if (currentWords.length === 0) {
        dom.wordTable.style.display = 'none';
        dom.wordTablePager.style.display = 'none';
        dom.emptyState.style.display = 'block';
        dom.emptyState.textContent = '표시할 단어가 없습니다.';
        return;
      }

      dom.emptyState.style.display = 'none';
      dom.wordTable.style.display = 'table';

      const totalPages = Math.max(1, Math.ceil(currentWords.length / PAGE_SIZE));
      currentPage = Math.min(Math.max(0, currentPage), totalPages - 1);

      const start = currentPage * PAGE_SIZE;
      const end = Math.min(start + PAGE_SIZE, currentWords.length);
      const pageWords = currentWords.slice(start, end);

      dom.wordTableBody.innerHTML = '';
      const fragment = document.createDocumentFragment();

      for (const w of pageWords) {
        const tr = document.createElement('tr');
        tr.dataset.wordId = String(w.id);

        tr.appendChild(makeCell(String(w.id), 'id-cell'));
        tr.appendChild(makeCell(w.word || emptyDash(), 'word-cell'));
        tr.appendChild(makeCell(w.meaning || emptyDash()));
        tr.appendChild(makeTagCell(w.derivatives.antonyms, 'antonym'));
        tr.appendChild(makeTagCell(w.derivatives.synonyms, 'synonym'));
        tr.appendChild(makeDerivedCell(w.derivatives.derived, w.derivatives.other));
        tr.appendChild(makeExampleCell(w.example));
        tr.appendChild(makeStatusCell(w));
        tr.appendChild(makeVerifyCell(w));

        fragment.appendChild(tr);
      }

      dom.wordTableBody.appendChild(fragment);

      renderPager(totalPages, currentWords.length, start, end);
    }

    /**
     * 표 하단 페이지 이동 UI를 갱신한다.
     */
    function renderPager(totalPages, totalCount, start, end) {
      if (totalPages <= 1) {
        dom.wordTablePager.style.display = 'none';
        return;
      }

      dom.wordTablePager.style.display = 'flex';
      dom.wordTablePagerInfo.textContent =
        `${start + 1}–${end} / 전체 ${totalCount}개 (페이지 ${currentPage + 1}/${totalPages})`;
      dom.wordTablePagerPrev.disabled = currentPage <= 0;
      dom.wordTablePagerNext.disabled = currentPage >= totalPages - 1;
    }

    // ── 학습 상태 뱃지 셀 ──────────────────────────────────────

    function makeStatusCell(w) {
      const td = document.createElement('td');

      if (!w.state) {
        const badge = document.createElement('span');
        badge.className = 'status-badge none';
        badge.textContent = '저장 전';
        td.appendChild(badge);
        return td;
      }

      const status = w.status;
      const state = w.state;

      const badge = document.createElement('span');

      if (status === 'untested') {
        badge.className = 'status-badge untested';
        badge.textContent = '미테스트';
      } else if (status === 'bigStarred') {
        badge.className = 'status-badge bigStarred';
        badge.textContent = '★★ 큰별표';
      } else if (status === 'starred') {
        badge.className = 'status-badge starred';
        badge.textContent = '★ 별표';
      } else if (status === 'stable') {
        badge.className = 'status-badge stable';
        badge.textContent = '✓ 안정권';
      } else {
        badge.className = 'status-badge none';
        badge.textContent = '오답 없음';
      }

      td.appendChild(badge);

      const hint = document.createElement('span');
      hint.className = 'counter-hint';
      hint.textContent = `오답 ${state.wrongCount} · 정답 ${state.correctCount} · 연속정답 ${state.consecutiveCorrect}`;
      td.appendChild(hint);

      return td;
    }

    // ── 정답/오답 임시 검증 셀 ─────────────────────────────────

    function makeVerifyCell(w) {
      const td = document.createElement('td');
      const wrapper = document.createElement('div');
      wrapper.className = 'verify-cell';

      if (!w.state) {
        const hint = document.createElement('span');
        hint.className = 'counter-hint';
        hint.textContent = '저장 후 이용 가능';
        wrapper.appendChild(hint);
        td.appendChild(wrapper);
        return td;
      }

      const buttonRow = document.createElement('div');
      buttonRow.className = 'verify-buttons';

      const correctBtn = document.createElement('button');
      correctBtn.type = 'button';
      correctBtn.className = 'btn-verify correct';
      correctBtn.textContent = '정답';
      correctBtn.title = '이 단어를 "정답"으로 처리(임시 검증용)';

      const wrongBtn = document.createElement('button');
      wrongBtn.type = 'button';
      wrongBtn.className = 'btn-verify wrong';
      wrongBtn.textContent = '오답';
      wrongBtn.title = '이 단어를 "오답"으로 처리(임시 검증용)';

      correctBtn.addEventListener('click', () => handleVerifyClick(w.id, true, [correctBtn, wrongBtn]));
      wrongBtn.addEventListener('click', () => handleVerifyClick(w.id, false, [correctBtn, wrongBtn]));

      buttonRow.appendChild(correctBtn);
      buttonRow.appendChild(wrongBtn);
      wrapper.appendChild(buttonRow);
      td.appendChild(wrapper);
      return td;
    }

    function handleVerifyClick(wordId, isCorrect, buttonsToDisableDuringRequest) {
      buttonsToDisableDuringRequest.forEach((b) => { b.disabled = true; });

      wordStore.recordResult(wordId, isCorrect)
        .then((updatedState) => {
          updateRowStatusBadge(wordId, updatedState);
          onStatusMessage(
            `${wordId}번 단어를 "${isCorrect ? '정답' : '오답'}"으로 기록했습니다. (오답 ${updatedState.wrongCount} · 정답 ${updatedState.correctCount} · 연속정답 ${updatedState.consecutiveCorrect})`,
            'neutral'
          );
        })
        .catch((err) => {
          console.error(err);
          onStatusMessage('학습 상태 기록 중 오류가 발생했습니다: ' + err.message, 'error');
        })
        .finally(() => {
          buttonsToDisableDuringRequest.forEach((b) => { b.disabled = false; });
        });
    }

    function updateRowStatusBadge(wordId, updatedState) {
      const tr = dom.wordTableBody.querySelector(`tr[data-word-id="${wordId}"]`);
      if (!tr) return;

      const status = stateManager.calculateStatus(updatedState);
      const statusCellIndex = 7;
      const oldStatusCell = tr.children[statusCellIndex];
      const newStatusCell = makeStatusCell({ status, state: updatedState });
      if (oldStatusCell) {
        tr.replaceChild(newStatusCell, oldStatusCell);
      }
    }

    // ── 공용 셀 생성 헬퍼 ──────────────────────────────────────

    function emptyDash() {
      return null;
    }

    function makeCell(text, className) {
      const td = document.createElement('td');
      if (className) td.className = className;

      if (text === null || text === undefined || text === '') {
        const span = document.createElement('span');
        span.className = 'empty-dash';
        span.textContent = '-';
        td.appendChild(span);
      } else {
        td.textContent = text;
      }
      return td;
    }

    /**
     * 태그 텍스트를 만든다. item이 {text, meaning} 객체면 "text(meaning)" 형태로,
     * meaning이 없으면 text만 반환한다. 문자열이 그대로 오는 경우도 방어적으로 지원한다.
     */
    function formatTagText(item) {
      if (item && typeof item === 'object') {
        return item.meaning ? `${item.text}(${item.meaning})` : item.text;
      }
      return item;
    }

    function makeTagCell(items, typeClass) {
      const td = document.createElement('td');

      if (!items || items.length === 0) {
        const span = document.createElement('span');
        span.className = 'empty-dash';
        span.textContent = '-';
        td.appendChild(span);
        return td;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'tag-list';

      for (const item of items) {
        const tag = document.createElement('span');
        tag.className = 'tag ' + typeClass;
        tag.textContent = formatTagText(item);
        wrapper.appendChild(tag);
      }

      td.appendChild(wrapper);
      return td;
    }

    function makeDerivedCell(derivedItems, otherItems) {
      const td = document.createElement('td');
      const all = [
        ...(derivedItems || []).map((t) => ({ ...(typeof t === 'object' ? t : { text: t, meaning: '' }), cls: 'derived' })),
        ...(otherItems || []).map((t) => ({ ...(typeof t === 'object' ? t : { text: t, meaning: '' }), cls: 'other' })),
      ];

      if (all.length === 0) {
        const span = document.createElement('span');
        span.className = 'empty-dash';
        span.textContent = '-';
        td.appendChild(span);
        return td;
      }

      const wrapper = document.createElement('div');
      wrapper.className = 'tag-list';

      for (const item of all) {
        const tag = document.createElement('span');
        tag.className = 'tag ' + item.cls;
        tag.textContent = formatTagText(item);
        wrapper.appendChild(tag);
      }

      td.appendChild(wrapper);
      return td;
    }

    /**
     * 예문 셀을 만든다. example이 {sentence, translation} 객체면
     * 문장과 해석을 각각 별도 줄로 표시한다. translation이 없으면 문장만 표시한다.
     */
    function makeExampleCell(example) {
      const td = document.createElement('td');
      const sentence = example && typeof example === 'object' ? example.sentence : example;

      if (!sentence || sentence.trim() === '') {
        const span = document.createElement('span');
        span.className = 'empty-dash';
        span.textContent = '-';
        td.appendChild(span);
        return td;
      }

      const sentenceEl = document.createElement('div');
      sentenceEl.className = 'example-sentence';
      sentenceEl.textContent = sentence;
      td.appendChild(sentenceEl);

      const translation = example && typeof example === 'object' ? example.translation : '';
      if (translation) {
        const translationEl = document.createElement('div');
        translationEl.className = 'example-translation';
        translationEl.textContent = translation;
        td.appendChild(translationEl);
      }

      return td;
    }

    return {
      render,
      getCurrentWords: () => currentWords,
      getCurrentPage: () => currentPage,
    };
  }

  return { createTableRenderer };
});
