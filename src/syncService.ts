/**
 * @file syncService.ts
 * @description このファイルは、ローカルマシンの設定ファイル（settings.json 等）、インストール済みの拡張機能一覧、
 *              および Antigravity データ (~/.gemini/antigravity) のパスを解決し、
 *              それらを GitHub との間でアップロード/ダウンロード（同期）するコアロジック (SyncService) を定義します。
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitHubService } from './githubService';

/**
 * 同期処理を実行するサービス。
 */
export class SyncService {
    private githubService: GitHubService;

    /**
     * SyncService を初期化します。
     * @param githubService API操作を行う GitHubService インスタンス
     */
    constructor(githubService: GitHubService) {
        this.githubService = githubService;
    }

    /**
     * 動作しているOS（Windows/macOS/Linux）に応じて、VS Code の User 設定ディレクトリの絶対パスを解決します。
     */
    private getUserConfigPath(): string {
        const home = os.homedir(); // ユーザーホームディレクトリを取得 (例: /Users/ibis)
        switch (process.platform) {
            case 'win32':
                // Windows: %APPDATA%\Code\User\
                return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User');
            case 'darwin':
                // macOS: ~/Library/Application Support/Code/User/
                return path.join(home, 'Library', 'Application Support', 'Code', 'User');
            default:
                // Linux: ~/.config/Code/User/
                return path.join(home, '.config', 'Code', 'User');
        }
    }

    /**
     * Antigravity のデータフォルダの絶対パスを取得します。
     * デフォルトはホームディレクトリ配下の `.gemini/antigravity` です。
     */
    private getAntigravityDataPath(): string {
        return path.join(os.homedir(), '.gemini', 'antigravity');
    }

    /**
     * ローカルの設定やデータを GitHub のプライベートリポジトリへアップロードします。
     */
    async upload(): Promise<void> {
        // 同期先のリポジトリが存在することを確認 (なければ作成)
        await this.githubService.ensureRepositoryExists();

        const userConfigDir = this.getUserConfigPath();

        // 1. VS Code settings.json のアップロード
        const settingsPath = path.join(userConfigDir, 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = fs.readFileSync(settingsPath, 'utf-8');
            await this.githubService.uploadFile('settings.json', settings, 'Sync: Update settings.json');
        }

        // 2. VS Code keybindings.json (キーバインド設定) のアップロード
        const keybindingsPath = path.join(userConfigDir, 'keybindings.json');
        if (fs.existsSync(keybindingsPath)) {
            const keybindings = fs.readFileSync(keybindingsPath, 'utf-8');
            await this.githubService.uploadFile('keybindings.json', keybindings, 'Sync: Update keybindings.json');
        }

        // 3. インストール済み拡張機能リストのアップロード
        // VS Code 内蔵拡張機能を除外した、ユーザーがインストールした拡張機能のID一覧を収集します
        const extensions = vscode.extensions.all
            .filter(ext => !ext.packageJSON.isBuiltin)
            .map(ext => ext.id);
        await this.githubService.uploadFile(
            'extensions.json', 
            JSON.stringify(extensions, null, 2), 
            'Sync: Update extensions list'
        );

        // 4. Antigravity Data フォルダ (~/.gemini/antigravity) のアップロード
        const agPath = this.getAntigravityDataPath();
        if (fs.existsSync(agPath)) {
            // ディレクトリ構造を再帰的に走査してアップロード
            await this.uploadDirectory(agPath, 'antigravity-data');
        }
    }

