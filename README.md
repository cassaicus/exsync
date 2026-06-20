# Antigravity Sync

VS Code (Antigravity IDE) の設定、拡張機能一覧、チャット履歴などのデータを GitHub のプライベートリポジトリと同期するための拡張機能です。

## 主な機能

- **🔄 同期対象データ**:
  - 設定ファイル (`settings.json`)
  - キーバインド設定 (`keybindings.json`)
  - インストール済み拡張機能の一覧 (`extensions.json`)
  - Antigravity IDEの履歴および設定フォルダ (`~/.gemini/antigravity`)
- **🔒 セキュアな保存**:
  - サードパーティのサーバーを介さず、ユーザー自身の GitHub アカウント上にプライベートリポジトリ (`antigravity-sync-data`) を作成して同期します。
- **⚡ 自動同期**:
  - 設定変更時に自動でアップロードを行います。

## 開始方法

1. **認証設定**:
   - コマンドパレット (`Cmd+Shift+P` / `Ctrl+Shift+P`) を開き、`Antigravity Sync: Upload Settings` または `Antigravity Sync: Download Settings` を選択します。
   - 初回実行時に GitHub アカウントへのサインインを求めるプロンプトが表示されるので、認証を許可してください。

2. **設定項目**:
   - `antigravitySync.autoSync`: 有効化すると、設定の変更を検知して自動で GitHub に変更をアップロードします。
   - `antigravitySync.repoName`: 保存先の GitHub リポジトリ名を設定します (デフォルト: `antigravity-sync-data`)。

## 開発とテスト

1. このプロジェクトの依存関係をインストールします。
   ```bash
   npm install
   ```
2. コードのコンパイルを行います。
   ```bash
   npm run compile
   ```
3. `F5` キーを押して `Extension Development Host` を立ち上げ、デバッグテストを行います。
