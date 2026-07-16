/**
 * core/lineParseUtil.js
 *
 * "숫자." 접두 형식 줄 파싱 공용 모듈.
 * dataParser.js(단어)와 sentenceParser.js(문장)가 공통으로 쓰던
 * "번호별로 줄을 그룹핑"하는 로직을 한 곳으로 모은 것이다.
 * conversationParser.js는 화자 라벨 기반의 다른 방식이라 이 모듈과 무관하다.
 *
 * 다른 core 모듈에 의존하지 않는 순수 함수만 제공한다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.lineParseUtil = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * "숫자." 로 시작하는 한 줄에서 { id, content }를 추출한다.
   * 번호 뒤의 첫 "." 까지를 구분자로 본다.
   * 형식에 맞지 않는 줄(빈 줄 등)은 null을 반환한다.
   *
   * 줄 끝 캐리지리턴(\r) 등 제거는 하되, 내용 자체는 trim하지 않는다
   * (뜻/예문/문장/해석 내부의 의미 있는 공백을 보존하기 위함). 다만 앞뒤
   * 불필요한 개행 문자만 제거한다.
   *
   * @param {string} rawLine
   * @returns {{ id: number, content: string } | null}
   */
  function parseNumberedLine(rawLine) {
    if (rawLine == null) return null;

    const line = rawLine.replace(/\r$/, '');

    if (line.trim() === '') return null;

    // "숫자." 로 시작하는 패턴만 유효한 줄로 인식
    const match = line.match(/^(\d+)\.(.*)$/);
    if (!match) return null;

    return { id: parseInt(match[1], 10), content: match[2] };
  }

  /**
   * 텍스트 전체를 번호별로 그룹핑한다.
   * 같은 번호(예: "1.")로 시작하는 줄들을 등장 순서대로 묶는다.
   *
   * @param {string} rawText - 파일 전체 텍스트
   * @returns {Map<number, string[]>} id → 등장 순서를 보존한 content 배열
   */
  function groupNumberedLines(rawText) {
    const groups = new Map();
    if (!rawText) return groups;

    const lines = rawText.split('\n');
    for (const rawLine of lines) {
      const parsed = parseNumberedLine(rawLine);
      if (!parsed) continue;

      if (!groups.has(parsed.id)) groups.set(parsed.id, []);
      groups.get(parsed.id).push(parsed.content);
    }

    return groups;
  }

  return {
    parseNumberedLine,
    groupNumberedLines,
  };
});
