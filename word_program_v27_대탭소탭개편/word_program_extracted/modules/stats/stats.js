/**
 * modules/stats/stats.js
 *
 * 통계 탭 모듈.
 * 오직 core(wordStore)만 참조하며, quiz/result/flashcard 등 다른 모듈의
 * 내부 코드는 직접 참조하지 않는다(아키텍처 원칙).
 *
 * ── 표시하는 지표 ────────────────────────────────────────────
 * - 전체 누적 정답률(모든 단어의 correctCount/wrongCount 합산 기준)
 * - 상태별 단어 분포(미테스트/별표/큰별표/안정권/오답없음) 카운트+비율
 * - 취약 단어 TOP N(wrongCount 내림차순) — 가장 실용적인 지표로,
 *   어떤 단어를 우선 복습해야 하는지 바로 알려준다.
 *
 * 세션(퀴즈를 언제 몇 번 봤는지) 단위 통계는 다루지 않는다. 이 모듈은
 * wordState에 이미 누적되어 있는 카운터(wrongCount/correctCount/tested)
 * 만으로 계산 가능한 지표만 다룬다(DB 스키마 변경 없음).
 *
 * 탭 진입 시마다 app/main.js가 refresh()를 호출해 최신 데이터로
 * 다시 그리는 방식으로 연동한다(다른 탭에서 학습한 결과가 바로 반영
 * 되도록 mount 시점에 캐시하지 않고 매번 새로 조회).
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../../core/wordStore.js'), require('../../core/htmlUtil.js'));
  } else {
    root.statsModule = factory(root.wordStore, root.htmlUtil);
  }
})(typeof self !== 'undefined' ? self : this, function (wordStore, htmlUtil) {
  'use strict';

  const TOP_N = 10;

  const STATUS_LABELS = {
    untested: '미테스트',
    starred: '별표',
    bigStarred: '큰별표',
    stable: '안정권',
    none: '오답없음',
  };

  const STATUS_ORDER = ['untested', 'starred', 'bigStarred', 'stable', 'none'];

  /**
   * 통계 화면을 containerEl 내부에 마운트한다.
   *
   * @param {HTMLElement} containerEl
   * @returns {{ refresh: () => Promise<void>, destroy: () => void }}
   */
  function mount(containerEl) {
    if (!containerEl) {
      throw new Error('statsModule.mount: containerEl이 필요합니다.');
    }

    let destroyed = false;

    renderLoading();
    refresh();

    function renderLoading() {
      containerEl.innerHTML = '<div class="stats-loading">통계를 불러오는 중...</div>';
    }

    function refresh() {
      return wordStore.getStatsSummary(TOP_N).then((summary) => {
        if (destroyed) return;
        containerEl.innerHTML = buildMarkup(summary);
      });
    }

    function destroy() {
      destroyed = true;
    }

    return { refresh, destroy };
  }

  // ── 마크업 빌더 ────────────────────────────────────────────

  function buildMarkup(summary) {
    if (!summary || summary.totalWords === 0) {
      return `
        <div class="stats-panel">
          <div class="stats-empty">아직 저장된 단어가 없습니다. 단어를 업로드하고 학습을 시작하면 통계가 표시됩니다.</div>
        </div>
      `;
    }

    return `
      <div class="stats-panel">
        ${buildAccuracyCard(summary)}
        ${buildStatusDistribution(summary)}
        ${buildWeakWordsSection(summary)}
      </div>
    `;
  }

  function buildAccuracyCard(summary) {
    const { accuracyPct, totalAttempts, totalCorrect, totalWrong, testedWords, totalWords } = summary;

    if (accuracyPct === null) {
      return `
        <div class="stats-card stats-accuracy-card">
          <div class="stats-card-title">전체 정답률</div>
          <div class="stats-empty-inline">아직 퀴즈를 본 기록이 없습니다.</div>
        </div>
      `;
    }

    return `
      <div class="stats-card stats-accuracy-card">
        <div class="stats-card-title">전체 정답률</div>
        <div class="stats-accuracy-value">
          ${accuracyPct}%
          <span class="stats-accuracy-sub">(${totalCorrect} / ${totalAttempts}회 시도)</span>
        </div>
        <div class="stats-progress-bar-track">
          <div class="stats-progress-bar-fill" style="width:${accuracyPct}%;"></div>
        </div>
        <div class="stats-accuracy-meta">
          학습 시작한 단어 <strong>${testedWords}</strong> / 전체 <strong>${totalWords}</strong>개
          · 누적 오답 <strong>${totalWrong}</strong>회
        </div>
      </div>
    `;
  }

  function buildStatusDistribution(summary) {
    const counts = summary.statusCounts;
    const total = counts.total || 1; // 0 나눗셈 방지

    const rows = STATUS_ORDER.map((key) => {
      const count = counts[key] || 0;
      const pct = Math.round((count / total) * 100);
      return `
        <div class="stats-dist-row">
          <span class="stats-dist-swatch stats-dist-${key}"></span>
          <span class="stats-dist-label">${STATUS_LABELS[key]}</span>
          <div class="stats-dist-bar-track">
            <div class="stats-dist-bar-fill stats-dist-${key}" style="width:${pct}%;"></div>
          </div>
          <span class="stats-dist-count">${count}개 <span class="stats-dist-pct">(${pct}%)</span></span>
        </div>
      `;
    }).join('');

    return `
      <div class="stats-card">
        <div class="stats-card-title">상태별 단어 분포</div>
        <div class="stats-dist-list">${rows}</div>
      </div>
    `;
  }

  function buildWeakWordsSection(summary) {
    const weakWords = summary.weakWords || [];

    if (weakWords.length === 0) {
      return `
        <div class="stats-card">
          <div class="stats-card-title">취약 단어 TOP ${TOP_N}</div>
          <div class="stats-empty-inline">오답 기록이 있는 단어가 없습니다. 훌륭해요!</div>
        </div>
      `;
    }

    const rows = weakWords.map((w, idx) => `
      <li class="stats-weak-item">
        <span class="stats-weak-rank">${idx + 1}</span>
        <div class="stats-weak-body">
          <div class="stats-weak-word">${escapeHtml(w.word)}</div>
          <div class="stats-weak-meaning">${escapeHtml(w.meaning)}</div>
        </div>
        <div class="stats-weak-counts">
          <span class="stats-weak-wrong">오답 ${w.wrongCount}</span>
          <span class="stats-weak-correct">정답 ${w.correctCount}</span>
        </div>
      </li>
    `).join('');

    return `
      <div class="stats-card">
        <div class="stats-card-title">취약 단어 TOP ${TOP_N}</div>
        <div class="stats-card-subtitle">오답이 많은 순서입니다. 이 단어들부터 복습해보세요.</div>
        <ul class="stats-weak-list">${rows}</ul>
      </div>
    `;
  }

  const escapeHtml = htmlUtil.escapeHtml;

  return { mount };
});
