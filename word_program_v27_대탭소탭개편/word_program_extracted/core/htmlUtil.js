/**
 * core/htmlUtil.js
 *
 * HTML 문자열 이스케이프 공용 모듈.
 * quiz/result/stats/wordEditor 등 innerHTML로 사용자 입력(단어/뜻/문장 등)을
 * 그려주는 모듈들이 공통으로 쓰던 escapeHtml 로직을 한 곳으로 모은 것이다.
 *
 * 다른 core 모듈에 의존하지 않는 순수 함수만 제공한다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.htmlUtil = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * 문자열 내 HTML 특수문자(&, <, >, ", ')를 엔티티로 치환한다.
   * innerHTML에 사용자 입력값을 삽입하기 전 항상 이 함수를 거쳐야 한다.
   *
   * @param {*} str - 이스케이프할 값. null/undefined는 빈 문자열로 처리.
   * @returns {string}
   */
  function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  return {
    escapeHtml,
  };
});
