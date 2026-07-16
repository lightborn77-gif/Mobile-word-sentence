/**
 * core/conversationStore.js
 *
 * 회화 학습 데이터에 대한 공개 API.
 * core/sentenceStore.js의 구조(짧고 단순한 저장/조회 API)를 패턴으로
 * 삼되, 다국어 TTS 연동(리스트 단위 lang 저장)은 core/wordStore.js의
 * saveWordList/getWordLists/getWordListById/loadWordList 구현을 그대로
 * 따른다.
 *
 * 다른 모듈(wordStore.js, sentenceStore.js 등)을 참조하거나 수정하지
 * 않는다. core/db.js가 정의한 회화용 스토어(conversations/
 * conversationLists)만 참조하는 완전히 독립된 모듈이다.
 *
 * ── 공개 API ──────────────────────────────────────────────────
 * 파싱된 회화 턴 배열(core/conversationParser.parseConversationText 결과)을
 * IndexedDB에 저장하고 다시 불러오는 API를 제공한다. 정오답 채점 개념이
 * 없는 모드이므로 wordState/sentenceState에 대응하는 "회화 학습 상태"
 * 스토어는 두지 않는다.
 *
 * ── conversations 스토어 저장 방식 ──────────────────────────────
 * sentences 스토어와 동일하게 "현재 활성 회화 세트" 하나를 턴 단위
 * 개별 레코드로 풀어서 저장한다(파일 하나 = 턴 여러 개 = 레코드 여러 개,
 * keyPath는 "id"이며 각 레코드의 id에는 턴 번호(turn)를 그대로 사용한다).
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    root.conversationStore = factory(root.vocabDB);
  }
})(typeof self !== 'undefined' ? self : this, function (vocabDB) {
  'use strict';

  /**
   * 리스트에 lang 필드가 없을 때(다국어 TTS 지원 이전에 저장된 예전
   * 리스트) 사용할 기본 언어. ttsEngine.speak의 기본값 및
   * wordStore.DEFAULT_LANG과 동일하게 맞춘다.
   */
  const DEFAULT_LANG = 'en-US';

  /**
   * 파싱된 회화 턴 배열(core/conversationParser.parseConversationText
   * 결과)을 현재 활성 회화(conversations 스토어)로 덮어쓴다.
   *
   * sentences 스토어와 동일한 방식: 각 턴을 { id: turn, speaker, line,
   * translation } 레코드로 풀어 저장한다. id로 turn 번호를 그대로
   * 쓰므로, 새 회화를 저장하기 전에 기존 레코드를 모두 지운 뒤
   * put한다(턴 개수가 줄어든 새 파일을 업로드했을 때 이전 파일의
   * 남는 뒷부분 턴이 잔존하지 않도록).
   *
   * @param {Array<{turn:number, speaker:'a'|'b', line:string, translation:string}>} turns
   * @returns {Promise<void>}
   */
  function saveConversation(turns) {
    const list = Array.isArray(turns) ? turns : [];

    return vocabDB.getAll(vocabDB.STORE_CONVERSATIONS).then((existing) => {
      return vocabDB.runTransaction(vocabDB.STORE_CONVERSATIONS, 'readwrite', (store) => {
        // 기존 활성 회화를 전부 비운다(턴 수가 줄어든 새 파일 반영 시
        // 이전 턴의 잔존을 막기 위함).
        for (const rec of existing) {
          store.delete(rec.id);
        }
        for (const t of list) {
          store.put({
            id: t.turn,
            speaker: t.speaker,
            line: t.line,
            translation: t.translation,
          });
        }
      });
    });
  }

  /**
   * 현재 활성 회화(conversations 스토어) 전체를 조회한다.
   * id(=turn 번호) 오름차순으로 정렬해서 반환하며, 반환되는 각 항목의
   * 필드명은 turn/speaker/line/translation으로 통일한다(저장 시
   * id로 옮겨둔 turn 번호를 다시 turn 필드로 되돌려 준다).
   *
   * @returns {Promise<Array<{turn:number, speaker:'a'|'b', line:string, translation:string}>>}
   */
  function getAllTurns() {
    return vocabDB.getAll(vocabDB.STORE_CONVERSATIONS).then((records) => {
      return records
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((r) => ({
          turn: r.id,
          speaker: r.speaker,
          line: r.line,
          translation: r.translation,
        }));
    });
  }

  /**
   * 파싱된 회화 턴 배열을 "저장된 리스트" 스냅샷으로 conversationLists
   * 스토어에 새로 저장한다(현재 활성 conversations 스토어는 건드리지
   * 않는다).
   *
   * wordStore.saveWordList와 동일한 시그니처 패턴(넷째 인자 lang) 및
   * 동일한 lang 보존 규칙을 따른다: existingId로 갱신하면서 lang을
   * 넘기지 않으면(예: 리스트 이어붙이기 등) 기존 리스트의 lang을
   * 그대로 유지한다.
   *
   * @param {string} name - 리스트를 구분할 이름(예: 업로드한 파일명)
   * @param {Array} turns - core/conversationParser.parseConversationText 결과
   * @param {number} [existingId] - 지정하면 새로 만들지 않고 해당 id의
   *        리스트를 갱신(덮어쓰기)한다. 지정하지 않으면 새 리스트를
   *        생성한다(id 자동 부여).
   * @param {string} [lang] - 발음 언어 코드(BCP 47, 예: 'en-US'). 생략 시
   *        DEFAULT_LANG(신규 저장) 또는 기존 값 유지(existingId로 갱신 시
   *        lang을 안 넘기면 기존 레코드의 lang을 그대로 보존한다).
   * @returns {Promise<number>} 생성 또는 갱신된 리스트의 id
   */
  function saveConversationList(name, turns, existingId, lang) {
    const record = {
      name: name || '이름 없는 리스트',
      createdAt: Date.now(),
      turns: Array.isArray(turns) ? turns : [],
      lang: lang || DEFAULT_LANG,
    };
    if (existingId !== undefined && existingId !== null) {
      record.id = existingId;
      if (!lang) {
        // 언어를 명시적으로 넘기지 않은 갱신은 기존 리스트의 발음
        // 언어를 그대로 유지한다(wordStore.saveWordList와 동일 규칙).
        return vocabDB.get(vocabDB.STORE_CONVERSATION_LISTS, existingId).then((existingRecord) => {
          record.lang = (existingRecord && existingRecord.lang) || DEFAULT_LANG;
          return vocabDB.put(vocabDB.STORE_CONVERSATION_LISTS, record);
        });
      }
    }
    return vocabDB.put(vocabDB.STORE_CONVERSATION_LISTS, record);
  }

  /**
   * 저장된 회화 리스트 전체를 최신 생성순으로 조회한다.
   * 목록 UI에서는 turns 배열까지 필요하지 않으므로 개수(count)만 붙여
   * 가볍게 반환한다(turns 원본 배열은 응답에서 제외).
   *
   * lang은 다국어 TTS 지원 이전에 저장된 리스트에는 없을 수 있으므로
   * DEFAULT_LANG으로 보정해서 반환한다.
   *
   * @returns {Promise<Array<{id:number, name:string, createdAt:number, count:number, lang:string}>>}
   */
  function getConversationLists() {
    return vocabDB.getAll(vocabDB.STORE_CONVERSATION_LISTS).then((lists) => {
      return lists
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((l) => ({
          id: l.id,
          name: l.name,
          createdAt: l.createdAt,
          count: Array.isArray(l.turns) ? l.turns.length : 0,
          lang: l.lang || DEFAULT_LANG,
        }));
    });
  }

  /**
   * 저장된 회화 리스트 하나를 id로 조회한다(turns 원본 배열 포함,
   * 편집/상세용).
   *
   * lang은 다국어 TTS 지원 이전에 저장된 리스트에는 없을 수 있으므로
   * DEFAULT_LANG으로 보정해서 반환한다.
   *
   * @param {number} id
   * @returns {Promise<{id:number, name:string, createdAt:number, turns:Array, lang:string}|undefined>}
   */
  function getConversationListById(id) {
    return vocabDB.get(vocabDB.STORE_CONVERSATION_LISTS, id).then((record) => {
      if (!record) return record;
      return { ...record, lang: record.lang || DEFAULT_LANG };
    });
  }

  /**
   * 저장된 회화 리스트 하나를 id로 삭제한다.
   *
   * @param {number} id
   * @returns {Promise<void>}
   */
  function deleteConversationList(id) {
    return vocabDB.delete(vocabDB.STORE_CONVERSATION_LISTS, id);
  }

  /**
   * 저장된 회화 리스트 여러 개를 한 번에 삭제한다(체크박스 선택 삭제용).
   *
   * @param {Array<number>} ids
   * @returns {Promise<void>}
   */
  function deleteConversationLists(ids) {
    const targets = Array.isArray(ids) ? ids : [];
    if (targets.length === 0) return Promise.resolve();
    return Promise.all(targets.map((id) => deleteConversationList(id))).then(() => undefined);
  }

  /**
   * 저장된 회화 리스트 하나를 불러와 현재 활성 conversations 스토어에
   * 반영한다(saveConversation과 동일한 규칙: 기존 활성 회화를 덮어쓴다).
   *
   * 다국어 TTS: 반환값에 lang을 함께 포함한다(wordStore.loadWordList의
   * 최신 반환 형태와 동일 패턴, words 대신 turns). 상위(app/main.js)는
   * 이 값을 받아 "현재 학습 언어" 설정(activeLang)을 갱신하고, 이후
   * conversationMode에 발음 언어로 전달한다.
   *
   * @param {number} id
   * @returns {Promise<{ turns: Array, lang: string }>} 반영된 턴 배열과 리스트의 언어
   */
  function loadConversationList(id) {
    return vocabDB.get(vocabDB.STORE_CONVERSATION_LISTS, id).then((record) => {
      if (!record) {
        throw new Error('저장된 회화 리스트를 찾을 수 없습니다.');
      }
      const turns = Array.isArray(record.turns) ? record.turns : [];
      const lang = record.lang || DEFAULT_LANG;
      return saveConversation(turns).then(() => ({ turns, lang }));
    });
  }

  return {
    saveConversation,
    getAllTurns,
    saveConversationList,
    getConversationLists,
    getConversationListById,
    deleteConversationList,
    deleteConversationLists,
    loadConversationList,
    DEFAULT_LANG,
  };
});
