"use strict";

this.inlets = 1;
this.outlets = 3;

const LIMITS = Object.freeze({
  globalMin: 1,
  globalMax: 64,
  bankIndexMin: 0,
  bankIndexMax: 7,
  pcMin: 1,
  pcMax: 8,
  validDelays: [0, 5, 10],
});

const DEFAULT_STATE = Object.freeze({
  globalProgram: 1,
  delay: 0,
});
const MIDI_CONSTANTS = Object.freeze({
  pcStatus: 192,
});

const UI_SYNC_SELECTORS = Object.freeze([
  {
    selector: "set_bankindex",
    getValue(state, derived) {
      return derived.bankIndex;
    },
  },
  {
    selector: "set_pc",
    getValue(state, derived) {
      return derived.pcDisplay;
    },
  },
  {
    selector: "set_global",
    getValue(state) {
      return state.globalProgram;
    },
  },
  {
    selector: "set_delay",
    getValue(state) {
      return state.delay;
    },
  },
]);

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toInt(value, fallback) {
  return Math.trunc(toNumber(value, fallback));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function sanitizeGlobalProgram(value, fallback) {
  return clamp(
    toInt(value, fallback),
    LIMITS.globalMin,
    LIMITS.globalMax
  );
}

function buildStateViewFromSanitizedState(state) {
  return {
    state,
    derived: deriveProgramData(state.globalProgram),
  };
}

function buildStateView(state) {
  return buildStateViewFromSanitizedState(sanitizeState(state));
}

function sanitizeDelay(value) {
  const delay = toInt(value, 0);
  return LIMITS.validDelays.includes(delay) ? delay : 0;
}

function sanitizeState(input) {
  const state = input || {};
  return {
    globalProgram: sanitizeGlobalProgram(
      state.globalProgram,
      DEFAULT_STATE.globalProgram
    ),
    delay: sanitizeDelay(state.delay),
  };
}

function deriveProgramData(globalProgram) {
  const safeGlobal = sanitizeGlobalProgram(
    globalProgram,
    DEFAULT_STATE.globalProgram
  );
  const bankIndex = Math.floor((safeGlobal - 1) / 8);
  const pcIndex = (safeGlobal - 1) % 8;

  return {
    globalProgram: safeGlobal,
    bankIndex,
    bankDisplay: bankIndex + 1,
    pcIndex,
    pcDisplay: pcIndex + 1,
    pcSendValue: safeGlobal - 1,
  };
}

function setGlobalProgram(state, globalProgram) {
  const safeState = sanitizeState(state);
  return {
    ...safeState,
    globalProgram: sanitizeGlobalProgram(
      globalProgram,
      safeState.globalProgram
    ),
  };
}

function setBankIndex(state, bankIndex) {
  const view = buildStateView(state);
  const nextBankIndex = clamp(
    toInt(bankIndex, view.derived.bankIndex),
    LIMITS.bankIndexMin,
    LIMITS.bankIndexMax
  );

  return {
    ...view.state,
    globalProgram: nextBankIndex * 8 + view.derived.pcDisplay,
  };
}

function setPcDisplay(state, pcDisplay) {
  const view = buildStateView(state);
  const nextPcDisplay = clamp(
    toInt(pcDisplay, view.derived.pcDisplay),
    LIMITS.pcMin,
    LIMITS.pcMax
  );

  return {
    ...view.state,
    globalProgram: view.derived.bankIndex * 8 + nextPcDisplay,
  };
}

function stepGlobalProgram(state, step) {
  const safeState = sanitizeState(state);
  const nextGlobal = safeState.globalProgram + step;

  if (nextGlobal > LIMITS.globalMax) {
    return {
      ...safeState,
      globalProgram: LIMITS.globalMin,
    };
  }

  if (nextGlobal < LIMITS.globalMin) {
    return {
      ...safeState,
      globalProgram: LIMITS.globalMax,
    };
  }

  return {
    ...safeState,
    globalProgram: nextGlobal,
  };
}

function incrementGlobalProgram(state) {
  return stepGlobalProgram(state, 1);
}

function decrementGlobalProgram(state) {
  return stepGlobalProgram(state, -1);
}

const ACTION_SPECS = Object.freeze({
  global: {
    acceptsValue: true,
    shouldSend: true,
    reduce(state, value) {
      return setGlobalProgram(state, value);
    },
  },
  bankindex: {
    acceptsValue: true,
    shouldSend: true,
    reduce(state, value) {
      return setBankIndex(state, value);
    },
  },
  pc: {
    acceptsValue: true,
    shouldSend: true,
    reduce(state, value) {
      return setPcDisplay(state, value);
    },
  },
  inc: {
    acceptsValue: false,
    shouldSend: true,
    reduce(state) {
      return incrementGlobalProgram(state);
    },
  },
  dec: {
    acceptsValue: false,
    shouldSend: true,
    reduce(state) {
      return decrementGlobalProgram(state);
    },
  },
  delay: {
    acceptsValue: true,
    shouldSend: false,
    reduce(state, value) {
      return { ...state, delay: sanitizeDelay(value) };
    },
  },
  send: {
    acceptsValue: false,
    shouldSend: true,
    reduce(state) {
      return state;
    },
  },
  restorebegin: {
    acceptsValue: false,
    shouldSend: false,
    reduce(state) {
      return state;
    },
  },
  restoreend: {
    acceptsValue: false,
    shouldSend: false,
    reduce(state) {
      return state;
    },
  },
});

function reduceState(state, action) {
  const safeState = sanitizeState(state);
  const transition = ACTION_SPECS[action.type];

  if (!transition) {
    throw new Error(`Unknown action type: ${action.type}`);
  }

  return {
    state: transition.reduce(safeState, action.value),
    shouldSend: transition.shouldSend,
  };
}

function buildMidiMessages(state) {
  const view = buildStateView(state);
  const pcMessage = [MIDI_CONSTANTS.pcStatus, view.derived.pcSendValue];

  return {
    state: view.state,
    derived: view.derived,
    bankMessages: [],
    pcMessage,
    allMessages: [pcMessage],
  };
}

function buildSendPlan(state) {
  const midi = buildMidiMessages(state);

  if (midi.state.delay > 0) {
    return {
      delayMs: midi.state.delay,
      immediateMessages: [],
      delayedMessages: [midi.pcMessage],
      midi,
    };
  }

  return {
    delayMs: 0,
    immediateMessages: midi.allMessages,
    delayedMessages: [],
    midi,
  };
}

function formatCurrentStatus(state) {
  const view = buildStateView(state);
  return `Current: Bank ${view.derived.bankDisplay} / PC ${view.derived.pcDisplay}`;
}

function formatSendStatus(state) {
  const view = buildStateView(state);
  return `Send: PC=${view.derived.pcSendValue}`;
}

function createNodeScheduler() {
  return {
    schedule(delayMs, fn) {
      return setTimeout(fn, delayMs);
    },
    cancel(handle) {
      clearTimeout(handle);
    },
  };
}

function createMaxScheduler(hostObject) {
  if (typeof Task === "function") {
    return {
      schedule(delayMs, fn) {
        const task = new Task(fn, hostObject || this);
        task.schedule(delayMs);
        return task;
      },
      cancel(handle) {
        if (handle && typeof handle.cancel === "function") {
          handle.cancel();
        }
      },
    };
  }

  return createNodeScheduler();
}

function applyNamedAction(controller, methodName, value) {
  const spec = ACTION_SPECS[methodName];
  const actionType = methodName;

  if (!spec) {
    throw new Error(`Unknown controller method: ${methodName}`);
  }

  return spec.acceptsValue
    ? controller.applyAction({ type: actionType, value })
    : controller.applyAction({ type: actionType });
}

function createController(runtime) {
  const env = runtime || {};
  const scheduler =
    env.scheduler ||
    (typeof outlet === "function" ? createMaxScheduler(env.hostObject || this) : createNodeScheduler());

  const controller = {
    state: sanitizeState(env.initialState || DEFAULT_STATE),
    pendingSend: null,
    isRestoring: false,
    restoreDirty: false,
    runtime: {
      emitMidi: env.emitMidi || function noopMidi() {},
      emitUi: env.emitUi || function noopUi() {},
      emitStatus: env.emitStatus || function noopStatus() {},
      log: env.log || function noopLog() {},
      scheduler,
    },

    getState() {
      return { ...this.state };
    },

    getPendingSend() {
      if (!this.pendingSend) {
        return null;
      }

      return {
        delayMs: this.pendingSend.delayMs,
        messages: this.pendingSend.messages.map((message) => message.slice()),
      };
    },

    cancelPendingSend() {
      if (!this.pendingSend) {
        return;
      }

      this.runtime.scheduler.cancel(this.pendingSend.handle);
      this.pendingSend = null;
    },

    emitUiState() {
      const view = buildStateViewFromSanitizedState(this.state);

      for (const entry of UI_SYNC_SELECTORS) {
        this.runtime.emitUi(entry.selector, entry.getValue(view.state, view.derived));
      }
    },

    emitStatusLines() {
      this.runtime.emitStatus(formatCurrentStatus(this.state));
      this.runtime.emitStatus(formatSendStatus(this.state));
    },

    emitUiAndStatus() {
      this.emitUiState();
      this.emitStatusLines();
    },

    emitMessageList(messages) {
      for (const bytes of messages) {
        this.runtime.emitMidi(bytes.slice());
      }
    },

    scheduleDelayedMessages(messages, delayMs) {
      const clonedMessages = messages.map((message) => message.slice());
      const handle = this.runtime.scheduler.schedule(delayMs, () => {
        this.emitMessageList(clonedMessages);
        this.pendingSend = null;
      });

      this.pendingSend = {
        handle,
        delayMs,
        messages: clonedMessages,
      };
    },

    reconcilePendingDelayChange() {
      const plan = buildSendPlan(this.state);
      this.cancelPendingSend();

      if (plan.delayMs > 0) {
        this.scheduleDelayedMessages(plan.delayedMessages, plan.delayMs);
      } else {
        this.emitMessageList([plan.midi.pcMessage]);
      }

      this.emitStatusLines();
    },

    sendCurrentState() {
      const plan = buildSendPlan(this.state);
      this.cancelPendingSend();
      this.emitMessageList(plan.immediateMessages);

      if (plan.delayedMessages.length > 0) {
        this.scheduleDelayedMessages(plan.delayedMessages, plan.delayMs);
      }

      this.emitStatusLines();
    },

    beginRestore() {
      this.cancelPendingSend();
      this.isRestoring = true;
      this.restoreDirty = false;
      this.emitStatusLines();
    },

    endRestore() {
      const shouldFlush = this.isRestoring && this.restoreDirty;
      this.isRestoring = false;
      this.restoreDirty = false;

      if (shouldFlush) {
        this.sendCurrentState();
      } else {
        this.emitStatusLines();
      }
    },

    applyAction(action) {
      if (action.type === "restorebegin") {
        this.beginRestore();
        return this.getState();
      }

      if (action.type === "restoreend") {
        this.endRestore();
        return this.getState();
      }

      const hadPendingSend = this.pendingSend !== null;
      const result = reduceState(this.state, action);
      this.state = result.state;
      this.emitUiState();

      if (this.isRestoring) {
        if (result.shouldSend || action.type === "delay") {
          this.restoreDirty = true;
        }

        this.cancelPendingSend();
        this.emitStatusLines();
      } else if (result.shouldSend) {
        this.sendCurrentState();
      } else if (action.type === "delay" && hadPendingSend) {
        this.reconcilePendingDelayChange();
      } else {
        this.emitStatusLines();
      }

      return this.getState();
    },

    loadbang() {
      this.emitUiAndStatus();
    },

    notifydeleted() {
      this.cancelPendingSend();
    },
  };

  for (const methodName of Object.keys(ACTION_SPECS)) {
    controller[methodName] = function controllerAction(value) {
      return applyNamedAction(this, methodName, value);
    };
  }

  return controller;
}

const isMaxEnvironment = typeof outlet === "function";

let maxController = null;

function createMaxRuntime(hostObject) {
  return {
    hostObject,
    emitMidi(bytes) {
      outlet(0, bytes);
    },
    emitUi(selector, value) {
      outlet(1, selector, value);
    },
    emitStatus(text) {
      outlet(2, text);
    },
    log(text) {
      if (typeof post === "function") {
        post(`${text}\n`);
      }
    },
  };
}

function createMaxController(hostObject) {
  return createController(createMaxRuntime(hostObject));
}

function getMaxController() {
  if (!maxController) {
    maxController = createMaxController(this);
  }

  return maxController;
}

function dispatchToMaxController(method, ...args) {
  if (!isMaxEnvironment) {
    return undefined;
  }

  return getMaxController.call(this)[method](...args);
}

function dispatchValueToMax(method, value) {
  return dispatchToMaxController.call(this, method, value);
}

function dispatchActionToMax(method) {
  return dispatchToMaxController.call(this, method);
}

function loadbang() {
  // In the device patch, restored live.* parameters are the source of truth.
  // Emitting the controller's default state on JS load can race with bpatcher restore
  // and overwrite the saved values before they are re-sent into the controller.
  return undefined;
}

function msg_int(value) {
  return dispatchValueToMax.call(this, "global", value);
}

function msg_float(value) {
  return dispatchValueToMax.call(this, "global", value);
}

function bang() {
  return dispatchActionToMax.call(this, "send");
}

function global(value) {
  return dispatchValueToMax.call(this, "global", value);
}

function bankindex(value) {
  return dispatchValueToMax.call(this, "bankindex", value);
}

function pc(value) {
  return dispatchValueToMax.call(this, "pc", value);
}

function inc() {
  return dispatchActionToMax.call(this, "inc");
}

function dec() {
  return dispatchActionToMax.call(this, "dec");
}

function send() {
  return dispatchActionToMax.call(this, "send");
}

function wrap(value) {
  void value;
}

function delay(value) {
  return dispatchValueToMax.call(this, "delay", value);
}

function restorebegin() {
  return dispatchActionToMax.call(this, "restorebegin");
}

function restoreend() {
  return dispatchActionToMax.call(this, "restoreend");
}

function notifydeleted() {
  return dispatchActionToMax.call(this, "notifydeleted");
}

function anything(...args) {
  if (isMaxEnvironment && typeof post === "function") {
    post(`bank_pc_controller_ju06a.js: unknown message "${this.messagename}" ${args.join(" ")}\n`);
  }
}

const exported = {
  LIMITS,
  DEFAULT_STATE,
  sanitizeState,
  deriveProgramData,
  buildStateView,
  setGlobalProgram,
  setBankIndex,
  setPcDisplay,
  incrementGlobalProgram,
  decrementGlobalProgram,
  reduceState,
  buildMidiMessages,
  buildSendPlan,
  formatCurrentStatus,
  formatSendStatus,
  applyNamedAction,
  createController,
  createMaxRuntime,
  createMaxController,
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = exported;
}
