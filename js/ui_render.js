/* =========================================================
 * UI Render helpers (DOM update only)
 * Refactor: split from legacy/ui_settings.js
 * Generated: 2026-02-11
 * ========================================================= */
window.App = window.App || {};
window.App.UI = window.App.UI || {};

/** Show a popup/modal by id (adds .show) */
function uiShowPopup(id){
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('show');
}

/** Hide a popup/modal by id (removes .show) */
function uiHidePopup(id){
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.remove('show');
}

/** Set textContent safely */
function uiSetText(id, text){
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
}

/** Toggle "active" class within container selector */
function uiSetActiveIn(containerSelector, activeEl){
  try {
    document.querySelectorAll(containerSelector + ' .option-btn').forEach(b => b.classList.remove('active'));
  } catch(e){}
  if (activeEl && activeEl.classList) activeEl.classList.add('active');
}

/** Toggle active by ids list */
function uiSetActiveByIds(activeId, ids){
  for (const id of ids){
    const el = document.getElementById(id);
    if (!el) continue;
    el.classList.toggle('active', id === activeId);
  }
}

/** Update multiple range labels */
function uiUpdateRangeLabels(start, end){
  const t = `${start}-${end}`;
  uiSetText('rangeText', t);
  uiSetText('rangeText2', t);
  uiSetText('rangeText3', t);
}

/** Update font size UI */
function uiUpdateFontSize(size){
  uiSetText('fontSizeValue', size + 'px');
  uiSetText('sizeText', size + 'px');
  const cw = document.getElementById('cardWord');
  if (cw) cw.style.fontSize = size + 'px';
}

/** Update quiz count label */
function uiUpdateQuizCountLabel(count){
  const lang = (typeof currentUILang !== 'undefined') ? currentUILang : 'ko';
  const txt = (typeof UI_TEXT !== 'undefined' && UI_TEXT[lang]) ? UI_TEXT[lang].problems : '문제';
  uiSetText('quizCountText', count + txt);
}
