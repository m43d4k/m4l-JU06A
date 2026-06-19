# JU-06A Program Changer

Roland JU-06Aの64パッチを選択するMax for Live MIDI Effect。

## Current Scope

- Bank: B1–B8
- Current: 1–8
- Global: 1–64
- Program Change: 0–63
- Previous / Next、SEND
- Delay: 0 / 5 / 10 ms
- MIDI thru

Bank Select CCは送信しない。BankとCurrentは表示上の区分であり、MIDIではGlobalに対応する連続したProgram Change番号を送る。

## Files

- `bank-program-changer_dev.amxd`: 親デバイス
- `ui_ju06a.maxpat`: visible UI
- `logic_ju06a.maxpat`: routing、controller、MIDI I/O
- `bank_pc_controller_ju06a.js`: 状態変換とMIDI生成
- `bank_pc_controller.test.js`: controllerテスト
- `patch_structure.test.js`: Maxパッチ構造テスト

## Test

リポジトリルートから実行:

```sh
mise exec -- node --test devices/bank-program-changer/bank_pc_controller.test.js devices/bank-program-changer/patch_structure.test.js
```

自動テストはJSとJSON構造のみを対象とする。Max / Live / JU-06Aの確認は手動で行う。
