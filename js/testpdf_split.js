
// STEP10 - Split Test / Answer PDF (Print-to-PDF 방식, 완전 오프라인)
// mode: 'test' | 'answer'

(function(){
  'use strict';

  function _getBool(id, fallback=false){
    const el = document.getElementById(id);
    if(!el) return fallback;
    if(el.type === 'checkbox') return !!el.checked;
    return fallback;
  }
  function _getNum(id, fallback){
    const el = document.getElementById(id);
    if(!el) return fallback;
    const n = parseInt(el.value, 10);
    return Number.isFinite(n) ? n : fallback;
  }
  function _shuffle(arr){
    for(let i=arr.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function _pickPool(){
    // 모바일 버전의 데이터 구조 사용
    const App = window.App || {};
    const State = App.State || {};
    
    // vocabulary 데이터 가져오기
    if (Array.isArray(State.vocabulary) && State.vocabulary.length > 0) {
      return State.vocabulary;
    }
    
    // 레거시 호환성
    if (typeof window.getFiltered === 'function') {
      try { return window.getFiltered() || []; } catch(e) {}
    }
    
    return [];
  }
  function _getDirection(){
    // 모바일 버전의 퀴즈 방향 설정 가져오기
    const State = window.App?.State || {};
    const quizDir = State.quizDirection || 'wordToMeaning';
    
    if (quizDir === 'mixed') return 'mixed';
    if (quizDir === 'meaningToWord') return 'meaningToWord';
    return 'wordToMeaning';
  }

  function _normalizeItem(it){
    const word = it.word || it.eng || it.en || it.front || it[0] || '';
    const mean = it.meaning || it.kor || it.mean || it.ko || it.back || it[1] || '';
    const num  = it.num || it.n || it.id || '';
    return { num, word, mean };
  }

  function _build(pool, count, direction, shuffle){
    const items = pool.map(_normalizeItem).filter(x => x.word && x.mean);
    if(items.length === 0) return {q:[], a:[]};

    let picked = items.slice();
    picked.sort((a,b)=>{
      const an = parseInt(a.num,10), bn=parseInt(b.num,10);
      if(Number.isFinite(an) && Number.isFinite(bn)) return an-bn;
      return (''+a.num).localeCompare(''+b.num);
    });

    if(shuffle) _shuffle(picked);
    picked = picked.slice(0, Math.min(count, picked.length));

    const q=[], a=[];
    for(let i=0;i<picked.length;i++){
      const it = picked[i];
      let dir = direction;
      if(direction === 'mixed') dir = (Math.random()<0.5)?'wordToMeaning':'meaningToWord';

      const prompt = (dir==='meaningToWord')?it.mean:it.word;
      const ans    = (dir==='meaningToWord')?it.word:it.mean;

      q.push({i:i+1, p:prompt});
      a.push({i:i+1, p:prompt, a:ans});
    }
    return {q,a};
  }

  function _openPrint(title, rows, isAnswer){
    const w = window.open('', '_blank');
    if(!w){ alert('팝업 차단 해제 후 다시 시도'); return; }

    const esc = s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

    // 45개 이하: 1단, 46개 이상: 2단
    const is2Column = rows.length > 45;
    
    let contentHtml = '';
    
    if(is2Column){
      // 2단 구조: 번호 없이 영어|뜻 구조
      const leftColumn = rows.slice(0, 50);
      const rightColumn = rows.slice(50, 100);
      
      const renderColumn2 = (items) => {
        return items.map(r=>{
          if(isAnswer){
            return `
              <tr>
                <td class="question2">${esc(r.p)}</td>
                <td class="answer2">${esc(r.a)}</td>
              </tr>`;
          }else{
            return `
              <tr>
                <td class="question2">${esc(r.p)}</td>
                <td class="blank2"></td>
              </tr>`;
          }
        }).join('');
      };
      
      contentHtml = `
        <div class="columns">
          <div class="column">
            <table>
              <tbody>
                ${renderColumn2(leftColumn)}
              </tbody>
            </table>
          </div>
          <div class="column">
            <table>
              <tbody>
                ${renderColumn2(rightColumn)}
              </tbody>
            </table>
          </div>
        </div>
      `;
      
    }else{
      // 1단 구조: 원 안의 번호 + 영어|뜻 구조
      const renderColumn1 = () => {
        return rows.map(r=>{
          const circledNum = `<span class="circled-num">${r.i}</span>`;
          if(isAnswer){
            return `
              <tr>
                <td class="num1">${circledNum}</td>
                <td class="question1">${esc(r.p)}</td>
                <td class="answer1">${esc(r.a)}</td>
              </tr>`;
          }else{
            return `
              <tr>
                <td class="num1">${circledNum}</td>
                <td class="question1">${esc(r.p)}</td>
                <td class="blank1"></td>
              </tr>`;
          }
        }).join('');
      };
      
      contentHtml = `
        <div class="single-column">
          <table>
            <tbody>
              ${renderColumn1()}
            </tbody>
          </table>
        </div>
      `;
    }

    const html=`
<!doctype html><html><head><meta charset="utf-8"/>
<style>
@page{margin:10mm; size: A4}
*{margin:0; padding:0; box-sizing:border-box}
body{font-family:Arial, sans-serif; font-size:9pt; padding:10px}

.header{
  text-align:center;
  margin-bottom:15px;
  padding-bottom:10px;
  border-bottom:2px solid #333;
}
.header h2{
  font-size:16pt;
  margin-bottom:8px;
}
.info-fields{
  display:flex;
  justify-content:center;
  gap:40px;
  margin-top:8px;
}
.info-field{
  display:flex;
  align-items:center;
  gap:8px;
}
.info-field label{
  font-weight:bold;
  font-size:10pt;
}
.info-field .input-line{
  border-bottom:1px solid #000;
  min-width:150px;
  height:20px;
}

/* 1단 구조 스타일 */
.single-column{
  margin-top:10px;
}
.circled-num{
  display:inline-block;
  width:18px;
  height:18px;
  line-height:18px;
  text-align:center;
  border:1px solid #333;
  border-radius:50%;
  font-size:7pt;
}
.num1{
  width:24px;
  text-align:center;
  padding:2px 2px;
}
.question1{
  width:50%;
}
.answer1, .blank1{
  width:calc(50% - 24px);
}
.blank1{
  min-height:16px;
}

/* 2단 구조 스타일 */
.columns{
  display:flex;
  gap:10px;
  margin-top:10px;
}
.column{
  flex:1;
}
.question2{
  width:55%;
}
.answer2, .blank2{
  width:45%;
}
.blank2{
  min-height:20px;
}

/* 공통 테이블 스타일 */
table{
  width:100%;
  border-collapse:collapse;
  border:1px solid #333;
}
td{
  border:1px solid #333;
  padding:2px 4px;
  font-size:8.5pt;
  vertical-align:middle;
  line-height:1.3;
}

@media print{
  body{padding:5mm}
  .header h2{font-size:14pt}
}
</style></head><body>

<div class="header">
  <h2>${esc(title)}</h2>
  <div class="info-fields">
    <div class="info-field">
      <label>Name:</label>
      <div class="input-line"></div>
    </div>
    <div class="info-field">
      <label>Date:</label>
      <div class="input-line"></div>
    </div>
  </div>
</div>

${contentHtml}

<script>setTimeout(()=>window.print(),200)</script>
</body></html>`;

    w.document.open(); w.document.write(html); w.document.close();
  }

  window.generateTestPDF=function(mode){
    const pool=_pickPool();
    if(!pool.length){alert('단어 로드 필요');return;}

    // 전역 settings에서 퀴즈 카운트 가져오기 (최대 100개)
    const count = Math.min(window.settings?.quizCount || 50, 100);
    const shuffle = true; // 모바일에서는 기본적으로 셔플
    const dir=_getDirection();

    const {q,a}=_build(pool,count,dir,shuffle);
    if(!q.length){alert('문항 없음');return;}

    if(mode==='test') _openPrint('Word Test',q,false);
    else if(mode==='answer') _openPrint('Answer Sheet',a,true);
  };
})();
