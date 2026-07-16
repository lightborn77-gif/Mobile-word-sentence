/**
 * app/controllers/langSelectController.js
 *
 * 역할
 * ----
 * 저장 화면의 발음 언어 선택 드롭다운(saveLangSelect)을 채우고 유지한다.
 * "지원 언어" 목록을 코드에 하드코딩하지 않고, core/ttsEngine.getVoices()가
 * 돌려주는 "지금 이 브라우저가 실제로 가진 음성" 목록을 그대로 사용한다.
 *
 * 이 파일이 하지 않는 일
 * ----------------------
 * - "현재 학습 언어(activeLang)"를 바꾸는 일 자체는 app/main.js의
 *   setActiveLang()이 담당한다. 그 함수는 언어가 바뀌면 열려 있는 탭을
 *   다시 마운트해야 하는데, 그건 여러 모듈 마운트 함수를 아는 main.js의
 *   책임이라 이 컨트롤러로 옮기지 않았다. 이 파일은 순수하게
 *   "드롭다운 UI"만 담당한다.
 *
 * 공개 API
 * --------
 * createLangSelectController(deps) → { init(), populate() }
 *   - init(): 최초 1회 옵션을 채우고, 브라우저 음성 목록이 비동기로 늦게
 *     채워지는 경우를 대비해 voiceschanged 이벤트도 구독한다.
 *   - populate(): 드롭다운 옵션을 다시 채운다. voiceschanged가 아니어도
 *     필요하면 외부에서 다시 호출할 수 있다.
 *
 * 의존성 (deps로 주입받음)
 * ------------------------
 * - selectEl: saveLangSelect <select> 엘리먼트 (없으면 아무 것도 하지 않음)
 * - ttsEngine: core/ttsEngine.js (getVoices, onVoicesChanged)
 * - defaultLang: 음성 목록을 하나도 못 가져왔을 때 남겨둘 기본 언어 코드
 * - getPreferredLang(): 옵션을 다시 채울 때 우선적으로 유지하고 싶은
 *   언어 코드를 반환하는 함수 (예: 현재 학습 언어)
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.langSelectController = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 자주 쓰는 언어 코드만 한글 라벨을 붙이고, 모르는 코드는 코드 그대로
  // 보여준다(브라우저가 어떤 언어를 주더라도 깨지지 않도록 방어적 처리).
  const KNOWN_LANG_LABELS = {
    'en-US': '영어(미국)', 'en-GB': '영어(영국)',
    'ko-KR': '한국어',
    'ja-JP': '일본어',
    'zh-CN': '중국어(간체)', 'zh-TW': '중국어(번체)',
    'fr-FR': '프랑스어',
    'de-DE': '독일어',
    'es-ES': '스페인어(스페인)', 'es-MX': '스페인어(멕시코)',
    'it-IT': '이탈리아어',
    'ru-RU': '러시아어',
    'vi-VN': '베트남어',
  };

  /**
   * 언어 코드(BCP 47)를 드롭다운에 보여줄 라벨로 바꾼다.
   * @param {string} lang
   * @returns {string}
   */
  function formatLangOptionLabel(lang) {
    const label = KNOWN_LANG_LABELS[lang];
    return label ? `${label} (${lang})` : lang;
  }

  /**
   * @param {object} deps
   * @param {HTMLSelectElement} deps.selectEl
   * @param {object} deps.ttsEngine
   * @param {string} deps.defaultLang
   * @param {function():string} [deps.getPreferredLang]
   */
  function createLangSelectController(deps) {
    const selectEl = deps.selectEl;
    const ttsEngine = deps.ttsEngine;
    const defaultLang = deps.defaultLang;
    const getPreferredLang = deps.getPreferredLang || function () { return null; };

    /**
     * ttsEngine.getVoices()로 현재 브라우저의 음성 목록을 읽어와
     * select의 옵션으로 채운다. 같은 언어 코드가 여러 음성에 걸쳐
     * 중복될 수 있으므로 언어 코드 기준으로 중복 제거한다.
     */
    function populate() {
      if (!selectEl) return;

      const voices = ttsEngine.getVoices();
      const previousValue = selectEl.value;

      const seen = new Set();
      const langs = [];
      voices.forEach((v) => {
        if (!v.lang || seen.has(v.lang)) return;
        seen.add(v.lang);
        langs.push(v.lang);
      });

      if (langs.length === 0) {
        langs.push(defaultLang);
      }

      langs.sort((a, b) => a.localeCompare(b));

      selectEl.innerHTML = '';
      langs.forEach((lang) => {
        const opt = document.createElement('option');
        opt.value = lang;
        opt.textContent = formatLangOptionLabel(lang);
        selectEl.appendChild(opt);
      });

      // 목록이 다시 채워져도(voiceschanged) 사용자가 이미 골라둔 값이나
      // 현재 학습 언어를 최대한 유지한다.
      const wanted = previousValue || getPreferredLang();
      if (wanted && langs.includes(wanted)) {
        selectEl.value = wanted;
      }
    }

    /**
     * 음성 목록이 비동기로 채워지는 브라우저 대응을 위해 최초 1회 채우기+
     * voiceschanged 구독을 함께 건다.
     */
    function init() {
      populate();
      ttsEngine.onVoicesChanged(populate);
    }

    return { init, populate };
  }

  return { createLangSelectController, formatLangOptionLabel };
});
