# JU-06A Device Specification

> **Status:** 実装済み。2026-06-19に実機動作確認済み。

## 目的

Roland JU-06Aの現在のサウンド・モード内にある64パッチをAbleton Liveから選択する。
60 / 106サウンド・モードの切り替えはJU-06A本体で行う。

## 選択範囲

- Bank表示: B1–B8
- Current表示: 1–8
- Global表示: 1–64
- MIDI Program Change: 0–63

`globalProgram`を唯一の選択状態として保持する。

```js
programIndex = globalProgram - 1
bankIndex = Math.floor(programIndex / 8) // 0–7
bankDisplay = bankIndex + 1             // 1–8
current = (programIndex % 8) + 1         // 1–8
programChange = programIndex             // 0–63
```

Bank / CurrentからGlobalへの変換:

```js
globalProgram = bankIndex * 8 + current
```

## UI動作

- Bank変更: Currentを維持して送信
- Current変更: Bankを維持して送信
- Global変更: BankとCurrentを再計算して送信
- Previous / Next: Globalを1ずつ変更して送信
- `64 -> Next`: 1へループ
- `1 -> Previous`: 64へループ
- SEND: 現在のProgram Changeを再送
- Delay: 0 / 5 / 10 ms

UIは1始まり、Bankの`live.tab`出力とMIDI Program Changeは0始まり。

## MIDI出力

JU-06Aの64パッチは連続したProgram Change番号として扱う。
Bank Select CC#0 / CC#32は送信しない。

```text
status = 0xC0
data1 = globalProgram - 1
```

代表例:

| Bank | Current | Global | Program Change |
|---:|---:|---:|---:|
| 1 | 1 | 1 | 0 |
| 1 | 8 | 8 | 7 |
| 2 | 1 | 9 | 8 |
| 8 | 8 | 64 | 63 |

Delayが5 msまたは10 msの場合、Program Changeを指定時間後に送る。
保留中に新しい選択またはSENDが来た場合は、最新のProgram Changeだけを送る。

## MIDIスルー

`[midiin] -> [midiout]`を維持し、入力MIDIをそのまま通す。

## 保存と復元

- `Global`と`Delay`はLiveパラメーターとして保存
- 復元時はUI値をcontrollerへ再送して同期
- 復元値に変更がある場合は復元処理の最後に1回送信

## 対応しない機能

- 60 / 106サウンド・モード切り替え
- Bank Select MSB / LSB
- MIDIチャンネル選択
- パラメーター編集用CC
- シーケンサー・パターン選択
