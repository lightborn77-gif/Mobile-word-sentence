/**
 * core/wordStore.js
 *
 * 단어/학습상태 데이터에 대한 공개 API.
 * flashcard/quiz/result/app 등 다른 모든 모듈은 IndexedDB나 core/db.js를
 * 직접 참조하지 않고 반드시 이 파일이 export하는 함수만 사용한다.
 *
 * 공개 API (기능별 그룹)
 * ----------------------
 * [저장/조회]
 *   saveWords, getAllWords, getWordsInRange, getWordState
 *
 * [학습 상태 계산/기록]
 *   recordResult(wordId, isCorrect) — stateManager.recordResult 결과를 wordState에 반영
 *   getWordsWithStatus(filter) — 필터에 해당하는 단어만 status를 붙여 반환
 *   attachStatusToWords, getStatusCounts
 *   (core/stateManager.js의 순수 함수로 상태를 계산하고, 실제 IndexedDB
 *    반영은 이 파일이 담당하는 역할 분담이다.)
 *
 * [전역 설정 저장/조회]
 *   getSetting(key, defaultValue) / saveSetting(key, value) / getSettings(defaults)
 *   core/db.js의 settings 스토어(key-value)를 사용하는 공개 API. 재생속도,
 *   자동재생 여부, 문제 수, 출제방식, 문제 전환 간격, 정답 표시 여부,
 *   순차/랜덤 등을 다음 방문 시에도 유지하기 위해 app/main.js의 전역
 *   설정 패널이 이 API를 사용한다.
 *
 * [저장된 단어 리스트(wordLists) 관리]
 *   saveWordList(name, words) — 업로드된 파싱 결과를 "리스트" 스냅샷으로
 *     wordLists 스토어에 저장(현재 활성 words/wordState와는 별개).
 *   getWordLists() — 저장된 리스트 전체를 최신순으로 조회(words 필드는
 *     제외한 메타데이터만 반환하여 목록 UI를 가볍게 그릴 수 있게 한다).
 *   deleteWordList(id) / deleteWordLists(ids) — 리스트 단건/다건 삭제.
 *   loadWordList(id) — 저장된 리스트 하나를 saveWords로 현재 활성
 *     words/wordState 스토어에 반영(불러오기)하고, 반영된 단어 배열을 반환.
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./db.js'), require('./stateManager.js'));
  } else {
    root.wordStore = factory(root.vocabDB, root.stateManager);
  }
})(typeof self !== 'undefined' ? self : this, function (vocabDB, stateManager) {
  'use strict';

  /**
   * wordState의 초기값. 신규 단어 저장 시 이 형태로 생성한다.
   * tested(boolean)는 퀴즈 모드로 한 번이라도 출제되기 전까지는 false를
   * 유지한다(= 'untested' 상태 판정 기준).
   *
   * @param {number} wordId
   */
  function makeInitialWordState(wordId) {
    return {
      wordId,
      wrongCount: 0,
      correctCount: 0,
      consecutiveCorrect: 0,
      tested: false,
      lastTestedAt: null,
    };
  }

  /**
   * 파싱된 단어 배열(core/dataParser.js의 parseVocabText 결과)을
   * words + wordState(초기값) 스토어에 일괄 저장한다.
   *
   * 규칙:
   * - words는 항상 최신 파싱 내용으로 갱신(덮어쓰기)한다.
   * - 이미 wordState가 존재하는 id(이전에 학습 이력이 쌓인 단어)는
   *   그대로 보존하고 건드리지 않는다(파일 재업로드로 학습 이력이
   *   초기화되지 않도록).
   * - wordState가 없는 새 id에 대해서만 초기값을 생성한다.
   *
   * @param {Array<{id:number, word:string, meaning:string, derivatives:object, example:{sentence:string, translation:string}}>} parsedArray
   * @returns {Promise<void>}
   */
  function saveWords(parsedArray) {
    if (!Array.isArray(parsedArray) || parsedArray.length === 0) {
      return Promise.resolve();
    }

    // 1) words는 전부 덮어쓰기 저장 (단일 트랜잭션)
    const saveWordsTx = vocabDB.runTransaction(vocabDB.STORE_WORDS, 'readwrite', (store) => {
      for (const w of parsedArray) {
        store.put({
          id: w.id,
          word: w.word,
          meaning: w.meaning,
          derivatives: w.derivatives,
          example: w.example,
        });
      }
    });

    // 2) wordState는 기존 항목이 없는 id에 대해서만 초기값 생성.
    //    먼저 기존 wordState 전체를 읽어 존재 여부를 판단한 뒤,
    //    없는 id만 별도 트랜잭션에서 put한다.
    const saveStatesTx = vocabDB.getAll(vocabDB.STORE_WORD_STATE).then((existingStates) => {
      const existingIds = new Set(existingStates.map((s) => s.wordId));
      const missing = parsedArray.filter((w) => !existingIds.has(w.id));

      if (missing.length === 0) return Promise.resolve();

      return vocabDB.runTransaction(vocabDB.STORE_WORD_STATE, 'readwrite', (store) => {
        for (const w of missing) {
          store.put(makeInitialWordState(w.id));
        }
      });
    });

    return Promise.all([saveWordsTx, saveStatesTx]).then(() => undefined);
  }

  /**
   * words 스토어 전체를 조회한다. id 오름차순으로 정렬해서 반환한다.
   *
   * @returns {Promise<Array>}
   */
  function getAllWords() {
    return vocabDB.getAll(vocabDB.STORE_WORDS).then((words) => {
      return words.slice().sort((a, b) => a.id - b.id);
    });
  }

  /**
   * id가 startId ~ endId (양 끝 포함) 범위인 단어만 조회한다.
   * startId/endId가 비정상(숫자 아님, startId > endId 등)이면
   * 방어적으로 처리하여 빈 배열 또는 전체 범위로 대응한다.
   *
   * @param {number} startId
   * @param {number} endId
   * @returns {Promise<Array>}
   */
  function getWordsInRange(startId, endId) {
    return getAllWords().then((words) => {
      const start = Number(startId);
      const end = Number(endId);

      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return words;
      }

      const lo = Math.min(start, end);
      const hi = Math.max(start, end);

      return words.filter((w) => w.id >= lo && w.id <= hi);
    });
  }

  /**
   * 특정 단어의 상태 데이터(wordState)를 조회한다.
   * 없으면 undefined를 반환한다.
   *
   * @param {number} wordId
   * @returns {Promise<object|undefined>}
   */
  function getWordState(wordId) {
    return vocabDB.get(vocabDB.STORE_WORD_STATE, wordId);
  }

  /**
   * 퀴즈(또는 임시 검증용 버튼)에서 나온 정오답 결과 하나를 특정 단어의
   * wordState에 반영한다. stateManager.recordResult로 새 카운터 값을
   * 계산한 뒤 IndexedDB에 갱신 저장한다.
   *
   * 대상 단어의 wordState가 아직 없으면(예: saveWords 이전에 잘못 호출된 경우
   * 등 예외적 상황) 초기값에서부터 시작해 반영한다.
   *
   * @param {number} wordId
   * @param {boolean} isCorrect
   * @returns {Promise<object>} 갱신된 wordState
   */
  function recordResult(wordId, isCorrect) {
    return getWordState(wordId).then((existing) => {
      const base = existing || makeInitialWordState(wordId);
      const updated = stateManager.recordResult(base, isCorrect);
      // wordId는 stateManager가 건드리지 않는 필드이므로 명시적으로 보존
      updated.wordId = wordId;
      return vocabDB.put(vocabDB.STORE_WORD_STATE, updated).then(() => updated);
    });
  }

  /**
   * words와 wordState를 조인하여 각 단어에 계산된 status를 붙인 뒤,
   * filter(선택된 상태 라벨 배열)에 해당하는 단어만 반환한다.
   *
   * filter 값: 'untested' | 'starred' | 'bigStarred' | 'stable' 중 0개 이상.
   * - filter가 비어 있으면(또는 전달되지 않으면) 빈 배열을 반환한다
   *   (아무 것도 선택하지 않았다는 뜻이므로 결과도 없음).
   * - 'starred'가 filter에 포함되면 starred와 bigStarred를 모두 포함한다
   *   (큰별표는 별표의 상위 등급이므로 별표 필터에도 포함되는 정책).
   *   'bigStarred'만 별도로 선택된 경우 bigStarred 단어만 포함한다.
   * - 오답 이력이 없어 calculateStatus가 null을 반환하는(untested도 아니고
   *   starred/stable도 아닌) 단어는 어떤 필터에도 걸리지 않는다.
   *
   * 반환되는 각 단어 객체는 원본 word 필드 + state(wordState 원본) +
   * status(계산된 라벨) 를 함께 담는다.
   *
   * @param {Array<'untested'|'starred'|'bigStarred'|'stable'>} filter
   * @returns {Promise<Array>}
   */
  function getWordsWithStatus(filter) {
    const selected = new Set(Array.isArray(filter) ? filter : []);

    if (selected.size === 0) {
      return Promise.resolve([]);
    }

    return Promise.all([
      getAllWords(),
      vocabDB.getAll(vocabDB.STORE_WORD_STATE),
    ]).then(([words, states]) => {
      const stateByWordId = new Map(states.map((s) => [s.wordId, s]));

      const withStatus = words.map((w) => {
        const state = stateByWordId.get(w.id) || makeInitialWordState(w.id);
        const status = stateManager.calculateStatus(state);
        return { ...w, state, status };
      });

      return withStatus.filter((w) => {
        if (w.status === 'bigStarred') {
          // 큰별표는 "별표" 필터에도, "큰별표" 필터에도 포함
          return selected.has('starred') || selected.has('bigStarred');
        }
        if (w.status === null) {
          return false; // 오답 이력 없이 출제만 된 단어는 명시적 필터 대상 아님
        }
        return selected.has(w.status);
      });
    });
  }

  /**
   * 단어 배열에 wordState/status를 붙여 반환한다.
   *
   * 단어 1개당 wordStore.getWordState(id) 호출 1번씩 IndexedDB 요청을
   * 단어 수만큼 병렬로 날리면 단어가 많을수록 브라우저가 버벅인다.
   * 이 함수는 getWordsWithStatus와 동일하게 wordState 스토어 전체를
   * "단 한 번"의 getAll()로 읽어와 Map으로 조인하는 방식을 써서,
   * 단어 수와 무관하게 IndexedDB 요청 횟수를 O(1)로 유지한다.
   *
   * @param {Array} words - status/state가 아직 없는 단어 객체 배열
   * @returns {Promise<Array>} state/status가 붙은 단어 객체 배열(원본은 변경하지 않음)
   */
  function attachStatusToWords(words) {
    if (!words || words.length === 0) return Promise.resolve([]);

    return vocabDB.getAll(vocabDB.STORE_WORD_STATE).then((states) => {
      const stateByWordId = new Map(states.map((s) => [s.wordId, s]));

      return words.map((w) => {
        const state = stateByWordId.get(w.id) || makeInitialWordState(w.id);
        const status = stateManager.calculateStatus(state);
        return { ...w, state, status };
      });
    });
  }

  /**
   * 상태(미테스트/별표/큰별표/안정권)별 단어 개수만 계산해서 반환한다.
   * 단어 목록 탭이 더 이상 전체 단어를 표로 렌더링하지 않고 요약 카운트만
   * 보여주도록 바뀌면서(성능 개선) 추가되었다. words/wordState를 각각
   * 한 번씩 getAll()로 읽는 비용은 getWordsWithStatus와 동일하지만,
   * 결과를 DOM 행으로 만들지 않으므로 단어 수가 많아도 렌더링 비용이
   * 들지 않는다.
   *
   * @returns {Promise<{ total:number, untested:number, starred:number, bigStarred:number, stable:number, none:number }>}
   *          starred는 bigStarred를 포함하지 않는 "순수 별표" 개수,
   *          none은 출제는 되었지만(tested) 오답 이력이 없어 어떤 상태
   *          라벨에도 속하지 않는 단어 개수.
   */
  function getStatusCounts() {
    return Promise.all([
      getAllWords(),
      vocabDB.getAll(vocabDB.STORE_WORD_STATE),
    ]).then(([words, states]) => {
      const stateByWordId = new Map(states.map((s) => [s.wordId, s]));
      const counts = { total: words.length, untested: 0, starred: 0, bigStarred: 0, stable: 0, none: 0 };

      for (const w of words) {
        const state = stateByWordId.get(w.id) || makeInitialWordState(w.id);
        const status = stateManager.calculateStatus(state);
        if (status === null) {
          counts.none += 1;
        } else {
          counts[status] += 1;
        }
      }

      return counts;
    });
  }

  /**
   * 전역 설정 값 하나를 settings 스토어에서 조회한다.
   * key가 없으면(최초 방문 등) defaultValue를 반환한다.
   *
   * @param {string} key
   * @param {*} [defaultValue]
   * @returns {Promise<*>}
   */
  function getSetting(key, defaultValue) {
    return vocabDB.get(vocabDB.STORE_SETTINGS, key).then((record) => {
      return record && Object.prototype.hasOwnProperty.call(record, 'value')
        ? record.value
        : defaultValue;
    });
  }

  /**
   * 전역 설정 값 하나를 settings 스토어에 저장한다.
   * settings 스토어의 keyPath는 "key"이므로 { key, value } 형태로 put한다.
   *
   * @param {string} key
   * @param {*} value
   * @returns {Promise<void>}
   */
  function saveSetting(key, value) {
    return vocabDB.put(vocabDB.STORE_SETTINGS, { key, value }).then(() => undefined);
  }

  /**
   * 여러 설정 값을 한 번에 조회한다(전역 설정 패널 초기 로드용).
   * defaults 객체의 각 key에 대해 getSetting을 호출하고, 결과를 같은
   * 모양의 객체로 합쳐 반환한다.
   *
   * @param {Object<string, *>} defaults - { settingKey: defaultValue, ... }
   * @returns {Promise<Object<string, *>>}
   */
  function getSettings(defaults) {
    const keys = Object.keys(defaults || {});
    return Promise.all(keys.map((k) => getSetting(k, defaults[k]))).then((values) => {
      const result = {};
      keys.forEach((k, i) => { result[k] = values[i]; });
      return result;
    });
  }

  /**
   * 리스트에 lang 필드가 없을 때(다국어 TTS 지원 이전에 저장된 예전 리스트)
   * 사용할 기본 언어. ttsEngine.speak의 기본값과 동일하게 맞춘다.
   */
  const DEFAULT_LANG = 'en-US';

  /**
   * 파싱된 단어 배열을 "저장된 리스트" 스냅샷으로 wordLists 스토어에 새로
   * 저장한다(현재 활성 words/wordState 스토어는 건드리지 않는다).
   *
   * 다국어 TTS: 리스트 단위로 발음 언어(lang, 예: 'en-US'/'fr-FR')를 함께
   * 저장한다. 리스트 안 단어들은 보통 같은 언어이므로 단어별이 아닌
   * "리스트별"로 한 번만 지정한다. 저장 시점에 사용자가 고른 값을 그대로
   * 기억해두고, 이후 loadWordList/getWordListById로 불러올 때 그대로
   * 돌려주어 상위(app/main.js)가 TTS 언어를 자동으로 맞출 수 있게 한다.
   *
   * @param {string} name - 리스트를 구분할 이름(예: 업로드한 파일명)
   * @param {Array} words - core/dataParser.parseVocabText 결과
   * @param {number} [existingId] - 지정하면 새로 만들지 않고 해당 id의 리스트를
   *        갱신(덮어쓰기)한다(단어 추가/편집 화면에서 "현재 리스트에
   *        이어붙이기"를 위해 추가). 지정하지 않으면 기존과 동일하게 새 리스트를
   *        생성한다(id 자동 부여).
   * @param {string} [lang] - 발음 언어 코드(BCP 47, 예: 'en-US'). 생략 시
   *        DEFAULT_LANG(신규 저장) 또는 기존 값 유지(existingId로 갱신 시
   *        lang을 안 넘기면 아래에서 기존 레코드의 lang을 그대로 보존한다).
   * @returns {Promise<number>} 생성 또는 갱신된 리스트의 id
   */
  function saveWordList(name, words, existingId, lang) {
    const record = {
      name: name || '이름 없는 리스트',
      createdAt: Date.now(),
      words: Array.isArray(words) ? words : [],
      lang: lang || DEFAULT_LANG,
    };
    if (existingId !== undefined && existingId !== null) {
      record.id = existingId;
      if (!lang) {
        // 언어를 명시적으로 넘기지 않은 갱신(예: 리스트에 단어 이어붙이기)은
        // 기존 리스트의 발음 언어를 그대로 유지한다.
        return vocabDB.get(vocabDB.STORE_WORD_LISTS, existingId).then((existing) => {
          record.lang = (existing && existing.lang) || DEFAULT_LANG;
          return vocabDB.put(vocabDB.STORE_WORD_LISTS, record);
        });
      }
    }
    return vocabDB.put(vocabDB.STORE_WORD_LISTS, record);
  }

  /**
   * 저장된 리스트 전체를 최신 생성순으로 조회한다.
   * 목록 UI에서는 words 배열까지 필요하지 않으므로 개수(count)만 붙여
   * 가볍게 반환한다(words 원본 배열은 응답에서 제외).
   *
   * lang은 다국어 TTS 지원 이전에 저장된 리스트에는 없을 수 있으므로
   * DEFAULT_LANG으로 보정해서 반환한다(별도 마이그레이션 없이 조회
   * 시점에 안전한 기본값 처리).
   *
   * @returns {Promise<Array<{id:number, name:string, createdAt:number, count:number, lang:string}>>}
   */
  function getWordLists() {
    return vocabDB.getAll(vocabDB.STORE_WORD_LISTS).then((lists) => {
      return lists
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((l) => ({
          id: l.id,
          name: l.name,
          createdAt: l.createdAt,
          count: Array.isArray(l.words) ? l.words.length : 0,
          lang: l.lang || DEFAULT_LANG,
        }));
    });
  }

  /**
   * 저장된 리스트 하나를 id로 조회한다(words 원본 배열 포함, 편집 화면용).
   * modules/wordLists의 getWordLists()는 목록 UI를 가볍게 그리기 위해
   * words 필드를 뺀 메타데이터만 반환하지만, 편집 화면은 실제 단어
   * 데이터를 폼에 채워야 하므로 별도로 words까지 포함한 전체 레코드가 필요하다.
   *
   * lang은 다국어 TTS 지원 이전에 저장된 리스트에는 없을 수 있으므로
   * DEFAULT_LANG으로 보정해서 반환한다.
   *
   * @param {number} id
   * @returns {Promise<{id:number, name:string, createdAt:number, words:Array, lang:string}|undefined>}
   */
  function getWordListById(id) {
    return vocabDB.get(vocabDB.STORE_WORD_LISTS, id).then((record) => {
      if (!record) return record;
      return { ...record, lang: record.lang || DEFAULT_LANG };
    });
  }

  /**
   * 저장된 리스트 하나를 id로 삭제한다.
   *
   * @param {number} id
   * @returns {Promise<void>}
   */
  function deleteWordList(id) {
    return vocabDB.delete(vocabDB.STORE_WORD_LISTS, id);
  }

  /**
   * 저장된 리스트 여러 개를 한 번에 삭제한다(체크박스 선택 삭제용).
   *
   * @param {Array<number>} ids
   * @returns {Promise<void>}
   */
  function deleteWordLists(ids) {
    const targets = Array.isArray(ids) ? ids : [];
    if (targets.length === 0) return Promise.resolve();
    return Promise.all(targets.map((id) => deleteWordList(id))).then(() => undefined);
  }

  /**
   * 저장된 리스트 하나를 불러와 현재 활성 words/wordState 스토어에 반영한다.
   * (saveWords와 동일한 규칙: words는 덮어쓰기, 기존 wordState는 보존)
   *
   * 다국어 TTS: 반환값에 lang을 함께 포함한다. 상위(app/main.js)는 이 값을
   * 받아 "현재 학습 언어" 설정(activeLang, settings 스토어)을 갱신하고,
   * 이후 flashcard/quiz/result/sentenceMode에 발음 언어로 전달한다.
   *
   * @param {number} id
   * @returns {Promise<{ words: Array, lang: string }>} 반영된 단어 배열과 리스트의 언어
   */
  function loadWordList(id) {
    return vocabDB.get(vocabDB.STORE_WORD_LISTS, id).then((record) => {
      if (!record) {
        throw new Error('저장된 리스트를 찾을 수 없습니다.');
      }
      const words = Array.isArray(record.words) ? record.words : [];
      const lang = record.lang || DEFAULT_LANG;
      return saveWords(words).then(() => ({ words, lang }));
    });
  }

  /**
   * 통계 탭 전용 요약 데이터를 한 번에 계산해 반환한다.
   * words + wordState를 각각 한 번씩만 getAll()로 읽어(성능은
   * getStatusCounts와 동일) 아래 세 가지를 함께 계산한다.
   *
   * - overall: 전체 누적 정답률(테스트된 시도 기준)
   * - statusCounts: getStatusCounts()와 동일한 상태별 개수
   * - weakWords: wrongCount 내림차순 정렬 상위 단어 목록(오답이
   *   1개 이상인 단어만 대상; TOP N은 topN 인자로 조절)
   *
   * @param {number} [topN=10] - 취약 단어 목록에 포함할 최대 개수
   * @returns {Promise<{
   *   totalWords:number,
   *   testedWords:number,
   *   totalAttempts:number,
   *   totalCorrect:number,
   *   totalWrong:number,
   *   accuracyPct:number|null,
   *   statusCounts:{total:number, untested:number, starred:number, bigStarred:number, stable:number, none:number},
   *   weakWords:Array<{id:number, word:string, meaning:string, wrongCount:number, correctCount:number, status:string|null}>
   * }>}
   */
  function getStatsSummary(topN) {
    const limit = Number.isFinite(topN) && topN > 0 ? topN : 10;

    return Promise.all([
      getAllWords(),
      vocabDB.getAll(vocabDB.STORE_WORD_STATE),
    ]).then(([words, states]) => {
      const stateByWordId = new Map(states.map((s) => [s.wordId, s]));

      const statusCounts = { total: words.length, untested: 0, starred: 0, bigStarred: 0, stable: 0, none: 0 };
      let testedWords = 0;
      let totalCorrect = 0;
      let totalWrong = 0;
      const withCounters = [];

      for (const w of words) {
        const state = stateByWordId.get(w.id) || makeInitialWordState(w.id);
        const status = stateManager.calculateStatus(state);

        if (status === null) {
          statusCounts.none += 1;
        } else {
          statusCounts[status] += 1;
        }

        if (state.tested) testedWords += 1;

        const wrongCount = Number(state.wrongCount) || 0;
        const correctCount = Number(state.correctCount) || 0;
        totalWrong += wrongCount;
        totalCorrect += correctCount;

        if (wrongCount > 0) {
          withCounters.push({
            id: w.id,
            word: w.word,
            meaning: w.meaning,
            wrongCount,
            correctCount,
            status,
          });
        }
      }

      withCounters.sort((a, b) => b.wrongCount - a.wrongCount);

      const totalAttempts = totalCorrect + totalWrong;
      const accuracyPct = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : null;

      return {
        totalWords: words.length,
        testedWords,
        totalAttempts,
        totalCorrect,
        totalWrong,
        accuracyPct,
        statusCounts,
        weakWords: withCounters.slice(0, limit),
      };
    });
  }

  return {
    saveWords,
    getAllWords,
    getWordsInRange,
    getWordState,
    recordResult,
    getWordsWithStatus,
    attachStatusToWords,
    getStatusCounts,
    getStatsSummary,
    getSetting,
    saveSetting,
    getSettings,
    saveWordList,
    getWordLists,
    getWordListById,
    deleteWordList,
    deleteWordLists,
    loadWordList,
    DEFAULT_LANG,
  };
});