    /**
     * ローカルディレクトリを再帰的に走査し、各ファイルを GitHub リポジトリにアップロードします。
     * @param localDir アップロード対象のローカルディレクトリパス
     * @param remoteDir GitHubリポジトリ内での保存先フォルダパス
     */
    private async uploadDirectory(localDir: string, remoteDir: string): Promise<void> {
        if (!fs.existsSync(localDir)) {
            return;
        }

        // ディレクトリ配下のファイル・フォルダ一覧を取得
        const entries = fs.readdirSync(localDir, { withFileTypes: true });
        for (const entry of entries) {
            const localPath = path.join(localDir, entry.name);
            const remotePath = `${remoteDir}/${entry.name}`;

            if (entry.isDirectory()) {
                // node_modules や .git などの不要な特殊フォルダは同期から除外します
                if (entry.name !== 'node_modules' && entry.name !== '.git') {
                    await this.uploadDirectory(localPath, remotePath);
                }
            } else if (entry.isFile()) {
                const stat = fs.statSync(localPath);
                // GitHub API の制限やパフォーマンス低下を防ぐため、1ファイル 1MB 未満のものに限定します
                if (stat.size < 1024 * 1024) {
                    const content = fs.readFileSync(localPath, 'utf-8');
                    await this.githubService.uploadFile(remotePath, content, `Sync: Update ${entry.name}`);
                }
            }
        }
    }

    /**
     * GitHub から設定や拡張機能のリストをダウンロードし、ローカル環境へ反映（上書き）します。
     */
    async download(): Promise<void> {
        // ユーザーにローカル設定が上書きされる警告ダイアログを表示
        const confirm = await vscode.window.showWarningMessage(
            'This will overwrite your local settings. Do you want to proceed?',
            'Yes',
            'No'
        );
        if (confirm !== 'Yes') {
            return; // キャンセルされた場合は処理を中断
        }

        const userConfigDir = this.getUserConfigPath();
        // 設定フォルダが存在しない場合は作成します
        if (!fs.existsSync(userConfigDir)) {
            fs.mkdirSync(userConfigDir, { recursive: true });
        }

        // 1. VS Code settings.json のダウンロードと適用
        const settings = await this.githubService.downloadFile('settings.json');
        if (settings) {
            fs.writeFileSync(path.join(userConfigDir, 'settings.json'), settings, 'utf-8');
        }

        // 2. VS Code keybindings.json のダウンロードと適用
        const keybindings = await this.githubService.downloadFile('keybindings.json');
        if (keybindings) {
            fs.writeFileSync(path.join(userConfigDir, 'keybindings.json'), keybindings, 'utf-8');
        }

        // 3. 拡張機能一覧のダウンロードと一括インストール
        const extensionsJson = await this.githubService.downloadFile('extensions.json');
        if (extensionsJson) {
            try {
                const extensionIds: string[] = JSON.parse(extensionsJson);
                // ローカルに不足している拡張機能のみを自動インストール
                await this.installMissingExtensions(extensionIds);
            } catch (e) {
                vscode.window.showErrorMessage(`Failed to parse extensions list: ${e}`);
            }
        }

        // 4. Antigravity Data (チャット履歴・設定など)
        // ※ 雛形のため、このダウンロード処理は枠組みの提示のみとしています。
        // ※ 実際のフル実装では、GitHub の Contents API を使ってリポジトリ内を一覧取得し、
        //    再帰的にローカルに書き下す処理を追加します。
        vscode.window.showInformationMessage('Antigravity data download is initialized.');
    }

    /**
     * 引数で受け取った拡張機能IDの配列から、現在ローカルにインストールされていないものを自動インストールします。
     */
    private async installMissingExtensions(extensionIds: string[]): Promise<void> {
        // 現在インストール済みの拡張機能IDをすべて小文字に統一して取得
        const installedIds = vscode.extensions.all.map(ext => ext.id.toLowerCase());
        
        for (const extId of extensionIds) {
            // まだインストールされていない拡張機能があれば、VS Code 組み込みのコマンドを呼び出してインストールします
            if (!installedIds.includes(extId.toLowerCase())) {
                vscode.window.showInformationMessage(`Installing extension: ${extId}...`);
                // VS Code の内蔵コマンド 'workbench.extensions.installExtension' を使用
                await vscode.commands.executeCommand('workbench.extensions.installExtension', extId);
            }
        }
    }
}
