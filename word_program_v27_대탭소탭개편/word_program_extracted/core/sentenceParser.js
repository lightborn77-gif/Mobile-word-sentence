/**
 * core/sentenceParser.js
 *
 * 텍스트 파일(줄 단위, "번호." 접두 형식)을 파싱하여
 * 문장 객체 배열로 변환하는 순수 모듈.
 *
 * 다른 모듈(core 내부 포함)에 의존하지 않는다.
 * 기존 단어 학습 데이터(core/dataParser.js)와는 완전히 독립적인
 * 별도의 "문장 학습" 데이터셋을 위한 파서다.
 *
 * ── 입력 포맷 규칙 ──────────────────────────────────────────
 * 같은 번호(예: "1.")로 시작하는 줄들이 한 그룹이며,
 * 그룹 내 줄은 "등장 순서"대로 다음 2가지 역할을 가진다.
 *   1번째 줄: 영어 문장 (sentence)
 *   2번째 줄: 한글 해석 (translation)
 *
 * 번호 뒤의 첫 "." 까지가 구분자다(dataParser.js의 parseLine과 동일한
 * 정규식 `^(\d+)\.(.*)$` 사용).
 *
 * 그룹 내 줄이 1개뿐이면(해석 누락) translation은 빈 문자열("")로 채운다.
 * 3번째 줄부터는 무시한다(형식 오류 방어, dataParser.js와 동일한 원칙).
 * 빈 줄은 무시한다.
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./lineParseUtil.js'));
  } else {
    root.sentenceParser = factory(root.lineParseUtil);
  }
})(typeof self !== 'undefined' ? self : this, function (lineParseUtil) {
  'use strict';

  /**
   * "1.She works at a bank." 같은 한 줄에서 { id, content }를 추출한다.
   * 번호 뒤의 첫 "." 까지를 구분자로 본다.
   * 형식에 맞지 않는 줄(빈 줄 등)은 null을 반환한다.
   *
   * 하위 호환을 위해 유지하는 export이며, 실제 로직은
   * core/lineParseUtil.js의 parseNumberedLine에 위임한다.
   *
   * @param {string} rawLine
   * @returns {{ id: number, content: string } | null}
   */
  function parseLine(rawLine) {
    return lineParseUtil.parseNumberedLine(rawLine);
  }

  /**
   * 텍스트 파일 전체 내용을 파싱하여 문장 객체 배열로 변환한다.
   *
   * @param {string} rawText - 파일 전체 텍스트
   * @returns {Array<{ id: number, sentence: string, translation: string }>}
   */
  function parseSentenceText(rawText) {
    if (!rawText) return [];

    // id별로 등장 순서대로 content를 모은다: groups[id] = [content1, content2, ...]
    const groups = lineParseUtil.groupNumberedLines(rawText);

    // id 오름차순으로 정렬하여 최종 배열 생성
    const ids = Array.from(groups.keys()).sort((a, b) => a - b);

    const sentences = ids.map((id) => {
      const parts = groups.get(id); // [sentence, translation] 순서, 일부 누락 가능

      const sentence = parts[0] !== undefined ? parts[0].trim() : '';
      const translation = parts[1] !== undefined ? parts[1].trim() : '';

      return { id, sentence, translation };
    });

    return sentences;
  }

  return {
    parseSentenceText,
    parseLine,
  };
});
