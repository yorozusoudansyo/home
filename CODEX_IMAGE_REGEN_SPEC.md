# feature画像 再生成仕様書（Codex / ImageGen2 用）

**作成：2026-07-13（Fable）／ 実行：Codex (ImageGen2)**
**対象：** `assets/feature-01.png` `feature-02.png` `feature-solving.png` `feature-04.png` `feature-05.png` `feature-06.png` `feature-07.png`

---

## 方針（現行Gemini画像からの改善点）

現行画像の問題：
1. **文字が画像に焼き込まれている**（誤字修正・文言変更ができない。「philosophy.」等の英語混入も）
2. 情報過多のインフォグラフィック調で、LPの説明文と内容が重複
3. ティール／ブルー系の配色で、ブランド（白基調＋赤≤5%）から外れている

再生成の方針：
- **画像内テキストは一切入れない**（説明はHTML側にある。テキストなし＝生成失敗も激減する）
- 1カード1メタファーのシンプルなフラットイラスト
- ブランドパレット厳守

## 共通スタイルブロック（全プロンプトの末尾に付ける）

```
Style: clean modern flat vector illustration, thin refined line work,
generous white space, minimal composition with one clear metaphor.
Color palette: off-white background #F9FAFB, dark slate ink #1F2937,
mid gray #4B5563, light gray #E5E7EB. Single red accent #D32F2F used
sparingly (under 5% of the image area) to highlight the key element.
Absolutely NO text, NO letters, NO numbers, NO logos anywhere in the image.
Landscape orientation, wide format. Consistent illustration style across a set.
```

- 生成サイズ：横長（1536×1024 など）で生成 → **中央基準で 1024×559（比率 1.832:1）にクロップ**して保存
- ファイル名は現行と同名で `assets/` に上書き（HTML変更不要。キャッシュ対策で `?v=` 付与は別途）

## 各画像プロンプト

### feature-01.png — 25年のAE経験による、伴走型サポート
```
Two people sitting side by side at one desk looking at the same laptop
screen together. The mentor figure gently gestures toward the screen,
the learner leans in with confidence. Warm, calm, collaborative mood.
The laptop screen glows softly; a small red cursor arrow on the screen
is the only red accent.
```

### feature-02.png — 業務プロセスを、そのまま翻訳
```
A horizontal workflow of connected rounded blocks. One block in the
middle is lifted out and being replaced by a smaller, glowing compact
block (the AI step), red accent on the replaced block only. A hand
places the new block like a puzzle piece. Metaphor: translating an
existing process, swapping one slow step for a faster one.
```

### feature-solving.png — "わからない"を、共に切り分ける
```
A tangled ball of thread on the left being gently pulled and untangled
into one straight clear line toward the right, guided by two hands from
opposite sides working together. A small red knot midway marks the
"found problem" point — the only red accent.
```

### feature-04.png — プログラミング素養で、一歩先へ
```
A chat bubble on the left connected by an elegant curved pipeline to a
set of small interlocking gears and nodes on the right, suggesting an
API connection turning conversation into automation. One small red gear
at the center of the mechanism is the only red accent.
```

### feature-05.png — 厳重な秘匿、匿名化の徹底
```
A document sheet with a few lines of abstract (non-text) redacted bars,
protected behind a large calm shield with a keyhole. A soft red keyhole
glow is the only red accent. Mood: safe, quiet, trustworthy — not scary.
```

### feature-06.png — 10分の作業を、1分に。
```
Two clock faces: a large pale one on the left, and a small bright one
on the right, connected by a single arrow that shrinks as it moves
right. Under the large clock, a tall messy stack of paper; under the
small clock, one neat single sheet. The small clock's hand is red —
the only red accent.
```

### feature-07.png — ひとつのチャットから、始められる。
```
A smartphone standing upright with one single chat bubble rising from
it. From the bubble, a gentle dotted path of stepping stones leads
upward and to the right, growing slightly larger with each step.
The first stepping stone is red — the only red accent.
```

## 実行手順（Codex側）

1. 各プロンプト＝「本文＋共通スタイルブロック」を連結して ImageGen2 に投入
2. 7枚を同一セッションで連続生成するとスタイルが揃いやすい
3. 生成後チェック：文字が入っていないか／赤の面積が過剰でないか／構図の水平
4. 1024×559 にクロップして `assets/` へ同名保存
5. index.html の `<img src>` に `?v=4` などを付けてキャッシュを飛ばす（デプロイ時にまとめて）
