/**
 * app/controllers/tabNavController.js
 *
 * 역할
 * ----
 * 상단 탭 네비게이션(단어 목록/업로드 · 깜박이 · 퀴즈 · 문장 · 회화 · 통계)의
 * 버튼 클릭을 감지해 `.tab-btn`의 활성 클래스(active)/aria-selected와
 * 대응하는 `.tab-panel`의 표시 여부만 바꾼다.
 *
 * 이 파일이 하지 않는 일
 * ----------------------
 * - 탭 전환 시 각 모듈을 mount/unmount하는 일. 예를 들어 퀴즈 탭으로
 *   전환할 때 quizModule.mount(...)를 호출하거나, 이전 탭의 모듈을
 *   destroy하는 것은 여러 모듈을 아는 조립자(app/main.js)만의 책임이라
 *   이 컨트롤러로 옮기지 않았다. 이 컨트롤러는 "탭 버튼이 클릭됐다"를
 *   감지해 UI만 바꾸고 onTabChange(tabName) 콜백으로 main.js에 알리기만
 *   한다.
 * - 넓은 화면이 필요한 탭에서 컨테이너를 확장하는 등(wide-tab-active)의
 *   레이아웃 결정도 main.js가 onTabChange 콜백 안에서 계속 수행한다.
 *
 * 공개 API
 * --------
 * createTabNavController(deps) → { switchTab(tab), getActiveTab(), clearActiveState(), resetTo(tab) }
 *   - switchTab(tab): 탭 버튼/패널의 활성 상태를 바꾸고 onTabChange(tab)을
 *     호출한다. 이미 활성 탭이면 아무 것도 하지 않는다(기존 동작 유지).
 *   - getActiveTab(): 현재 활성 탭 이름을 반환한다.
 *   - clearActiveState(): 이 컨트롤러가 관리하는 모든 탭 버튼/패널의
 *     active 클래스를 해제한다(activeTab 내부 상태는 유지). 여러
 *     tabNavController 그룹 중 하나만 화면에 보이도록 전환하는 상위
 *     화면(대탭)이, 화면에서 사라지는 그룹의 패널을 완전히 숨길 때 쓴다.
 *   - resetTo(tab): activeTab을 강제로 tab으로 리셋하고 DOM만 재적용한다
 *     (switchTab과 달리 이미 같은 탭이어도 guard 없이 항상 적용되고,
 *     onTabChange는 호출하지 않는다). 대탭을 나갔다가 다시 들어올 때
 *     "항상 첫 소탭으로 초기화"하는 데 쓴다.
 *
 * 의존성 (deps로 주입받음 — 상태를 직접 소유하지 않음)
 * --------------------------------------------------
 * - tabs: [{ name, button, panel }, ...] 형태의 탭 정의 배열
 * - onTabChange(tabName, previousTabName): 활성 탭이 바뀔 때 호출되는 콜백.
 *   main.js는 여기서 이전 탭 모듈 unmount + 새 탭 모듈 mount를 수행한다.
 * - initialTab: 초기 활성 탭 이름(기본값 'main')
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.tabNavController = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /**
   * @param {object} deps
   * @param {Array<{name: string, button: HTMLElement, panel: HTMLElement}>} deps.tabs
   * @param {function(string, string):void} [deps.onTabChange]
   * @param {string} [deps.initialTab='main']
   */
  function createTabNavController(deps) {
    const tabs = deps.tabs;
    const onTabChange = deps.onTabChange || function () {};

    // 현재 활성 탭. 이름은 main.js가 넘겨주는 tabs 정의의 name 값을 그대로 사용한다.
    let activeTab = deps.initialTab || 'main';

    /**
     * 탭 버튼/패널의 활성 클래스와 aria-selected를 tab 인자에 맞게 갱신한다.
     */
    function applyActiveState(tab) {
      tabs.forEach((t) => {
        const isActive = t.name === tab;
        t.button.classList.toggle('active', isActive);
        t.button.setAttribute('aria-selected', String(isActive));
        t.panel.classList.toggle('active', isActive);
      });
    }

    /**
     * 탭을 전환한다. 같은 탭이면 아무 것도 하지 않는다(기존 동작과 동일).
     * UI 갱신 후 onTabChange(tab, previousTab)을 호출해 main.js가 모듈
     * mount/unmount를 수행할 수 있게 한다.
     *
     * @param {string} tab
     */
    function switchTab(tab) {
      if (tab === activeTab) return;

      const previousTab = activeTab;
      activeTab = tab;

      applyActiveState(tab);
      onTabChange(tab, previousTab);
    }

    function getActiveTab() {
      return activeTab;
    }

    /**
     * 이 컨트롤러가 관리하는 모든 탭 버튼/패널의 active 클래스와
     * aria-selected를 전부 false로 되돌린다(activeTab 내부 상태는
     * 유지). 상위 화면이 여러 tabNavController 그룹을 두고 그 중
     * 하나만 화면에 보이게 전환할 때(예: 대탭 전환), 화면에서 사라지는
     * 그룹의 패널에 .active가 남아 다른 그룹의 활성 패널과 함께
     * display:block으로 겹쳐 보이는 문제를 막기 위해 추가했다.
     * activeTab 값 자체는 바꾸지 않으므로, 나중에 이 그룹으로 다시
     * 돌아오면 activateCurrent()로 같은 값을 다시 DOM에 적용할 수 있다.
     */
    function clearActiveState() {
      tabs.forEach((t) => {
        t.button.classList.remove('active');
        t.button.setAttribute('aria-selected', 'false');
        t.panel.classList.remove('active');
      });
    }

    /**
     * activeTab을 강제로 tab으로 리셋하고 DOM을 그에 맞게 적용한다.
     * switchTab과 달리 "이미 그 탭이 활성 상태"여도 guard 없이 항상
     * DOM을 재적용한다(대탭을 나갔다가 다시 들어올 때, 이 그룹의
     * activeTab이 이미 첫 탭과 같은 값이라 switchTab의 guard에 걸려
     * DOM이 갱신되지 않는 문제를 피하기 위함). onTabChange는 호출하지
     * 않는다 — 모듈 mount/unmount 여부는 호출부(main.js)가 이미 알고
     * 있는 leavingTab 정보를 갖고 직접 결정하는 게 더 명확하기 때문.
     *
     * @param {string} tab
     */
    function resetTo(tab) {
      activeTab = tab;
      applyActiveState(tab);
    }

    function bindEvents() {
      tabs.forEach((t) => {
        t.button.addEventListener('click', () => switchTab(t.name));
      });
    }

    bindEvents();

    return { switchTab, getActiveTab, clearActiveState, resetTo };
  }

  return { createTabNavController };
});
