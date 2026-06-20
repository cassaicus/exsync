/**
 * @file extension.ts
 * @description このファイルは、VS Code 拡張機能のエントリーポイントです。
 *              拡張機能のロード時に起動する `activate` 関数と、アンロード時の `deactivate` 関数を含みます。
 *              また、コマンドパレットから実行可能な同期コマンドの登録や、
 *              VS Code 設定の変更を監視して自動アップロードを誘発するイベントリスナーの設定を行います。
 */

import * as vscode from 'vscode';
import { AuthService } from './auth';
import { GitHubService } from './githubService';
import { SyncService } from './syncService';

// グローバルで使い回す認証サービスインスタンス
let authService: AuthService;

/**
 * 拡張機能がアクティベート（有効化）されたときに実行される関数。
 * `package.json` の `activationEvents` (今回は "onStartupFinished") に基づいて呼び出されます。
 * @param context VS Code が提供する拡張機能のコンテキスト情報。リソースや購読 (subscriptions) を保持します。
 */
export async function activate(context: vscode.ExtensionContext) {
    // 開発中のログ出力。デバッグコンソール等に表示されます
    console.log('Antigravity Sync is now active!');

    // 認証サービスのインスタンス化と初期化
    authService = new AuthService();
    await authService.initialize();

    // 拡張機能専用の出力チャネル（ログ画面）を作成し、ユーザーに見える進捗ログを出力できるようにします
    const outputChannel = vscode.window.createOutputChannel('Antigravity Sync');
    context.subscriptions.push(outputChannel); // 拡張機能終了時にチャネルを自動破棄するよう登録

    /**
     * 実行に必要な認証状態をチェックし、有効な SyncService インスタンスを返す内部ヘルパー関数。
     * @param forceLogin true の場合、ログインしていなければログイン画面を開きます。
     */
    const getSyncService = async (forceLogin: boolean = true): Promise<SyncService | null> => {
        // トークンを取得
        const token = await authService.getToken(forceLogin);
        if (!token) {
            if (forceLogin) {
                vscode.window.showErrorMessage('GitHub authentication required for Antigravity Sync.');
            }
            return null;
        }

        // package.json で定義したユーザー設定 (configuration) から同期先リポジトリ名を取得
        const config = vscode.workspace.getConfiguration('antigravitySync');
        const repoName = config.get<string>('repoName') || 'antigravity-sync-data';

        // 取得した認証トークンとリポジトリ名でサービスを初期化して返します
        const githubService = new GitHubService(token, repoName);
        return new SyncService(githubService);
    };

    /**
     * コマンド 1: Upload Command (設定を GitHub へアップロード)
     */
    const uploadCmd = vscode.commands.registerCommand('antigravity-sync.upload', async () => {
        outputChannel.appendLine('Upload started...');
        try {
            // 同期サービスを取得 (ログインしていなければプロンプトを出す)
            const syncService = await getSyncService(true);
            if (syncService) {
                // VS Code の通知エリアに進捗インジケータ（プログレスバー）を表示します
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Antigravity Sync: Uploading...",
                    cancellable: false
                }, async () => {
                    // 同期処理の実行
                    await syncService.upload();
                });
                vscode.window.showInformationMessage('Settings uploaded successfully.');
                outputChannel.appendLine('Upload completed successfully.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Upload failed: ${error}`);
            outputChannel.appendLine(`Upload error: ${error}`);
        }
    });

    /**
     * コマンド 2: Download Command (設定を GitHub からローカルへ反映)
     */
    const downloadCmd = vscode.commands.registerCommand('antigravity-sync.download', async () => {
        outputChannel.appendLine('Download started...');
        try {
            const syncService = await getSyncService(true);
            if (syncService) {
                // 進捗インジケータ付きでダウンロードと適用を実行
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Antigravity Sync: Downloading...",
                    cancellable: false
                }, async () => {
                    await syncService.download();
                });
                vscode.window.showInformationMessage('Settings downloaded and applied.');
                outputChannel.appendLine('Download completed successfully.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Download failed: ${error}`);
            outputChannel.appendLine(`Download error: ${error}`);
        }
    });

    /**
     * コマンド 3: Sync Command (双方向同期 / 一括実行)
     */
    const syncCmd = vscode.commands.registerCommand('antigravity-sync.sync', async () => {
        outputChannel.appendLine('Sync process triggered...');
        try {
            const syncService = await getSyncService(true);
            if (syncService) {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Antigravity Sync: Synchronizing...",
                    cancellable: false
                }, async () => {
                    outputChannel.appendLine('Auto uploading before sync...');
                    await syncService.upload();
                    outputChannel.appendLine('Auto downloading...');
                    await syncService.download();
                });
                vscode.window.showInformationMessage('Sync completed successfully.');
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Sync failed: ${error}`);
            outputChannel.appendLine(`Sync error: ${error}`);
        }
    });

    // 登録したコマンドを subscriptions に追加して、拡張機能終了時にメモリ解放されるようにします
    context.subscriptions.push(uploadCmd, downloadCmd, syncCmd);

    /**
     * 自動同期 (Auto Sync) イベントの登録
     * VS Code 内で設定 (configuration) が変更されたことを検知するリスナー。
     */
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            const config = vscode.workspace.getConfiguration('antigravitySync');
            const autoSync = config.get<boolean>('autoSync');

            // 自動同期が有効で、かつ「この拡張機能自体の設定変更」以外の設定が変更された場合にアップロードを実行します。
            // (これをしないと無限ループや不要なアップロードが多く発生してしまいます)
            if (autoSync && !e.affectsConfiguration('antigravitySync')) {
                outputChannel.appendLine('Configuration changed. Attempting auto-upload...');
                try {
                    // 自動同期はバックグラウンドで行うため、未ログイン時にポップアップを出さないよう forceLogin: false にします
                    const syncService = await getSyncService(false);
                    if (syncService) {
                        await syncService.upload();
                        outputChannel.appendLine('Auto-upload completed.');
                    } else {
                        outputChannel.appendLine('Auto-upload skipped: User is not authenticated.');
                    }
                } catch (err) {
                    outputChannel.appendLine(`Auto-upload failed: ${err}`);
                }
            }
        })
    );
}

/**
 * 拡張機能が非アクティブ（無効化）されたときに実行される後処理関数。
 */
export function deactivate() {}
