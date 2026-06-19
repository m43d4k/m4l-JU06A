# AGENTS.md

## Goal

Build and maintain a Max for Live MIDI Effect device that sends Program Change to a JU-06A.

## Active Scope

The active device supports:

- `globalProgram` as the only program-selection source of truth
- Bank 1 to 8
- Current patch 1 to 8
- Global 1 to 64
- Delay 0 / 5 / 10 ms
- MIDI thru with `[midiin] -> [midiout]`

The active device does not support:

- Auto Send toggle
- MIDI Channel parameter
- Send MSB
- MSB Value

## Implementation Rules

- Use Max `[v8]` for controller logic
- Keep the parent shell in `bank-program-changer_dev.amxd`
- Keep visible UI in `ui_ju06a.maxpat` via `[bpatcher]`
- Keep non-UI Max wiring in `logic_ju06a.maxpat` via `[bpatcher]`
- Do not reintroduce a separately managed parent `maxpat`
- Keep `ui_ju06a.maxpat` focused on visible controls; visible `live.*` controls in the child may own their own restore state
- Keep `logic_ju06a.maxpat` focused on routing, controller hosting, MIDI I/O, and UI sync
- Generate MIDI bytes explicitly in JavaScript
- Use `[midiout]` for output
- Do not use `[ctlout]` or `[pgmout]`
- Use distinct `---ui-*-action` buses for child UI -> logic actions
- Use distinct `---ui-*` buses for logic -> child UI sync
- Avoid UI feedback loops with `set_*` UI sync messages
- Bank changes must preserve the Current patch and send MIDI
- Program edits update state and send through the controller
- Global edits update state and send through the controller
- Increase and Decrease must always loop and always send
- Do not claim Max / Live / hardware tests passed unless they were actually performed there

## MIDI Order

The active device sends:

```text
Program Change
```

With delay enabled, Program Change is delayed.

## Test Expectations

Codex can only run JS-level tests.

Automated coverage should include:

- Global conversion at representative boundaries
- Bank boundary increment and decrement
- Looping from 64 to 1 and 1 to 64
- MIDI byte generation
- Delay value normalization
- Pending delayed Program Change replacement
- Delay-edit replacement of a pending delayed Program Change using the latest delay
- Pending delayed Program Change cancellation on `notifydeleted()`
- Patch-structure checks for `ui_ju06a.maxpat` / `logic_ju06a.maxpat` / parent restore trigger wiring

Manual verification should include:

- `[v8]` loads `bank_pc_controller_ju06a.js` in Max
- `[bpatcher]` loads `ui_ju06a.maxpat`
- `[bpatcher]` loads `logic_ju06a.maxpat`
- visible bank `live.tab` produces `bankindex 0..7`
- outlet 0 reaches `[midiout]`
- outlet 1 `set_*` updates do not cause feedback loops
- Program edits send the updated program immediately
- Global edits send the updated global program immediately
- bank selection preserves the Current patch and sends
- saved `globalProgram` and `delay` restore after reopening the Live set
- Program Change 0..63 works on the target hardware
- Program Change Delay 0 / 5 / 10 ms behaves as expected on hardware
