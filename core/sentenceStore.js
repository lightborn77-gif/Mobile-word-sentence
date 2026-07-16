/**
 * core/sentenceStore.js
 *
 * 문장 학습 데이터에 대한 공개 API.
 * 기존 단어 관련 모듈(wordStore.js 등)과는 완전히 독립적이며,
 * core/db.js가 정의한 문장용 스토어(sentences/sentenceState/sentenceLists)만
 * 참조한다. wordStore.js를 참조하거나 수정하지 않는다.
 *
 * 공개 API
 * --------
 * [저장/조회] saveSentences, getAllSentences, getSentencesInRange
 * [저장된 문장 리스트(sentenceLists) 관리]
 *   saveSentenceList, getSentenceLists, getSentenceListById,
 *   deleteSentenceList, deleteSentenceLists, loadSentenceList
 *   (wordStore.js의 대응 함수와 동일한 로직을 문장 버전으로 옮긴 것이다.)
 *
 * 현재 제약: sentenceState 스토어는 saveSentences가 초기값만 생성하며,
 * wordStore.recordResult에 대응하는 "정오답 기록/조회" API는 아직 없다.
 * 문장 학습 모드는 정오답 채점 없이 노출/타이핑 방식으로만 동작한다.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'));
  } else {
    root.sentenceStore = factory(root.vocabDB);
  }
})(typeof self !== 'undefined' ? self : this, function (vocabDB) {
  'use strict';

  /**
   * sentenceState의 초기값. 신규 문장 저장 시 이 형태로 생성한다.
   *
   * @param {number} sentenceId
   */
  function makeInitialSentenceState(sentenceId) {
    return {
      sentenceId,
      wrongCount: 0,
      correctCount: 0,
      lastTestedAt: null,
    };
  }

  /**
   * 파싱된 문장 배열(core/sentenceParser.js의 parseSentenceText 결과)을
   * sentences + sentenceState(초기값) 스토어에 일괄 저장한다.
   *
   * 규칙(wordStore.saveWords와 동일):
   * - sentences는 항상 최신 파싱 내용으로 갱신(덮어쓰기)한다.
   * - 이미 sentenceState가 존재하는 id(이전에 학습 이력이 쌓인 문장)는
   *   그대로 보존하고 건드리지 않는다(파일 재업로드로 학습 이력이
   *   초기화되지 않도록).
   * - sentenceState가 없는 새 id에 대해서만 초기값을 생성한다.
   *
   * @param {Array<{id:number, sentence:string, translation:string}>} parsedArray
   * @returns {Promise<void>}
   */
  function saveSentences(parsedArray) {
    if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
      return Promise.resolve();
    }

    // 1) sentences는 전부 덮어쓰기 저장 (단일 트랜잭션)
    const saveSentencesTx = vocabDB.runTransaction(vocabDB.STORE_SENTENCES, 'readwrite', (store) => {
      for (const s of parsedArray) {
        store.put({
          id: s.id,
          sentence: s.sentence,
          translation: s.translation,
        });
      }
    });

    // 2) sentenceState는 기존 항목이 없는 id에 대해서만 초기값 생성.
    //    먼저 기존 sentenceState 전체를 읽어 존재 여부를 판단한 뒤,
    //    없는 id만 별도 트랜잭션에서 put한다.
    const saveStatesTx = vocabDB.getAll(vocabDB.STORE_SENTENCE_STATE).then((existingStates) => {
      const existingIds = new Set(existingStates.map((s) => s.sentenceId));
      const missing = parsedArray.filter((s) => !existingIds.has(s.id));

      if (missing.length === 0) return Promise.resolve();

      return vocabDB.runTransaction(vocabDB.STORE_SENTENCE_STATE, 'readwrite', (store) => {
        for (const s of missing) {
          store.put(makeInitialSentenceState(s.id));
        }
      });
    });

    return Promise.all([saveSentencesTx, saveStatesTx]).then(() => undefined);
  }

  /**
   * sentences 스토어 전체를 조회한다. id 오름차순으로 정렬해서 반환한다.
   *
   * @returns {Promise<Array>}
   */
  function getAllSentences() {
    return vocabDB.getAll(vocabDB.STORE_SENTENCES).then((sentences) => {
      return sentences.slice().sort((a, b) => a.id - b.id);
    });
  }

  /**
   * id가 startId ~ endId (양 끝 포함) 범위인 문장만 조회한다.
   * startId/endId가 비정상(숫자 아님, startId > endId 등)이면
   * 방어적으로 처리하여 전체 범위로 대응한다.
   *
   * @param {number} startId
   * @param {number} endId
   * @returns {Promise<Array>}
   */
  function getSentencesInRange(startId, endId) {
    return getAllSentences().then((sentences) => {
      const start = Number(startId);
      const end = Number(endId);

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return sentences;
      }

      const lo = Math.min(start, end);
      const hi = Math.max(start, end);

      return sentences.filter((s) => s.id >= lo && s.id <= hi);
    });
  }

  /**
   * 파싱된 문장 배열을 "저장된 리스트" 스냅샷으로 sentenceLists 스토어에
   * 새로 저장한다(현재 활성 sentences/sentenceState 스토어는 건드리지 않는다).
   *
   * @param {string} name - 리스트를 구분할 이름(예: 업로드한 파일명)
   * @param {Array} sentences - core/sentenceParser.parseSentenceText 결과
   * @param {number} [existingId] - 지정하면 새로 만들지 않고 해당 id의 리스트를
   *        갱신(덮어쓰기)한다. 지정하지 않으면 새 리스트를 생성한다(id 자동 부여).
   * @returns {Promise<number>} 생성 또는 갱신된 리스트의 id
   */
  function saveSentenceList(name, sentences, existingId) {
    const record = {
      name: name || '이름 없는 리스트',
      createdAt: Date.now(),
      sentences: Array.isArray(sentences) ? sentences : [],
    };
    if (existingId !== undefined && existingId !== null) {
      record.id = existingId;
    }
    return vocabDB.put(vocabDB.STORE_SENTENCE_LISTS, record);
  }

  /**
   * 저장된 문장 리스트 전체를 최신 생성순으로 조회한다.
   * 목록 UI에서는 sentences 배열까지 필요하지 않으므로 개수(count)만 붙여
   * 가볍게 반환한다(sentences 원본 배열은 응답에서 제외).
   *
   * @returns {Promise<Array<{id:number, name:string, createdAt:number, count:number}>>}
   */
  function getSentenceLists() {
    return vocabDB.getAll(vocabDB.STORE_SENTENCE_LISTS).then((lists) => {
      return lists
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((l) => ({
          id: l.id,
          name: l.name,
          createdAt: l.createdAt,
          count: Array.isArray(l.sentences) ? l.sentences.length : 0,
        }));
    });
  }

  /**
   * 저장된 문장 리스트 하나를 id로 조회한다(sentences 원본 배열 포함).
   *
   * @param {number} id
   * @returns {Promise<{id:number, name:string, createdAt:number, sentences:Array}|undefined>}
   */
  function getSentenceListById(id) {
    return vocabDB.get(vocabDB.STORE_SENTENCE_LISTS, id);
  }

  /**
   * 저장된 문장 리스트 하나를 id로 삭제한다.
   *
   * @param {number} id
   * @returns {Promise<void>}
   */
  function deleteSentenceList(id) {
    return vocabDB.delete(vocabDB.STORE_SENTENCE_LISTS, id);
  }

  /**
   * 저장된 문장 리스트 여러 개를 한 번에 삭제한다(체크박스 선택 삭제용).
   *
   * @param {Array<number>} ids
   * @returns {Promise<void>}
   */
  function deleteSentenceLists(ids) {
    const targets = Array.isArray(ids) ? ids : [];
    if (targets.length === 0) return Promise.resolve();
    return Promise.all(targets.map((id) => deleteSentenceList(id))).then(() => undefined);
  }

  /**
   * 저장된 문장 리스트 하나를 불러와 현재 활성 sentences/sentenceState
   * 스토어에 반영한다.
   * (saveSentences와 동일한 규칙: sentences는 덮어쓰기, 기존 sentenceState는 보존)
   *
   * @param {number} id
   * @returns {Promise<Array>} 반영된 문장 배열(sentences 필드 원본)
   */
  function loadSentenceList(id) {
    return vocabDB.get(vocabDB.STORE_SENTENCE_LISTS, id).then((record) => {
      if (!record) {
        throw new Error('저장된 문장 리스트를 찾을 수 없습니다.');
      }
      const sentences = Array.isArray(record.sentences) ? record.sentences : [];
      return saveSentences(sentences).then(() => sentences);
    });
  }

  return {
    saveSentences,
    getAllSentences,
    getSentencesInRange,
    saveSentenceList,
    getSentenceLists,
    getSentenceListById,
    deleteSentenceList,
    deleteSentenceLists,
    loadSentenceList,
  };
});
