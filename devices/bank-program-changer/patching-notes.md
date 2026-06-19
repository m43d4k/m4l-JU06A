# Patching Notes

## Structure

- `bank-program-changer_dev.amxd`: parent shellとrestore trigger
- `ui_ju06a.maxpat`: visible `live.*` UI
- `logic_ju06a.maxpat`: action routing、`[v8]`、MIDI I/O、UI sync

## Action buses

```text
---ui-bankindex-action -> prepend bankindex
---ui-pc-action        -> prepend pc
---ui-global-action    -> prepend global
---ui-delay-action     -> prepend delay
---ui-inc-action       -> inc
---ui-dec-action       -> dec
---ui-send-action      -> send
---ui-restore-action   -> restorebegin|restoreend
```

## UI sync

Controller outlet 1は次をrouteする。

```text
set_bankindex -> ---ui-bankindex
set_pc        -> ---ui-pc
set_global    -> ---ui-global
set_delay     -> ---ui-delay
```

UI側は`prepend set`を使い、同期値をaction busへ戻さない。

## Ranges

- Bank `live.tab`: B1–B8、出力0–7
- Current: 1–8
- Global: 1–64
- Delay menu index 0 / 1 / 2: 0 / 5 / 10 ms

## MIDI

Controller outlet 0から`[midiout]`へProgram Change `[192, 0..63]`を送る。Bank Select CCは送らない。`[midiin]`は同じ`[midiout]`へ直結してMIDI thruを維持する。

## Restore

1. 親の`live.thisdevice`が`---parent-restore-trigger`を送る。
2. UIが`restorebegin`を送る。
3. 保存済みGlobalとDelayを`outputvalue`で再送する。
4. UIが`restoreend`を送る。
5. 変更があればcontrollerが最新Program Changeを1回送る。

## Delay

Delay 0ではProgram Changeを即時送信する。5 / 10ではProgram Changeだけを遅延送信し、新しい操作が来た場合は保留中の送信を最新値で置換する。
