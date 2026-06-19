# JU-06A Test Plan

## 自動テスト

- Global 1 → Bank 1 / Current 1 / PC 0
- Global 8 → Bank 1 / Current 8 / PC 7
- Global 9 → Bank 2 / Current 1 / PC 8
- Global 64 → Bank 8 / Current 8 / PC 63
- Bank変更でCurrentを維持
- Current変更でBankを維持
- Bank / Current入力を1–8相当へ制限
- Global入力を1–64へ制限
- `64 + inc -> 1`、`1 + dec -> 64`
- MIDI出力にCC#0 / CC#32を含めない
- Delay 0 / 5 / 10 msの正規化と保留送信置換
- UIのB1–B8、Current 1–8、Global 1–64を構造テストで確認

実行コマンド:

```sh
mise exec -- node --test devices/bank-program-changer/bank_pc_controller.test.js devices/bank-program-changer/patch_structure.test.js
```

## Max / Live確認

- `[v8]`がcontroller JSを読み込む
- UIとlogicの`bpatcher`が読み込まれる
- Global、Bank、Currentが相互同期する
- MIDIスルーが維持される
- Live Set再読込後にGlobalとDelayが復元される

## JU-06A実機確認

- Program Change 0–63で全64パッチを選択できる
- Bank / Current表示と実機の位置が一致する
- Bank Select CCなしで切り替わる
- Previous / NextとSENDが動作する
- Delay 0 / 5 / 10 msが動作する

2026-06-19: ユーザーによる動作確認済み。
