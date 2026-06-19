# JU-06A Implementation Specification

現行実装の詳細仕様。製品仕様は[`../../docs/JU-06A_SPEC.md`](../../docs/JU-06A_SPEC.md)を参照。

## State

```text
globalProgram: 1..64
delay: 0|5|10
```

`globalProgram`だけを音色選択のsource of truthとする。

```js
bankIndex = Math.floor((globalProgram - 1) / 8)
pcDisplay = ((globalProgram - 1) % 8) + 1
pcSendValue = globalProgram - 1
```

## Controller actions

```text
global 1..64
bankindex 0..7
pc 1..8
inc
dec
send
delay 0|5|10
restorebegin
restoreend
```

`bankindex`は現在の`pcDisplay`を維持する。
送信対象actionはUI同期後にProgram Changeを送る。

## UI sync

```text
set_bankindex 0..7
set_pc 1..8
set_global 1..64
set_delay 0|5|10
```

feedback loopを防ぐため、logicからUIへの同期は`set_*`を使う。

## MIDI

- Program Change: `[192, globalProgram - 1]`
- Bank Select CC#0 / CC#32: 送信しない
- Delay 0: 即時送信
- Delay 5 / 10: Program Changeを遅延送信
- 新しい送信は保留中の遅延送信を置換
- `[midiin] -> [midiout]`でMIDIスルー

## UI

- Bank `live.tab`: B1–B8、出力0–7
- Current number: 1–8
- Global `live.numbox`: 1–64
- Delay `live.menu`: 0 / 5 / 10 ms
- Previous / Next / SEND

## Restore

親の`live.thisdevice`からrestore triggerを送り、子UIがGlobalとDelayをcontrollerへ再送する。restore window中の変更はまとめ、終了時に最大1回送信する。
