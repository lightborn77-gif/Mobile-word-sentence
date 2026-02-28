/* ========== 💾 Storage (IndexedDB 모듈 — localStorage 완전 호환 API) ========== */
/**
 * 내부적으로 IndexedDB를 사용하며, 메모리 캐시 덕분에 기존
 * 동기 방식 코드(Storage.get / set …)는 그대로 동작합니다.
 *
 * 또한 window.localStorage 프록시를 제공하여,
 * localStorage.getItem / setItem 를 직접 호출하는 기존 코드도
 * 별도 수정 없이 IndexedDB 기반으로 동작합니다.
 *
 * 사용법:
 *   await Storage.ready;          // 앱 초기화 전 한 번 대기
 *   Storage.set('key', 'val');    // 동기 — 캐시+IDB 동시 저장
 *   Storage.get('key');           // 동기 — 캐시에서 즉시 반환
 *   localStorage.setItem('k','v');// 기존 코드 그대로 — IDB에 저장됨
 */

(() => {
  const W   = window;
  const App = W.App = W.App || {};

  const DB_NAME    = 'vocabMobileDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'kv';
  const PREFIX     = 'vocabMobile_';

  let _db    = null;
  let _cache = {};   // 메모리 캐시 (prefix 없는 key → string/null)

  /* ── IndexedDB 초기화 ───────────────────────────────────── */
  function _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  }

  /* ── IDB 전체 키/값 프리로드 ───────────────────────────── */
  function _loadAll(db) {
    return new Promise((resolve, reject) => {
      const tx    = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req   = store.getAll();
      const kreq  = store.getAllKeys();
      let vals = null, keys = null;
      req.onsuccess   = e => { vals = e.target.result; if (keys) done(); };
      kreq.onsuccess  = e => { keys = e.target.result; if (vals) done(); };
      req.onerror = kreq.onerror = e => reject(e.target.error);
      function done() {
        keys.forEach((k, i) => {
          // prefix 유무 모두 캐시 (직접 localStorage 호출 키 포함)
          const sk = String(k).startsWith(PREFIX) ? String(k).slice(PREFIX.length) : String(k);
          _cache[sk] = vals[i];
        });
        resolve();
      }
    });
  }

  /* ── localStorage 마이그레이션 (최초 1회) ──────────────── */
  function _migrate(db) {
    try {
      // 실제 localStorage (프록시 교체 전 원본 참조 보존)
      const _ls = Object.getPrototypeOf(W.localStorage) === Storage.prototype
        ? W._origLocalStorage : W.localStorage;
      if (!_ls) return;
      const lsKeys = Object.keys(_ls);
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      lsKeys.forEach(lk => {
        const val = _ls.getItem(lk);
        if (val !== null && _cache[lk] === undefined) {
          store.put(val, lk); // prefix 없는 키로 저장 (직접 호환)
          _cache[lk] = val;
        }
      });
    } catch(_) {}
  }

  /* ── IDB 비동기 쓰기 ────────────────────────────────────── */
  function _idbPut(rawKey, value) {
    if (!_db) return;
    try {
      const tx    = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(value, rawKey);
    } catch(_) {}
  }

  function _idbDelete(rawKey) {
    if (!_db) return;
    try {
      const tx    = _db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(rawKey);
    } catch(_) {}
  }

  /* ── ready Promise ─────────────────────────────────────── */
  const ready = (async () => {
    try {
      _db = await _openDB();
      await _loadAll(_db);
      _migrate(_db);
    } catch(e) {
      console.warn('[Storage] IndexedDB 초기화 실패, 메모리 폴백 사용', e);
    }
  })();

  /* ── Storage 모듈 (App.Storage / Window.Storage) ──────── */
  const Storage = {
    ready,
    _prefix: PREFIX,
    _key(k) { return this._prefix + k; },

    get(k, fallback = null) {
      // prefix 붙인 키 우선, 없으면 raw 키로 조회 (직접 setItem 호환)
      const v = _cache[k] !== undefined ? _cache[k] : _cache[PREFIX + k];
      return (v === undefined || v === null) ? fallback : v;
    },

    set(k, v) {
      const s = String(v);
      _cache[k] = s;
      _idbPut(k, s);
    },

    del(k) {
      delete _cache[k];
      _idbDelete(k);
    },

    getJSON(k, fallback) {
      const raw = _cache[k] !== undefined ? _cache[k] : _cache[PREFIX + k];
      if (raw === undefined || raw === null || raw === '') return fallback;
      try { return JSON.parse(raw); } catch(_) { return fallback; }
    },

    setJSON(k, obj) {
      const s = JSON.stringify(obj);
      _cache[k] = s;
      _idbPut(k, s);
    },

    getNumber(k, fallback = 0) {
      const v = this.get(k);
      const n = (v === null) ? NaN : Number(v);
      return Number.isFinite(n) ? n : fallback;
    },

    getBoolean(k, fallback = false) {
      const v = this.get(k);
      if (v === null) return fallback;
      return v === 'true' || v === '1';
    },

    getArray(k, fallback = []) {
      return this.getJSON(k, fallback);
    },

    remove(k) { this.del(k); },

    clear() {
      Object.keys(_cache).forEach(k => {
        delete _cache[k];
        _idbDelete(k);
      });
    },

    keys() { return Object.keys(_cache); }
  };

  App.Storage = Storage;
  // ⚠️ window.Storage는 브라우저 내장 Storage 생성자와 이름 충돌
  // W.Storage || Storage 로는 절대 덮어쓰이지 않으므로 강제로 정의
  try {
    Object.defineProperty(W, 'Storage', {
      get() { return Storage; },
      configurable: true
    });
  } catch(_) {
    W.Storage = Storage; // 폴백
  }

  /* ── localStorage 프록시 — 직접 localStorage.* 호출을 IDB로 리다이렉트 ── */
  try {
    // 원본 localStorage 참조 보존 (마이그레이션·폴백용)
    W._origLocalStorage = W.localStorage;

    const _proxy = {
      getItem(key) {
        const v = _cache[key];
        return (v === undefined) ? null : v;
      },
      setItem(key, value) {
        const s = String(value);
        _cache[key] = s;
        _idbPut(key, s);
      },
      removeItem(key) {
        delete _cache[key];
        _idbDelete(key);
      },
      clear() {
        Object.keys(_cache).forEach(k => {
          delete _cache[k];
          _idbDelete(k);
        });
      },
      key(index) {
        return Object.keys(_cache)[index] || null;
      },
      get length() {
        return Object.keys(_cache).length;
      }
    };

    // Object.keys(localStorage) 지원을 위한 Proxy 래핑
    const proxyLS = new Proxy(_proxy, {
      get(t, p) {
        if (p in t) return typeof t[p] === 'function' ? t[p].bind(t) : t[p];
        // 숫자 인덱스 접근
        if (typeof p === 'string' && !isNaN(p)) return Object.keys(_cache)[Number(p)];
        // 직접 키 접근 (localStorage['key'])
        const v = _cache[p];
        return (v === undefined) ? undefined : v;
      },
      set(t, p, v) {
        if (p in t) { t[p] = v; return true; }
        const s = String(v);
        _cache[p] = s;
        _idbPut(p, s);
        return true;
      },
      ownKeys() {
        return Object.keys(_cache);
      },
      has(t, p) {
        return p in _cache || p in t;
      },
      getOwnPropertyDescriptor(t, p) {
        if (p in _cache) return { value: _cache[p], writable: true, enumerable: true, configurable: true };
      }
    });

    Object.defineProperty(W, 'localStorage', {
      get() { return proxyLS; },
      configurable: true
    });
  } catch(e) {
    console.warn('[Storage] localStorage 프록시 설치 실패', e);
  }
})();
