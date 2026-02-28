/* =========================================================
 * Engine Core - 타이머, TTS, 디스패처 관리
 * Refactored: 2026-02-12 - App.State와 통합
 * ========================================================= */

(() => {
  'use strict';
  
  const W = window;
  const App = W.App = W.App || {};

  // ============================================
  // ⏱️ Timer Manager (Tracked Timeouts)
  // ============================================
  App.Timers = (() => {
    const timeouts = new Set();
    const intervals = new Set();

    return {
      /**
       * 추적 가능한 setTimeout
       * @param {Function} fn - 실행할 함수
       * @param {number} ms - 지연 시간 (밀리초)
       * @param {...any} args - 함수에 전달할 인자
       * @returns {number} timeout ID
       */
      setTimeout(fn, ms, ...args) {
        const id = W.setTimeout(() => {
          try {
            fn(...args);
          } catch (e) {
            console.error('Timer callback error:', e);
          } finally {
            timeouts.delete(id);
          }
        }, ms);
        timeouts.add(id);
        return id;
      },

      /**
       * 추적 가능한 setInterval
       * @param {Function} fn - 실행할 함수
       * @param {number} ms - 반복 간격 (밀리초)
       * @param {...any} args - 함수에 전달할 인자
       * @returns {number} interval ID
       */
      setInterval(fn, ms, ...args) {
        const id = W.setInterval(() => {
          try {
            fn(...args);
          } catch (e) {
            console.error('Interval callback error:', e);
          }
        }, ms);
        intervals.add(id);
        return id;
      },

      /**
       * 특정 timeout 제거
       */
      clearTimeout(id) {
        try {
          W.clearTimeout(id);
        } catch (e) {
          console.error('clearTimeout error:', e);
        }
        timeouts.delete(id);
      },

      /**
       * 특정 interval 제거
       */
      clearInterval(id) {
        try {
          W.clearInterval(id);
        } catch (e) {
          console.error('clearInterval error:', e);
        }
        intervals.delete(id);
      },

      /**
       * 모든 타이머 제거
       */
      clearAll() {
        // Clear all timeouts
        for (const id of Array.from(timeouts)) {
          this.clearTimeout(id);
        }
        // Clear all intervals
        for (const id of Array.from(intervals)) {
          this.clearInterval(id);
        }
      },

      /**
       * 현재 활성 타이머 수
       */
      getActiveCount() {
        return {
          timeouts: timeouts.size,
          intervals: intervals.size,
          total: timeouts.size + intervals.size
        };
      }
    };
  })();

  // ============================================
  // 🎤 TTS Manager (Text-to-Speech)
  // ============================================
  App.TTS = (() => {
    let currentUtterance = null;

    return {
      /**
       * TTS 재생 중단
       */
      cancel() {
        try {
          if (W.speechSynthesis) {
            W.speechSynthesis.cancel();
            currentUtterance = null;
          }
        } catch (e) {
          console.error('TTS cancel error:', e);
        }
      },

      /**
       * 텍스트 읽기
       * @param {string} text - 읽을 텍스트
       * @param {Object} options - 음성 옵션
       * @returns {Promise<void>}
       */
      speak(text, options = {}) {
        return new Promise((resolve, reject) => {
          try {
            if (!W.speechSynthesis) {
              reject(new Error('Speech synthesis not supported'));
              return;
            }

            this.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = options.lang || 'en-US';
            utterance.rate = options.rate || 1.0;
            utterance.pitch = options.pitch || 1.0;
            utterance.volume = options.volume || 1.0;

            if (options.voice) {
              utterance.voice = options.voice;
            }

            utterance.onend = () => {
              currentUtterance = null;
              resolve();
            };

            utterance.onerror = (event) => {
              currentUtterance = null;
              reject(event);
            };

            currentUtterance = utterance;
            W.speechSynthesis.speak(utterance);
          } catch (e) {
            reject(e);
          }
        });
      },

      /**
       * TTS가 재생 중인지 확인
       */
      isSpeaking() {
        return W.speechSynthesis && W.speechSynthesis.speaking;
      },

      /**
       * 사용 가능한 음성 목록
       */
      getVoices() {
        return W.speechSynthesis ? W.speechSynthesis.getVoices() : [];
      }
    };
  })();

  // ============================================
  // 📡 Action Dispatcher (Event Bus)
  // ============================================
  App.dispatch = (() => {
    const actionHandlers = new Map();

    return {
      /**
       * 액션 핸들러 등록
       * @param {string} action - 액션 이름
       * @param {Function} handler - 핸들러 함수
       */
      register(action, handler) {
        if (!actionHandlers.has(action)) {
          actionHandlers.set(action, []);
        }
        actionHandlers.get(action).push(handler);
      },

      /**
       * 액션 핸들러 제거
       * @param {string} action - 액션 이름
       * @param {Function} handler - 제거할 핸들러
       */
      unregister(action, handler) {
        if (!actionHandlers.has(action)) return;
        const handlers = actionHandlers.get(action);
        const index = handlers.indexOf(handler);
        if (index > -1) {
          handlers.splice(index, 1);
        }
      },

      /**
       * 액션 실행
       * @param {string} action - 액션 이름
       * @param {any} payload - 전달할 데이터
       * @returns {Array} 각 핸들러의 반환값 배열
       */
      execute(action, payload) {
        // Legacy hook 지원
        if (typeof W.handleAction === 'function') {
          try {
            W.handleAction(action, payload);
          } catch (e) {
            console.error('Legacy handleAction error:', e);
          }
        }

        // Built-in system actions
        if (action === 'STOP_ALL') {
          App.Timers.clearAll();
          App.TTS.cancel();
          if (App.State) {
            App.State.setIsRunning(false);
          }
          return [true];
        }

        // Custom action handlers
        const handlers = actionHandlers.get(action);
        if (!handlers || handlers.length === 0) {
          return [];
        }

        return handlers.map(handler => {
          try {
            return handler(payload);
          } catch (e) {
            console.error(`Error in action handler for "${action}":`, e);
            return null;
          }
        });
      }
    };
  })();

  // ============================================
  // 🚀 Engine 초기화
  // ============================================
  App.Engine = {
    /**
     * 엔진 시작
     */
    start() {
      console.debug('🚀 Engine started');
      if (App.State) {
        App.State.setIsRunning(true);
      }
    },

    /**
     * 엔진 정지
     */
    stop() {
      console.debug('⏹️ Engine stopped');
      App.Timers.clearAll();
      App.TTS.cancel();
      if (App.State) {
        App.State.setIsRunning(false);
      }
    },

    /**
     * 엔진 상태 확인
     */
    getStatus() {
      return {
        running: App.State ? App.State.getIsRunning() : false,
        timers: App.Timers.getActiveCount(),
        tts: App.TTS.isSpeaking()
      };
    }
  };

  // ============================================
  // 🎯 전역 함수 (Backward Compatibility)
  // ============================================
  // 기존 코드와의 호환성을 위한 전역 함수
  W.stopApp = () => App.Engine.stop();

  // ============================================
  // 🎉 초기화 완료
  // ============================================
  console.debug('✅ Engine Core initialized');

})();
