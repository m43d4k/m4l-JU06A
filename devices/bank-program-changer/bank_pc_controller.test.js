"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildStateView,
  DEFAULT_STATE,
  applyNamedAction,
  buildMidiMessages,
  buildSendPlan,
  createController,
  createMaxController,
  deriveProgramData,
  formatCurrentStatus,
  formatSendStatus,
  reduceState,
  sanitizeState,
} = require("./bank_pc_controller_ju06a.js");

class FakeScheduler {
  constructor() {
    this.handles = [];
    this.nextId = 1;
  }

  schedule(delayMs, fn) {
    const handle = {
      id: this.nextId++,
      delayMs,
      fn,
      cancelled: false,
      fired: false,
    };

    this.handles.push(handle);
    return handle;
  }

  cancel(handle) {
    if (handle) {
      handle.cancelled = true;
    }
  }

  flushNext() {
    const handle = this.handles.find((entry) => !entry.cancelled && !entry.fired);

    if (!handle) {
      return false;
    }

    handle.fired = true;
    handle.fn();
    return true;
  }

  flushAll() {
    while (this.flushNext()) {
      continue;
    }
  }
}

function createRuntime(initialState) {
  const scheduler = new FakeScheduler();
  const midi = [];
  const ui = [];
  const status = [];

  const controller = createController({
    initialState,
    scheduler,
    emitMidi(bytes) {
      midi.push(bytes);
    },
    emitUi(selector, value) {
      ui.push([selector, value]);
    },
    emitStatus(text) {
      status.push(text);
    },
  });

  return { controller, scheduler, midi, ui, status };
}

test("deriveProgramData maps representative global program values", () => {
  const expectations = [
    [1, 0, 1, 0, 1, 0],
    [8, 0, 1, 7, 8, 7],
    [9, 1, 2, 0, 1, 8],
    [16, 1, 2, 7, 8, 15],
    [57, 7, 8, 0, 1, 56],
    [64, 7, 8, 7, 8, 63],
  ];

  for (const [globalProgram, bankIndex, bankDisplay, pcIndex, pcDisplay, pc] of expectations) {
    assert.deepEqual(deriveProgramData(globalProgram), {
      globalProgram,
      bankIndex,
      bankDisplay,
      pcIndex,
      pcDisplay,
      pcSendValue: pc,
    });
  }
});

test("reduceState handles stepping, looping, bank patch preservation, and pc clamping", () => {
  let result = reduceState(DEFAULT_STATE, { type: "global", value: 8 });
  assert.equal(result.state.globalProgram, 8);

  result = reduceState(result.state, { type: "inc" });
  assert.equal(result.state.globalProgram, 9);

  result = reduceState(result.state, { type: "dec" });
  assert.equal(result.state.globalProgram, 8);

  result = reduceState(result.state, { type: "bankindex", value: 3 });
  assert.equal(result.state.globalProgram, 32);

  result = reduceState(result.state, { type: "pc", value: 0 });
  assert.equal(result.state.globalProgram, 25);

  result = reduceState(result.state, { type: "pc", value: 101 });
  assert.equal(result.state.globalProgram, 32);

  result = reduceState(sanitizeState({ ...DEFAULT_STATE, globalProgram: 64 }), { type: "inc" });
  assert.equal(result.state.globalProgram, 1);

  result = reduceState(sanitizeState({ ...DEFAULT_STATE, globalProgram: 1 }), { type: "dec" });
  assert.equal(result.state.globalProgram, 64);

  assert.throws(() => reduceState(DEFAULT_STATE, { type: "unknown" }), /Unknown action type/);
});

test("sanitizeState clamps global program and normalizes delay", () => {
  assert.deepEqual(
    sanitizeState({
      globalProgram: 999,
      delay: 7,
    }),
    {
      globalProgram: 64,
      delay: 0,
    }
  );
});

test("buildStateView combines sanitized state with derived program data", () => {
  assert.deepEqual(buildStateView({ globalProgram: 0, delay: 7 }), {
    state: {
      globalProgram: 1,
      delay: 0,
    },
    derived: deriveProgramData(1),
  });
});

