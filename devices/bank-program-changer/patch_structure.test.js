"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DEVICE_DIR = __dirname;

function readJson(filename) {
  return JSON.parse(fs.readFileSync(path.join(DEVICE_DIR, filename), "utf8"));
}

function readText(filename) {
  return fs.readFileSync(path.join(DEVICE_DIR, filename), "utf8");
}

function readAmxdJson(filename) {
  const contents = readText(filename);
  const jsonStart = contents.indexOf("{");
  const jsonEnd = contents.lastIndexOf("}");

  assert.notEqual(jsonStart, -1, `${filename} has no embedded JSON`);
  assert.notEqual(jsonEnd, -1, `${filename} has no embedded JSON`);

  return JSON.parse(contents.slice(jsonStart, jsonEnd + 1));
}

function getBoxesById(patch) {
  const map = new Map();

  for (const entry of patch.patcher.boxes) {
    map.set(entry.box.id, entry.box);
  }

  return map;
}

function hasLine(patch, sourceId, destinationId) {
  return patch.patcher.lines.some((entry) => {
    const line = entry.patchline;
    return line.source[0] === sourceId && line.destination[0] === destinationId;
  });
}

test("logic patch keeps controller, MIDI thru, and UI sync wiring", () => {
  const patch = readJson("logic_ju06a.maxpat");
  const boxes = getBoxesById(patch);

  assert.equal(boxes.get("obj-v8").text, "v8 bank_pc_controller_ju06a.js");
  assert.equal(boxes.get("obj-midiin").text, "midiin");
  assert.equal(boxes.get("obj-midiout").text, "midiout");
  assert.equal(
    boxes.get("obj-route-ui").text,
    "route set_bankindex set_pc set_global set_delay"
  );

  assert.ok(hasLine(patch, "obj-midiin", "obj-midiout"));
  assert.ok(hasLine(patch, "obj-v8", "obj-midiout"));
  assert.ok(hasLine(patch, "obj-v8", "obj-route-ui"));
  assert.ok(hasLine(patch, "obj-v8", "obj-route-status"));
  assert.equal(boxes.get("obj-recv-restore").text, "r ---ui-restore-action");
  assert.ok(hasLine(patch, "obj-recv-restore", "obj-v8"));
});

test("ui patch restores global and delay from a redundant parent-trigger resend", () => {
  const patch = readJson("ui_ju06a.maxpat");
  const boxes = getBoxesById(patch);

  assert.equal(boxes.get("obj-4").text, "r ---parent-restore-trigger");
  assert.equal(boxes.get("obj-delay-init").text, "outputvalue");
  assert.equal(boxes.get("obj-restore-delay").text, "delay 50");
  assert.equal(boxes.get("obj-restore-delay-late").text, "delay 200");
  assert.equal(boxes.get("obj-restore-begin-msg").text, "restorebegin");
  assert.equal(boxes.get("obj-restore-end").text, "delay 260");
  assert.equal(boxes.get("obj-restore-end-msg").text, "restoreend");
  assert.equal(boxes.get("obj-send-restore").text, "s ---ui-restore-action");

  assert.ok(hasLine(patch, "obj-4", "obj-restore-begin-msg"));
  assert.ok(hasLine(patch, "obj-4", "obj-restore-delay"));
  assert.ok(hasLine(patch, "obj-4", "obj-restore-end"));
  assert.ok(hasLine(patch, "obj-4", "obj-restore-delay-late"));
  assert.ok(hasLine(patch, "obj-restore-begin-msg", "obj-send-restore"));
  assert.ok(hasLine(patch, "obj-restore-delay", "obj-delay-init"));
  assert.ok(hasLine(patch, "obj-restore-end", "obj-restore-end-msg"));
  assert.ok(hasLine(patch, "obj-restore-end-msg", "obj-send-restore"));
  assert.ok(hasLine(patch, "obj-restore-delay-late", "obj-delay-init"));
  assert.ok(hasLine(patch, "obj-delay-init", "obj-delay"));
  assert.ok(hasLine(patch, "obj-delay-init", "obj-global-display"));
});

test("ui patch exposes bank, increment, and decrement for Live mapping", () => {
  const patch = readJson("ui_ju06a.maxpat");
  const boxes = getBoxesById(patch);

  assert.equal(boxes.get("obj-bank").parameter_mappable, 1);
  assert.equal(boxes.get("obj-bank").saved_attribute_attributes.valueof.parameter_invisible, 0);
  assert.deepEqual(
    boxes.get("obj-bank").saved_attribute_attributes.valueof.parameter_enum,
    ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8"]
  );
  assert.equal(boxes.get("obj-bank").saved_attribute_attributes.valueof.parameter_mmax, 7);
  assert.equal(boxes.get("obj-pc").minimum, 1);
  assert.equal(boxes.get("obj-pc").maximum, 8);
  assert.equal(
    boxes.get("obj-global-display").saved_attribute_attributes.valueof.parameter_mmax,
    64
  );
  assert.equal(boxes.get("obj-1").parameter_mappable, 1);
  assert.equal(boxes.get("obj-1").saved_attribute_attributes.valueof.parameter_invisible, 0);
  assert.equal(boxes.get("obj-2").parameter_mappable, 1);
  assert.equal(boxes.get("obj-2").saved_attribute_attributes.valueof.parameter_invisible, 0);
});

test("parent device still references child patchers and restore trigger pieces", () => {
  const patch = readAmxdJson("bank-program-changer_dev.amxd");
  const boxes = getBoxesById(patch);

  assert.equal(boxes.get("obj-164").text, "loadbang");
  assert.equal(boxes.get("obj-61").text, "live.thisdevice");
  assert.equal(boxes.get("obj-parent-restore-send").text, "s ---parent-restore-trigger");
  assert.equal(boxes.get("obj-ui").name, "ui_ju06a.maxpat");
  assert.equal(boxes.get("obj-logic").name, "logic_ju06a.maxpat");
  assert.ok(hasLine(patch, "obj-61", "obj-parent-restore-send"));
});
