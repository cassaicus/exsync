/**
 * @file githubService.ts
 * @description このファイルは、GitHub API (v3) と直接通信し、同期用のプライベートリポジトリの有無確認、
 *              新規リポジトリの作成、およびファイルの作成・更新（コミット）・ダウンロードを行う
 *              GitHub API 操作サービス (GitHubService) を定義します。
 */

import * as vscode from 'vscode';

/**
 * GitHub API と連携してリポジトリやファイル操作を行うサービス。
 */
export class GitHubService {
    private token: string;      // 認証用の OAuth アクセストークン
    private repoName: string;   // 同期先となる GitHub リポジトリ名
    private owner: string | null = null; // GitHub アカウントのユーザー名

    /**
     * GitHubService インスタンスを初期化します。
     * @param token GitHub API 実行に使用するアクセストークン
     * @param repoName 同期に使用する GitHub リポジトリ名
     */
    constructor(token: string, repoName: string) {
        this.token = token;
        this.repoName = repoName;
    }

    /**
     * GitHub API への HTTP リクエストを送信する共通共通ヘルパーメソッド。
     * @param path APIエンドポイントのパス (例: '/user')
     * @param options Fetch API の追加オプション
     */
    private async request(path: string, options: RequestInit = {}): Promise<any> {
        const url = `https://api.github.com${path}`;
        
        // ヘッダーの設定。認証トークンの付与と GitHub API v3 形式の指定、および User-Agent を設定
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Antigravity-Sync-Extension',
            ...((options.headers as Record<string, string>) || {})
        };

        // 標準の fetch API を用いて GitHub サーバーへリクエストを送信
        const res = await fetch(url, { ...options, headers });
        
        // レスポンスステータスが正常 (200〜299) でない場合はエラーを投げます
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`GitHub API Error: ${res.status} ${res.statusText} - ${body}`);
        }

        // レスポンスボディがないステータスコード (204 No Content など) の場合は null を返します
        if (res.status === 204) {
            return null;
        }
        
        // レスポンスの JSON オブジェクトを解析して返します
        return res.json();
    }

    /**
     * 現在認証されている GitHub アカウントのユーザー名（ログインID）を取得します。
     * 1度取得した値はキャッシュ (this.owner) して再利用します。
     */
    async getUsername(): Promise<string> {
        if (this.owner) {
            return this.owner;
        }
        // 認証中ユーザーの情報を取得する API エンドポイント `/user` を呼び出し
        const user = await this.request('/user');
        this.owner = user.login;
        return this.owner!;
    }

    /**
     * 同期用のリポジトリが存在するか確認し、なければプライベートリポジトリを自動作成します。
     */
    async ensureRepositoryExists(): Promise<void> {
        const owner = await this.getUsername();
        try {
            // 指定リポジトリの情報を取得できるかテスト
            await this.request(`/repos/${owner}/${this.repoName}`);
        } catch (error) {
            // 取得に失敗した場合（404 Not Found など）、新規に作成
            vscode.window.showInformationMessage(`Creating private repository: ${this.repoName}...`);
            await this.request('/user/repos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                // プライベートリポジトリとして作成し、README 等の自動生成 (auto_init: true) を指示します
                body: JSON.stringify({
                    name: this.repoName,
                    private: true,
                    description: 'Antigravity Sync Data (automatic backup)',
                    auto_init: true
                })
            });
        }
    }

    /**
     * 指定されたパスにファイルをアップロード（作成または上書きコミット）します。
     * @param path リポジトリ内の保存先相対パス (例: 'settings.json')
     * @param content ファイルのテキストコンテンツ
     * @param message コミットメッセージ
     */
    async uploadFile(path: string, content: string, message: string = 'Sync updates'): Promise<void> {
        const owner = await this.getUsername();
        let sha: string | undefined;

        try {
            // GitHub 上で既存ファイルの情報を取得し、上書きに必要な最新コミットの 'sha' (ハッシュ値) を取得します
            const fileInfo = await this.request(`/repos/${owner}/${this.repoName}/contents/${path}`);
            sha = fileInfo.sha;
        } catch {
            // ファイルが存在しない場合は、sha なし（新規作成）として進行します
        }

        // GitHub API はバイナリや日本語文字化けを防ぐため、ファイルを Base64 形式で受け取ります
        const base64Content = Buffer.from(content, 'utf-8').toString('base64');
        
        // コンテンツを更新・作成する PUT API を呼び出します
        await this.request(`/repos/${owner}/${this.repoName}/contents/${path}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                content: base64Content,
                sha // 既存ファイルの上書きにはこの sha が必須になります
            })
        });
    }

    /**
     * 指定されたパスからファイルをダウンロードし、テキストとして返します。
     * @param path リポジトリ内のファイル相対パス (例: 'settings.json')
     */
    async downloadFile(path: string): Promise<string | null> {
        const owner = await this.getUsername();
        try {
            // GitHub からファイル情報を取得
            const fileInfo = await this.request(`/repos/${owner}/${this.repoName}/contents/${path}`);
            if (fileInfo.content) {
                // API から取得する Base64 コンテンツには、改行が含まれることがあるため不要な余白を除去します
                const cleanedContent = fileInfo.content.replace(/\s/g, '');
                // Base64 から通常の UTF-8 文字列にデコードして返します
                return Buffer.from(cleanedContent, 'base64').toString('utf-8');
            }
        } catch (error) {
            // ファイルが見つからない場合やネットワークエラーの場合は null を返します
        }
        return null;
    }
}