test("buildMidiMessages generates zero-based Program Change bytes without Bank Select", () => {
  assert.deepEqual(buildMidiMessages(DEFAULT_STATE), {
    state: DEFAULT_STATE,
    derived: deriveProgramData(1),
    bankMessages: [],
    pcMessage: [192, 0],
    allMessages: [
      [192, 0],
    ],
  });

  const midi = buildMidiMessages({
    ...DEFAULT_STATE,
    globalProgram: 42,
  });

  assert.deepEqual(midi.bankMessages, []);
  assert.deepEqual(midi.pcMessage, [192, 41]);
  assert.deepEqual(midi.allMessages, [
    [192, 41],
  ]);
});

test("buildSendPlan delays Program Change without emitting Bank Select", () => {
  const plan = buildSendPlan({
    ...DEFAULT_STATE,
    globalProgram: 42,
    delay: 10,
  });

  assert.equal(plan.delayMs, 10);
  assert.deepEqual(plan.immediateMessages, []);
  assert.deepEqual(plan.delayedMessages, [[192, 41]]);
});

test("applyNamedAction dispatches by method name", () => {
  const { controller } = createRuntime(DEFAULT_STATE);

  applyNamedAction(controller, "global", 42);
  assert.equal(controller.getState().globalProgram, 42);

  applyNamedAction(controller, "inc");
  assert.equal(controller.getState().globalProgram, 43);

  applyNamedAction(controller, "restorebegin");
  applyNamedAction(controller, "restoreend");

  assert.throws(() => applyNamedAction(controller, "unknown"), /Unknown controller method/);
});

test("controller loadbang emits UI sync using delay values rather than live.menu indexes", () => {
  const { controller, ui, status } = createRuntime({
    ...DEFAULT_STATE,
    globalProgram: 42,
    delay: 10,
  });

  controller.loadbang();

  assert.deepEqual(ui, [
    ["set_bankindex", 5],
    ["set_pc", 2],
    ["set_global", 42],
    ["set_delay", 10],
  ]);
  assert.deepEqual(status.slice(-2), [
    formatCurrentStatus(controller.getState()),
    formatSendStatus(controller.getState()),
  ]);
});

test("createMaxController routes MIDI, UI, and status to Max outlets", () => {
  const outletCalls = [];
  const originalOutlet = global.outlet;
  const originalPost = global.post;

  global.outlet = (...args) => {
    outletCalls.push(args);
  };
  global.post = () => {};

  try {
    const controller = createMaxController({});
    controller.loadbang();
    controller.send();

    assert.deepEqual(outletCalls.slice(0, 4), [
      [1, "set_bankindex", 0],
      [1, "set_pc", 1],
      [1, "set_global", 1],
      [1, "set_delay", 0],
    ]);
    assert.deepEqual(outletCalls.slice(-4), [
      [1, "set_delay", 0],
      [0, [192, 0]],
      [2, "Current: Bank 1 / PC 1"],
      [2, "Send: PC=0"],
    ]);
  } finally {
    global.outlet = originalOutlet;
    global.post = originalPost;
  }
});

test("bank, pc, increment, and decrement emit MIDI", () => {
  const { controller, midi } = createRuntime(DEFAULT_STATE);

  controller.bankindex(1);
  assert.deepEqual(midi, [[192, 8]]);

  midi.length = 0;
  controller.pc(4);
  assert.deepEqual(midi, [[192, 11]]);

  midi.length = 0;
  controller.inc();
  assert.deepEqual(midi, [[192, 12]]);

  midi.length = 0;
  controller.dec();
  assert.deepEqual(midi, [[192, 11]]);
});

test("global edits recalculate bank and pc and emit MIDI", () => {
  const { controller, midi, ui, status } = createRuntime(DEFAULT_STATE);

  controller.global(28);

  assert.equal(controller.getState().globalProgram, 28);
  assert.deepEqual(midi, [[192, 27]]);
  assert.deepEqual(ui.slice(-4), [
    ["set_bankindex", 3],
    ["set_pc", 4],
    ["set_global", 28],
    ["set_delay", 0],
  ]);
  assert.deepEqual(status.slice(-2), [
    "Current: Bank 4 / PC 4",
    "Send: PC=27",
  ]);
});

