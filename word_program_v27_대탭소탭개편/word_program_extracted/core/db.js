/**
 * core/db.js
 *
 * IndexedDB 데이터베이스 초기화 및 저수준 접근 전담 모듈.
 *
 * 이 파일은 "연결을 얻고, 트랜잭션을 열고, 원시 CRUD를 수행하는" 역할만 담당한다.
 * 단어/상태 데이터에 대한 의미 있는 API(저장 규칙, 병합 규칙 등)는
 * core/wordStore.js가 이 모듈 위에서 제공한다.
 * 다른 모듈(flashcard/quiz/result/app)은 이 파일을 직접 참조하지 않고
 * 반드시 wordStore를 통해서만 데이터에 접근한다.
 *
 * ── 스키마 ──────────────────────────────────────────────────
 * DB 이름: vocabQuizDB (버전: 4)
 *
 * [단어 학습 데이터]
 * 1) words        keyPath: "id"
 *    필드: word, meaning,
 *          derivatives({antonyms,synonyms,derived,other}, 각 원소는 {text, meaning}),
 *          example({sentence, translation})
 *
 * 2) wordState     keyPath: "wordId"
 *    필드: wrongCount(number), correctCount(number),
 *          consecutiveCorrect(number), lastTestedAt(timestamp|null),
 *          tested(boolean) — 퀴즈로 한 번이라도 출제되면 true(신규 저장 시
 *          초기값 false). 이 필드의 판정/갱신 로직은 core/stateManager.js가
 *          담당하며, db.js는 저장소 구조만 정의한다.
 *
 * 3) settings      keyPath: "key" (key-value 저장용 범용 스토어)
 *
 * 4) wordLists     keyPath: "id" (autoIncrement)
 *    필드: id, name(string), createdAt(timestamp), words(Array) — 업로드 시점의
 *          파싱 결과 스냅샷을 통째로 저장한다. "저장된 리스트" 목록 UI(선택
 *          삭제/불러오기)에서 사용하며, words/wordState 스토어(현재 활성
 *          단어장)와는 별개의 저장소다. 목록에서 "불러오기"를 누르면 이
 *          스냅샷을 words/wordState 스토어에 다시 반영(saveWords)한다.
 *
 * [문장 학습 데이터]
 * 기존 단어 데이터(words/wordState/wordLists)와는 완전히 독립적인 별도의
 * "문장 학습" 데이터셋. 별도 텍스트 파일로 업로드되고, 아래 3개 스토어에
 * 저장되며 문장 학습 모드(modules/sentenceMode)에서 사용된다.
 *
 * 5) sentences       keyPath: "id"
 *    필드: id, sentence(영어 문장), translation(한글 해석)
 *
 * 6) sentenceState   keyPath: "sentenceId"
 *    필드: sentenceId, wrongCount(number), correctCount(number),
 *          lastTestedAt(timestamp|null)
 *
 * 7) sentenceLists   keyPath: "id" (autoIncrement)
 *    필드: id, name(string), createdAt(timestamp), sentences(Array) —
 *          업로드 시점의 파싱 결과 스냅샷을 통째로 저장한다. wordLists와
 *          동일한 역할의 문장 버전.
 *
 * [회화 학습 데이터]
 * 기존 단어/문장 데이터와는 완전히 독립적인 별도의 "회화 학습" 데이터셋.
 * a:/b: 화자 라벨이 붙은 텍스트 파일로 업로드되며, 아래 2개 스토어에
 * 저장된다. wordLists와 마찬가지로 리스트 단위 발음 언어(lang)를 함께
 * 저장하여 다국어 TTS(wordStore.DEFAULT_LANG/saveWordList의 lang 인자,
 * app/main.js의 activeLang 패턴)와 동일하게 연동한다.
 *
 * 8) conversations      keyPath: "id"
 *    필드: id(number, turn 번호), speaker('a'|'b'), line(대사 원문),
 *          translation(해석) — sentences 스토어와 동일하게 "현재 활성
 *          회화 세트" 하나를 저장하는 용도(파일 하나 전체 = 여러 개의
 *          턴 레코드로 풀어서 저장, 각 레코드의 id가 곧 turn 번호).
 *          회화 모드는 정오답 채점 개념이 없으므로 sentenceState 같은
 *          학습 상태 스토어는 두지 않는다.
 *
 * 9) conversationLists  keyPath: "id" (autoIncrement)
 *    필드: id, name(string), createdAt(timestamp), turns(Array —
 *          conversationParser.parseConversationText 결과 스냅샷),
 *          lang(string, BCP 47) — 업로드/저장 시점의 파싱 결과 전체를
 *          스냅샷으로 저장한다. wordLists/sentenceLists와 동일한 역할의
 *          회화 버전이되, lang 필드를 함께 저장한다는 점이 다르다
 *          (다국어 TTS 연동).
 * ------------------------------------------------------------
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.vocabDB = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const DB_NAME = 'vocabQuizDB';
  const DB_VERSION = 4;

  const STORE_WORDS = 'words';
  const STORE_WORD_STATE = 'wordState';
  const STORE_SETTINGS = 'settings';
  const STORE_WORD_LISTS = 'wordLists';
  const STORE_SENTENCES = 'sentences';
  const STORE_SENTENCE_STATE = 'sentenceState';
  const STORE_SENTENCE_LISTS = 'sentenceLists';
  const STORE_CONVERSATIONS = 'conversations';
  const STORE_CONVERSATION_LISTS = 'conversationLists';

  let dbPromise = null;

  /**
   * DB 연결을 연다(이미 열려 있으면 캐시된 Promise를 재사용).
   * onupgradeneeded에서 최초 생성 시 오브젝트 스토어를 만든다.
   *
   * @returns {Promise<IDBDatabase>}
   */
  function openDB() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in (typeof window !== 'undefined' ? window : self))) {
        reject(new Error('이 브라우저는 IndexedDB를 지원하지 않습니다.'));
        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        const db = event.target.result;

        if (!db.objectStoreNames.contains(STORE_WORDS)) {
          db.createObjectStore(STORE_WORDS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_WORD_STATE)) {
          db.createObjectStore(STORE_WORD_STATE, { keyPath: 'wordId' });
        }

        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' });
        }

        if (!db.objectStoreNames.contains(STORE_WORD_LISTS)) {
          db.createObjectStore(STORE_WORD_LISTS, { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains(STORE_SENTENCES)) {
          db.createObjectStore(STORE_SENTENCES, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_SENTENCE_STATE)) {
          db.createObjectStore(STORE_SENTENCE_STATE, { keyPath: 'sentenceId' });
        }

        if (!db.objectStoreNames.contains(STORE_SENTENCE_LISTS)) {
          db.createObjectStore(STORE_SENTENCE_LISTS, { keyPath: 'id', autoIncrement: true });
        }

        if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
          db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
        }

        if (!db.objectStoreNames.contains(STORE_CONVERSATION_LISTS)) {
          db.createObjectStore(STORE_CONVERSATION_LISTS, { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = function (event) {
        resolve(event.target.result);
      };

      request.onerror = function (event) {
        dbPromise = null; // 실패 시 다음 호출에서 재시도 가능하도록 캐시 초기화
        reject(event.target.error || new Error('IndexedDB를 여는 중 오류가 발생했습니다.'));
      };
    });

    return dbPromise;
  }

  /**
   * 트랜잭션을 열고 콜백에 오브젝트 스토어를 넘겨준다.
   * 콜백은 IDBRequest를 반환해야 하며, 그 결과를 Promise로 감싸 돌려준다.
   *
   * @param {string} storeName
   * @param {'readonly'|'readwrite'} mode
   * @param {(store: IDBObjectStore) => IDBRequest} callback
   * @returns {Promise<any>}
   */
  function withStore(storeName, mode, callback) {
    return openDB().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        let request;
        try {
          request = callback(store);
        } catch (err) {
          reject(err);
          return;
        }

        // 단건 요청(put/get/delete 등): request.onsuccess로 결과 확정
        if (request && 'onsuccess' in request) {
          request.onsuccess = function () {
            resolve(request.result);
          };
          request.onerror = function () {
            reject(request.error);
          };
        }

        tx.onerror = function () {
          reject(tx.error);
        };
        tx.onabort = function () {
          reject(tx.error || new Error('트랜잭션이 중단되었습니다.'));
        };
      });
    });
  }

  /**
   * 하나의 트랜잭션 안에서 여러 건을 처리해야 할 때 사용.
   * callback은 store를 받아 필요한 만큼 요청을 발행하고,
   * 트랜잭션의 oncomplete/onerror만으로 완료를 판정한다.
   *
   * @param {string} storeName
   * @param {'readonly'|'readwrite'} mode
   * @param {(store: IDBObjectStore) => void} callback
   * @returns {Promise<void>}
   */
  function runTransaction(storeName, mode, callback) {
    return openDB().then((db) => {
      return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);

        try {
          callback(store);
        } catch (err) {
          reject(err);
          return;
        }

        tx.oncomplete = function () {
          resolve();
        };
        tx.onerror = function () {
          reject(tx.error);
        };
        tx.onabort = function () {
          reject(tx.error || new Error('트랜잭션이 중단되었습니다.'));
        };
      });
    });
  }

  /**
   * 오브젝트 스토어 전체 레코드를 배열로 가져온다.
   *
   * @param {string} storeName
   * @returns {Promise<any[]>}
   */
  function getAll(storeName) {
    return withStore(storeName, 'readonly', (store) => store.getAll());
  }

  /**
   * keyPath 값으로 단건 조회.
   *
   * @param {string} storeName
   * @param {IDBValidKey} key
   * @returns {Promise<any|undefined>}
   */
  function get(storeName, key) {
    return withStore(storeName, 'readonly', (store) => store.get(key));
  }

  /**
   * put(있으면 갱신, 없으면 생성).
   *
   * @param {string} storeName
   * @param {any} value
   * @returns {Promise<IDBValidKey>}
   */
  function put(storeName, value) {
    return withStore(storeName, 'readwrite', (store) => store.put(value));
  }

  /**
   * keyPath 값으로 단건 삭제.
   *
   * @param {string} storeName
   * @param {IDBValidKey} key
   * @returns {Promise<void>}
   */
  function del(storeName, key) {
    return withStore(storeName, 'readwrite', (store) => store.delete(key));
  }

  return {
    DB_NAME,
    DB_VERSION,
    STORE_WORDS,
    STORE_WORD_STATE,
    STORE_SETTINGS,
    STORE_WORD_LISTS,
    STORE_SENTENCES,
    STORE_SENTENCE_STATE,
    STORE_SENTENCE_LISTS,
    STORE_CONVERSATIONS,
    STORE_CONVERSATION_LISTS,
    openDB,
    withStore,
    runTransaction,
    getAll,
    get,
    put,
    delete: del,
  };
});
