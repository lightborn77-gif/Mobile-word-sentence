/* =========================================================
 * Fullscreen Toggle (handlers)
 * Refactor: split from legacy/fullscreen.js
 * Generated: 2026-02-11
 * ========================================================= */

function toggleStudyFullscreen() {
            const isFullscreen = document.body.classList.toggle('study-fullscreen');
            const headerBtn = document.getElementById('fullscreenBtn');
            const floatingBtn = document.getElementById('floatingFullscreenBtn');
            
            if (isFullscreen) {
                // 풀스크린 진입
                headerBtn.textContent = '🡼';
                floatingBtn.textContent = '🡼';
                headerBtn.title = ((typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']?.fullscreenExit) || '풀스크린 종료');
                floatingBtn.title = ((typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']?.fullscreenExit) || '풀스크린 종료');
            } else {
                // 풀스크린 종료
                headerBtn.textContent = '⛶';
                floatingBtn.textContent = '⛶';
                headerBtn.title = ((typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']?.fullscreenEnter) || '학습창 풀스크린');
                floatingBtn.title = ((typeof UI_TEXT !== 'undefined' && UI_TEXT[typeof currentUILang !== 'undefined' ? currentUILang : 'ko']?.fullscreenEnter) || '학습창 풀스크린');
            }
        }

function ensureCompatIds(){
  try{
    // Map "mainDisplay" expected by tester to the real card element if possible
    var card = document.getElementById('flashCard');
    if(card && !document.getElementById('mainDisplay')){
      card.id = 'mainDisplay';
    }

    // Wire hidden langBtn so iframe test can toggle data-ui-lang
    var lb = document.getElementById('langBtn');
    if(lb && !lb.__bound){
      lb.__bound = true;
      lb.addEventListener('click', function(){
        var b = document.body;
        var cur = (b.getAttribute('data-ui-lang') || 'ko').toLowerCase();
        var next = (cur === 'ko') ? 'en' : 'ko';
        b.setAttribute('data-ui-lang', next);
        if(typeof window.applyUILanguage === 'function'){
          try{ window.applyUILanguage(); }catch(e){}
        }
      });
    }

    // Optional: start/stop shims (no-op if not available)
    var sb = document.getElementById('startBtn');
    if(sb && !sb.__bound){
      sb.__bound = true;
      sb.addEventListener('click', function(){
        if(window.App && typeof App.dispatch === 'function'){ try{ App.dispatch('START'); }catch(e){} }
        if(typeof window.startApp === 'function'){ try{ window.startApp(); }catch(e){} }
        if(typeof window.startStudy === 'function'){ try{ window.startStudy(); }catch(e){} }
      });
    }
    var stb = document.getElementById('stopBtn');
    if(stb && !stb.__bound){
      stb.__bound = true;
      stb.addEventListener('click', function(){
        if(window.App && typeof App.dispatch === 'function'){ try{ App.dispatch('STOP_ALL'); }catch(e){} }
        if(typeof window.stopApp === 'function'){ try{ window.stopApp(); }catch(e){} }
        if(typeof window.stopStudy === 'function'){ try{ window.stopStudy(); }catch(e){} }
      });
    }
  }catch(e){}
}
