/**
 * core/dataParser.js
 *
 * 텍스트 파일(줄 단위, "번호." 접두 형식)을 파싱하여
 * 단어 객체 배열로 변환하는 순수 모듈.
 *
 * 다른 모듈(core 내부 포함)에 의존하지 않는다.
 * flashcard/quiz 등 상위 모듈은 이 파일이 export하는 함수만 사용한다.
 *
 * ── 입력 포맷 규칙 ──────────────────────────────────────────
 * 같은 번호(예: "1.")로 시작하는 줄들이 한 그룹이며,
 * 그룹 내 줄은 "등장 순서"대로 다음 4가지 역할을 가진다.
 *   1번째 줄: 단어 (word)
 *   2번째 줄: 뜻 (meaning)
 *   3번째 줄: 파생어 원본 (쉼표로 구분, 각 항목 접두 기호로 분류)
 *              "-" → antonyms, "=" → synonyms, "&" → derived, 없음 → other
 *              각 항목 내부에 "*" 가 있으면 첫 "*" 기준으로 뜻을 분리한다.
 *              예) "-retain*유지하다" → { text: "retain", meaning: "유지하다" }
 *              "*" 가 없으면 meaning은 빈 문자열("")로 채운다.
 *   4번째 줄: 예문 (example). 첫 ">" 기준으로 문장/해석을 분리한다.
 *              예) "She left.>그녀는 떠났다." →
 *                  { sentence: "She left.", translation: "그녀는 떠났다." }
 *              ">" 가 없으면 translation은 빈 문자열("")이다.
 *
 * 그룹 내 줄 수는 1~4개로 가변적이다(파생어/예문 줄이 없을 수 있음).
 * 4줄을 초과하는 경우 5번째 줄부터는 무시한다(형식 오류 방어).
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./lineParseUtil.js'));
  } else {
    root.dataParser = factory(root.lineParseUtil);
  }
})(typeof self !== 'undefined' ? self : this, function (lineParseUtil) {
  'use strict';

  /**
   * "1.abandon" 같은 한 줄에서 { id, content }를 추출한다.
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
   * 항목 텍스트를 첫 "*" 기준으로 { text, meaning } 로 분리한다.
   * "*" 가 없으면 meaning은 빈 문자열이다.
   * "*" 가 여러 번 나오는 경우 첫 번째만 구분자로 쓰고 나머지는 meaning에 포함한다.
   *
   * @param {string} item - 기호가 제거된 항목 텍스트
   * @returns {{ text: string, meaning: string }}
   */
  function splitTextMeaning(item) {
    const starIdx = item.indexOf('*');
    if (starIdx === -1) {
      return { text: item.trim(), meaning: '' };
    }
    const text = item.slice(0, starIdx).trim();
    const meaning = item.slice(starIdx + 1).trim();
    return { text, meaning };
  }

  /**
   * 파생어 원본 줄을 { antonyms, synonyms, derived, other } 구조로 분류한다.
   * 쉼표로 항목을 나누고, 각 항목 앞의 기호(-, =, &)로 분류한다.
   * 기호가 없으면 other로 분류한다.
   * 분류된 배열의 각 원소는 { text, meaning } 객체이며,
   * 항목 내부에 "*" 가 있으면 첫 "*" 기준으로 text/meaning을 분리한다.
   * "*" 가 없으면 meaning은 빈 문자열("")이다.
   *
   * @param {string} derivativesRaw
   * @returns {{
   *   antonyms: Array<{text: string, meaning: string}>,
   *   synonyms: Array<{text: string, meaning: string}>,
   *   derived: Array<{text: string, meaning: string}>,
   *   other: Array<{text: string, meaning: string}>
   * }}
   */
  function parseDerivatives(derivativesRaw) {
    const result = {
      antonyms: [],
      synonyms: [],
      derived: [],
      other: [],
    };

    if (!derivativesRaw || derivativesRaw.trim() === '') {
      return result;
    }

    const items = derivativesRaw.split(',');

    for (let raw of items) {
      const item = raw.trim();
      if (item === '') continue;

      const firstChar = item.charAt(0);

      if (firstChar === '-') {
        result.antonyms.push(splitTextMeaning(item.slice(1).trim()));
      } else if (firstChar === '=') {
        result.synonyms.push(splitTextMeaning(item.slice(1).trim()));
      } else if (firstChar === '&') {
        result.derived.push(splitTextMeaning(item.slice(1).trim()));
      } else {
        // 기호 없음 → 기타로 분류
        result.other.push(splitTextMeaning(item));
      }
    }

    return result;
  }

  /**
   * 예문 원본 줄을 { sentence, translation } 으로 분리한다.
   * 첫 ">" 기준으로 나누며, ">" 가 없으면 translation은 빈 문자열이다.
   *
   * @param {string} exampleRaw
   * @returns {{ sentence: string, translation: string }}
   */
  function parseExample(exampleRaw) {
    if (!exampleRaw || exampleRaw.trim() === '') {
      return { sentence: '', translation: '' };
    }

    const gtIdx = exampleRaw.indexOf('>');
    if (gtIdx === -1) {
      return { sentence: exampleRaw.trim(), translation: '' };
    }

    const sentence = exampleRaw.slice(0, gtIdx).trim();
    const translation = exampleRaw.slice(gtIdx + 1).trim();
    return { sentence, translation };
  }

  /**
   * 텍스트 파일 전체 내용을 파싱하여 단어 객체 배열로 변환한다.
   *
   * @param {string} rawText - 파일 전체 텍스트
   * @returns {Array<{
   *   id: number,
   *   word: string,
   *   meaning: string,
   *   derivatives: {
   *     antonyms: Array<{text: string, meaning: string}>,
   *     synonyms: Array<{text: string, meaning: string}>,
   *     derived: Array<{text: string, meaning: string}>,
   *     other: Array<{text: string, meaning: string}>
   *   },
   *   example: { sentence: string, translation: string }
   * }>}
   */
  function parseVocabText(rawText) {
    if (!rawText) return [];

    // id별로 등장 순서대로 content를 모은다: groups[id] = [content1, content2, ...]
    const groups = lineParseUtil.groupNumberedLines(rawText);

    // id 오름차순으로 정렬하여 최종 배열 생성
    const ids = Array.from(groups.keys()).sort((a, b) => a - b);

    const words = ids.map((id) => {
      const parts = groups.get(id); // [word, meaning, derivativesRaw, exampleRaw] 순서, 일부 누락 가능

      const word = parts[0] !== undefined ? parts[0].trim() : '';
      const meaning = parts[1] !== undefined ? parts[1].trim() : '';
      const derivativesRaw = parts[2] !== undefined ? parts[2] : '';
      const exampleRaw = parts[3] !== undefined ? parts[3] : '';

      return {
        id,
        word,
        meaning,
        derivatives: parseDerivatives(derivativesRaw),
        example: parseExample(exampleRaw),
      };
    });

    return words;
  }

  return {
    parseVocabText,
    parseDerivatives, // 단위 테스트 및 재사용을 위해 함께 export
    parseExample,
    parseLine,
  };
});
