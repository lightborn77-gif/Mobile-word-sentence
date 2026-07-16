/**
 * core/conversationParser.js
 *
 * 텍스트 파일(줄 단위, "화자 라벨" 접두 형식)을 파싱하여
 * 회화 턴 객체 배열로 변환하는 순수 모듈.
 *
 * 다른 모듈(core 내부 포함)에 의존하지 않는다.
 * core/sentenceParser.js를 참고 패턴으로 삼되, "같은 번호 그룹" 방식이
 * 아니라 "화자 라벨 줄 감지" 방식으로 파싱한다는 점이 다르다(회화가
 * 길어질 때마다 매 줄에 번호를 붙이는 것이 비현실적이라는 이유로 번호
 * 방식 자체를 배제하기로 결정됨 — 향후 수정 시에도 이 결정을 뒤집지
 * 말 것).
 *
 * ── 입력 포맷 규칙 ──────────────────────────────────────────
 * "a:" 또는 "b:"(대소문자 무관, 즉 A:/B:도 허용)로 시작하는 줄이 새 턴의
 * "대사" 줄이다. 그 다음 줄이 그 턴의 "해석" 줄이다.
 *
 *   a:Hello, how are you?
 *   안녕, 어떻게 지내?
 *   b:I'm fine, thank you.
 *   난 잘 지내, 고마워.
 *
 * 턴 번호(turn)는 파일 안에 번호가 없으므로 파서가 등장 순서대로
 * 자동으로 매긴다(1, 2, 3, ...).
 * speaker 값은 항상 소문자로 정규화해서 저장한다(입력이 "A:"든 "a:"든
 * 결과 speaker는 항상 'a').
 * 해석 줄이 없으면(파일 끝에서 대사만 있고 잘림) translation은 빈
 * 문자열로 채운다(방어적 처리, sentenceParser/dataParser와 동일 원칙).
 * 빈 줄은 무시한다(다음 유효한 줄을 찾을 때까지 건너뛴다).
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.conversationParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // "a:" / "A:" / "b:" / "B:" 로 시작하는 줄만 "대사(화자 라벨) 줄"로 인식.
  // 대소문자 무관 처리를 위해 'i' 플래그 사용.
  const SPEAKER_LINE_RE = /^[aAbB]:(.*)$/;

  /**
   * 한 줄이 화자 라벨 줄인지 판별하고, 맞다면 { speaker, line }을 추출한다.
   * 화자 라벨 줄이 아니면 null을 반환한다.
   *
   * @param {string} rawLine
   * @returns {{ speaker: 'a'|'b', line: string } | null}
   */
  function parseSpeakerLine(rawLine) {
    if (rawLine == null) return null;

    const line = rawLine.replace(/\r$/, '');
    if (line.trim() === '') return null;

    const match = line.match(SPEAKER_LINE_RE);
    if (!match) return null;

    const speaker = line.charAt(0).toLowerCase(); // 'a' | 'b'
    const content = match[1].trim();

    return { speaker, line: content };
  }

  /**
   * 텍스트 파일 전체 내용을 파싱하여 회화 턴 객체 배열로 변환한다.
   *
   * 동작 방식:
   * - 빈 줄이 아닌 각 줄을 순회한다.
   * - 화자 라벨 줄(a:/b:)을 만나면 새 턴을 시작한다(turn 번호는 등장
   *   순서대로 자동 증가).
   * - 화자 라벨 줄이 아닌 그 다음의 첫 유효한(비어있지 않은) 줄은 직전
   *   턴의 해석(translation)으로 채워진다.
   * - 화자 라벨 줄을 만나기 전에 나오는 줄(파일이 a:/b: 없이 시작하는
   *   경우 등)은 어느 턴에도 속하지 않으므로 무시한다.
   * - 파일이 대사 줄로 끝나 해석 줄이 없는 마지막 턴은 translation을
   *   빈 문자열로 채운다.
   *
   * @param {string} rawText - 파일 전체 텍스트
   * @returns {Array<{ turn: number, speaker: 'a'|'b', line: string, translation: string }>}
   */
  function parseConversationText(rawText) {
    if (!rawText) return [];

    const lines = rawText.split('\n');
    const turns = [];
    let currentTurn = null; // 해석 줄을 기다리고 있는 턴(없으면 null)

    for (const rawLine of lines) {
      // 완전한 빈 줄은 무시(다음 유효 줄을 계속 찾는다)
      const line = rawLine.replace(/\r$/, '');
      if (line.trim() === '') continue;

      const speakerMatch = parseSpeakerLine(line);

      if (speakerMatch) {
        // 새 턴 시작. 직전 턴이 해석을 못 받았다면 빈 문자열로 이미
        // 초기화되어 있으므로(아래 push 시 translation: '') 그대로 둔다.
        currentTurn = {
          turn: turns.length + 1,
          speaker: speakerMatch.speaker,
          line: speakerMatch.line,
          translation: '',
        };
        turns.push(currentTurn);
      } else if (currentTurn && currentTurn.translation === '') {
        // 화자 라벨이 아닌 줄 = 직전 턴의 해석 줄로 채운다.
        // 이미 해석이 채워진 턴에 대해서는(3번째 줄 이상) 무시한다
        // (형식 오류 방어, dataParser.js/sentenceParser.js와 동일 원칙).
        currentTurn.translation = line.trim();
      }
      // currentTurn이 아직 없는 상태(파일이 a:/b: 없이 시작)에서 만난
      // 줄은 어느 턴에도 속하지 않으므로 무시한다.
    }

    return turns;
  }

  return {
    parseConversationText,
    parseSpeakerLine,
  };
});