test("bank edits preserve the current patch and emit MIDI", () => {
  const { controller, midi, ui, status } = createRuntime({
    ...DEFAULT_STATE,
    globalProgram: 42,
  });

  controller.bankindex(3);

  assert.equal(controller.getState().globalProgram, 26);
  assert.deepEqual(midi, [[192, 25]]);
  assert.deepEqual(ui.slice(-4), [
    ["set_bankindex", 3],
    ["set_pc", 2],
    ["set_global", 26],
    ["set_delay", 0],
  ]);
  assert.deepEqual(status.slice(-2), [
    "Current: Bank 4 / PC 2",
    "Send: PC=25",
  ]);
});

test("send always emits MIDI", () => {
  const { controller, midi } = createRuntime({
    ...DEFAULT_STATE,
    globalProgram: 42,
  });

  controller.send();

  assert.deepEqual(midi, [[192, 41]]);
});

test("send-producing actions emit one status refresh", () => {
  const { controller, status } = createRuntime({
    ...DEFAULT_STATE,
    globalProgram: 42,
  });

  controller.send();

  assert.deepEqual(status, [
    "Current: Bank 6 / PC 2",
    "Send: PC=41",
  ]);
});

test("delay replacement keeps only the latest explicit send", () => {
  const { controller, scheduler, midi } = createRuntime({
    ...DEFAULT_STATE,
    delay: 10,
  });

  controller.send();
  controller.global(42);
  controller.send();

  assert.deepEqual(midi, []);
  scheduler.flushAll();
  assert.deepEqual(midi, [[192, 41]]);
});

test("global changes replace a pending delayed send snapshot", () => {
  const { controller, scheduler, midi } = createRuntime({
    ...DEFAULT_STATE,
    delay: 10,
  });

  controller.send();
  controller.global(42);
  scheduler.flushAll();

  assert.deepEqual(midi, [[192, 41]]);
});

test("delayed increment replacement keeps only the latest snapshot", () => {
  const { controller, scheduler, midi } = createRuntime({
    ...DEFAULT_STATE,
    delay: 10,
  });

  controller.inc();
  controller.inc();

  assert.deepEqual(midi, []);
  scheduler.flushAll();
  assert.deepEqual(midi, [[192, 2]]);
});

test("delay change to zero flushes a pending program change immediately", () => {
  const { controller, scheduler, midi } = createRuntime({
    ...DEFAULT_STATE,
    delay: 10,
  });

  controller.global(42);
  controller.delay(0);

  assert.deepEqual(midi, [[192, 41]]);
  assert.equal(controller.getPendingSend(), null);
  scheduler.flushAll();
  assert.deepEqual(midi, [[192, 41]]);
});

test("delay change reschedules a pending program change", () => {
  const { controller, scheduler, midi } = createRuntime({
    ...DEFAULT_STATE,
    delay: 10,
  });

  controller.global(42);
  controller.delay(5);

  assert.deepEqual(midi, []);
  assert.deepEqual(controller.getPendingSend(), {
    delayMs: 5,
    messages: [[192, 41]],
  });
  scheduler.flushAll();
  assert.deepEqual(midi, [[192, 41]]);
});

test("notifydeleted cancels a pending delayed program change", () => {
  const { controller, scheduler, midi } = createRuntime({
    ...DEFAULT_STATE,
    delay: 10,
  });

  controller.global(42);
  controller.notifydeleted();
  scheduler.flushAll();

  assert.deepEqual(midi, []);
  assert.equal(controller.getPendingSend(), null);
});

test("restore window coalesces restore-triggered bank and global updates into one send", () => {
  const { controller, scheduler, midi, ui } = createRuntime({
    ...DEFAULT_STATE,
    delay: 10,
  });

  controller.restorebegin();
  controller.bankindex(4);
  controller.global(42);

  assert.deepEqual(midi, []);
  assert.equal(controller.getState().globalProgram, 42);
  assert.deepEqual(ui.slice(-4), [
    ["set_bankindex", 5],
    ["set_pc", 2],
    ["set_global", 42],
    ["set_delay", 10],
  ]);

  controller.restoreend();

  assert.deepEqual(midi, []);
  assert.deepEqual(controller.getPendingSend(), {
    delayMs: 10,
    messages: [[192, 41]],
  });
  scheduler.flushAll();
  assert.deepEqual(midi, [
    [192, 41],
  ]);
});

test("restore end without restore changes does not send MIDI", () => {
  const { controller, midi } = createRuntime(DEFAULT_STATE);

  controller.restorebegin();
  controller.restoreend();

  assert.deepEqual(midi, []);
});
