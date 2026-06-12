# NEXUS — Immersive Sci-Fi Web Experience

没入型SFウェブサイト。ホログラフィックUI、シネマティックなパーティクル、抽象3D環境、実験的インタラクションで「次世代デジタル宇宙」を表現する。

## Tech Stack

- **Vite** (dev server / build) — vanilla ES modules、フレームワークなし
- **Three.js** (WebGL) — postprocessing は `three/addons/` (jsm) のみ使用
- 追加ライブラリ禁止。シェーダーは GLSL を JS テンプレートリテラルで記述

## Commands

- `npm run dev` — 開発サーバー (port 5173)
- `npm run build` — 本番ビルド (`dist/`)
- `npm run preview` — ビルド確認

## Art Direction

- ダークシネマティック: 背景はほぼ黒 (#030308 付近)、ネオングラデーション (cyan #4cf2ff / magenta #ff4cd8 / violet #8b5cff)
- グラスモーフィズム: `backdrop-filter: blur` + 1px の発光ボーダー + 内側グロー
- 動きは常に滑らか (lerp / damp)。瞬間移動禁止。カメラはドリーやオービットで映画的に
- 60fps 目標。パーティクルは GPU (BufferGeometry + custom ShaderMaterial)

## Architecture & Module Contracts

```
index.html            セクション構造 (hero / modules / network / contact)
src/main.js           ブートストラップ。全モジュールを配線 (Operator 所有)
src/styles/tokens.css デザイントークン (CSS custom properties)
src/styles/base.css   リセット + レイアウト基盤
src/styles/ui.css     グラスカード / HUD
src/styles/interactions.css  カーソル / ホバー演出
src/core/SceneManager.js     renderer/scene/camera/loop
src/fx/Particles.js          GPU パーティクルフィールド
src/fx/Environment.js        抽象3Dオブジェクト群
src/fx/PostFX.js             bloom 等ポストプロセス
src/motion/CameraDirector.js スクロール連動カメラワーク
src/ui/interactions.js       実験的UIインタラクション
src/content/copy.js          サイト文言データ
```

**契約 (全エージェント厳守):**

1. `SceneManager` は `{ scene, camera, renderer, register(obj), start() }` を公開。
   `register()` に渡すオブジェクトは `update(dt, elapsed)` を実装する。
2. 視覚モジュール (Particles / Environment) は `class X { constructor(sceneManager); update(dt, t) }` 形式。
   コンストラクタ内で自分のメッシュを `sceneManager.scene` に add し、自分で `register` はしない (main.js が行う)。
3. `PostFX` は `new PostFX(sceneManager)` で composer を構築し `render(dt)` を公開。
   存在する場合 SceneManager は `renderer.render` の代わりに `postfx.render(dt)` を呼ぶ。
4. `CameraDirector` は `new CameraDirector(sceneManager)` で生成し `update(dt, t)` を持つ。
   camera の位置/注視点を所有するのは CameraDirector のみ。他モジュールは触らない。
5. CSS はトークン (`var(--*)`) のみ参照。生の色コードを ui.css / interactions.css に書かない。
6. 各エージェントは自分の所有ファイル以外を編集しない。

## Agent Roster (10 subagents, operated by Claude)

| # | Agent | 所有ファイル | 役割 |
|---|-------|------------|------|
| 1 | **Design System** | styles/tokens.css, styles/base.css | ネオン×ダークのトークン体系、タイポグラフィ、レイアウト基盤 |
| 2 | **Scene Core** | core/SceneManager.js | WebGL 基盤。renderer/camera/loop/resize/register API |
| 3 | **Particle FX** | fx/Particles.js | 数万点の GPU パーティクル。流体的ドリフト、グロー、マウス反応 |
| 4 | **Environment** | fx/Environment.js | 浮遊する抽象3D構造体 (wireframe 多面体、リング、グリッド面) |
| 5 | **PostFX** | fx/PostFX.js | UnrealBloom 中心のシネマティック後処理 |
| 6 | **Camera Director** | motion/CameraDirector.js | スクロール連動のカメラドリー、damp によるカメラワーク |
| 7 | **Holo UI** | styles/ui.css, index.html の section 内マークアップ | グラスモーフィズムカード、HUD 装飾、layered depth |
| 8 | **Interaction Lab** | src/ui/interactions.js, styles/interactions.css | カスタムカーソル、磁性ホバー、3D tilt、出現アニメーション |
| 9 | **Narrative** | src/content/copy.js | 世界観のあるサイト文言 (英語、SF トーン) |
| 10 | **QA / Integration** | (read + report) | ビルド検証、console エラー、契約違反チェック、修正提案 |

Operator (main session) が main.js と統合・最終調整を所有する。

## Session Handoff — 現在の状態 (2026-06-11, QA ループ完了 → リリース可能)

**全工程完了。** Wave 1〜3 + Agent 10 監査 → 全指摘修正 → headless Chrome 実機検証 → `npm run build` 成功。console はエラー・警告ゼロ。

**QA 監査 (BLOCKER 1 / WARN 3 / NIT 6) — 全て修正済み:**

- **[B]** `[data-reveal]` の transition (+残留 inline transitionDelay) が tilt の毎フレーム transform 書き込みを捕捉し 3D tilt が凍結 → reveal 完了時 (transitionend + 2400ms フォールバック) に属性と inline delay を解放 (interactions.js)。glass-card の hover transition 上書き (WARN) も同時解消
- **[W]** WebGL 不能環境で initInteractions 未到達 → 全文 opacity:0 の白紙 → main.js で initInteractions() を GL 構築の前へ + GL 部分を try/catch
- **[W]** hero→modules ドリーがコア icosahedron (r1.55/2.2) を貫通 → Environment.update がカメラ距離 smoothstep(2.6, 4.4) で hero コアを dissolve (camera は read のみ、契約 4 維持)
- **[N]** grain/vignette overlay が cursor と同 z → `--z-grain: 90` 新設 / DPR 変化追従 (onResize で setPixelRatio、PostFX.resize で composer 同期、Particles は毎フレーム uPixelRatio 更新) / bloomPass.resolution.set は no-op のため削除 / uTime は % 100 で wrap / index.html の「CameraDirector が data-scene を読む」誤コメント修正 / copy.js は手動ミラー (runtime 消費なし) と明記

**ブラウザ検証で発覚し修正した追加バグ (コード監査では不可視):**

- **パーティクル白飛び**: sizeScale 320 ではモートが 20〜100px超になり、36K 加算スプライト×bloom で画面全体が白に。field 36 / ember 100、opacity 0.6 / 0.15 へ再調整。教訓: **加算パーティクルはモート数 px が上限。輝度系の変更は必ずスクリーンショットで確認**
- THREE.Clock は three 0.184 で deprecated → `THREE.Timer` (update → getDelta/getElapsed) へ移行
- favicon 404 → data-URI SVG (ネオンリング) を index.html に追加

**検証済み挙動** (headless Chrome、スクリーンショット /tmp/nexus-verify/*.png): 4 セクションで別構図のカメラドリー / hover tilt (rotateX·rotateY 実測) / reveal 後の属性解放 / console クリーン / scrollH = 4×100vh。

**起動:** `npm run dev` → http://localhost:5173 / `npm run build` (チャンクサイズ警告は three 起因で対応不要)
