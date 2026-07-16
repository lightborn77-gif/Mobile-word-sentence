/**
 * modules/result/result.js
 *
 * 결과 화면(퀴즈 종료 후 정오답 결과) 모듈.
 * 오직 core(ttsEngine)만 참조하며, quiz 모듈의 내부 코드(로직/DOM)는
 * 절대 직접 참조하지 않는다(아키텍처 원칙). quiz로부터는 정오답 기록
 * 배열(records)만 전달받아 화면을 그린다.
 *   레코드 형태: { wordId, word, meaning, isCorrect, selectedAnswer, correctAnswer }
 *
 * ── 주요 기능 ────────────────────────────────────────────────
 * - 전달받은 records를 맞은 문제 / 틀린 문제로 구분해 표시
 * - 각 항목에 단어, 뜻, 사용자가 고른 답, 정답 표시
 * - 각 단어 항목에 발음 재생 버튼 배치 → core/ttsEngine.speak 호출
 * - 전체 정답률(맞은 개수 / 전체 문제 수) 표시
 *
 * 학습 상태(wordStore.recordResult) 반영은 이 모듈이 하지 않는다.
 * 퀴즈 결과를 실제 wordState에 반영하는 것은 퀴즈 진행/종료 시점의
 * 책임이며(quiz 모듈 또는 app/main.js), result 모듈은 오직 "보여주기"만
 * 담당한다(quiz 내부 로직을 직접 참조하지 않는 독립 모듈 원칙).
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../core/ttsEngine.js'), require('../../core/htmlUtil.js'));
  } else {
    root.resultModule = factory(root.ttsEngine, root.htmlUtil);
  }
})(typeof self !== 'undefined' ? self : this, function (ttsEngine, htmlUtil) {
  'use strict';

  /**
   * 결과 화면을 containerEl 내부에 마운트한다.
   *
   * @param {HTMLElement} containerEl - 결과 화면 UI를 그릴 컨테이너
   * @param {Array<{wordId:number, word:string, meaning:string, isCorrect:boolean, selectedAnswer:string, correctAnswer:string}>} records
   * @param {object} [options]
   * @param {() => void} [options.onRestart] - "새 퀴즈 시작" 등 결과 화면을 벗어날 때 호출할 콜백
   * @param {string} [options.lang] - 발음 언어 코드(다국어 TTS, 예: 'en-US').
   *        이 모듈은 언어를 판단하지 않고 ttsEngine.speak(..., { lang })에
   *        얹기만 한다. 전달하지 않으면 ttsEngine 기본값('en-US')을 쓴다.
   * @returns {{ destroy: () => void }} 화면을 벗어날 때 정리할 수 있는 핸들
   */
  function mount(containerEl, records, options) {
    if (!containerEl) {
      throw new Error('resultModule.mount: containerEl이 필요합니다.');
    }

    const opts = options || {};
    const safeRecords = Array.isArray(records) ? records : [];

    let destroyed = false;

    render();

    function render() {
      const correctList = safeRecords.filter((r) => r.isCorrect);
      const wrongList = safeRecords.filter((r) => !r.isCorrect);
      const total = safeRecords.length;
      const correctCount = correctList.length;
      const pct = total > 0 ? Math.round((correctCount / total) * 100) : 0;

      containerEl.innerHTML = buildMarkup({
        total,
        correctCount,
        pct,
        wrongList,
        correctList,
      });

      // 발음 재생 버튼 연결 (틀린 목록 + 맞은 목록 공통)
      const speakButtons = Array.from(containerEl.querySelectorAll('[data-rs-speak]'));
      speakButtons.forEach((btn) => {
        btn.addEventListener('click', () => handleSpeakClick(btn));
      });

      const restartButton = containerEl.querySelector('[data-rs="restartButton"]');
      if (restartButton) {
        restartButton.addEventListener('click', () => {
          if (opts.onRestart) opts.onRestart();
        });
      }
    }

    function handleSpeakClick(btn) {
      if (destroyed) return;
      const text = btn.getAttribute('data-rs-speak');
      if (!text) return;

      btn.disabled = true;
      btn.classList.add('rs-speak-playing');

      // 다국어 TTS: opts.lang(현재 학습 언어)을 그대로 전달한다.
      ttsEngine.speak(text, 1, {
        lang: opts.lang,
        onEnd: () => {
          btn.disabled = false;
          btn.classList.remove('rs-speak-playing');
        },
        onError: () => {
          btn.disabled = false;
          btn.classList.remove('rs-speak-playing');
        },
      });
    }

    function destroy() {
      destroyed = true;
      ttsEngine.cancel();
    }

    return { destroy };
  }

  // ── 마크업 빌더 ────────────────────────────────────────────
  function buildMarkup({ total, correctCount, pct, wrongList, correctList }) {
    return `
      <div class="rs-panel">
        <div class="rs-summary">
          <div class="rs-summary-title">퀴즈 결과</div>
          <div class="rs-summary-score">
            ${total}문제 중 <strong>${correctCount}개</strong> 정답
            <span class="rs-summary-pct">(정답률 ${pct}%)</span>
          </div>
          <div class="rs-progress-bar-track">
            <div class="rs-progress-bar-fill" style="width:${pct}%;"></div>
          </div>
        </div>

        <div class="rs-section">
          <div class="rs-section-title rs-section-title-wrong">
            틀린 문제 <span class="rs-section-count">${wrongList.length}개</span>
          </div>
          ${wrongList.length > 0 ? buildListMarkup(wrongList, false) : buildEmptyMarkup('틀린 문제가 없습니다. 완벽해요!')}
        </div>

        <div class="rs-section">
          <div class="rs-section-title rs-section-title-correct">
            맞은 문제 <span class="rs-section-count">${correctList.length}개</span>
          </div>
          ${correctList.length > 0 ? buildListMarkup(correctList, true) : buildEmptyMarkup('맞은 문제가 없습니다.')}
        </div>

        <div class="rs-actions">
          <button type="button" class="rs-btn rs-btn-primary" data-rs="restartButton">새 퀴즈 시작</button>
        </div>
      </div>
    `;
  }

  function buildListMarkup(list, isCorrect) {
    const rows = list.map((r) => `
      <li class="rs-item ${isCorrect ? 'rs-item-correct' : 'rs-item-wrong'}">
        <button type="button" class="rs-speak-btn" data-rs-speak="${escapeHtml(r.word)}" title="발음 듣기">🔊</button>
        <div class="rs-item-body">
          <div class="rs-item-word">${escapeHtml(r.word)}</div>
          <div class="rs-item-meaning">${escapeHtml(r.meaning)}</div>
          <div class="rs-item-answers">
            <span class="rs-answer-label">선택한 답</span>
            <span class="rs-answer-value ${isCorrect ? 'rs-answer-correct' : 'rs-answer-wrong'}">${escapeHtml(r.selectedAnswer)}</span>
            ${!isCorrect ? `
              <span class="rs-answer-label">정답</span>
              <span class="rs-answer-value rs-answer-correct">${escapeHtml(r.correctAnswer)}</span>
            ` : ''}
          </div>
        </div>
      </li>
    `).join('');

    return `<ul class="rs-item-list">${rows}</ul>`;
  }

  function buildEmptyMarkup(message) {
    return `<div class="rs-empty">${escapeHtml(message)}</div>`;
  }

  const escapeHtml = htmlUtil.escapeHtml;

  return { mount };
});
