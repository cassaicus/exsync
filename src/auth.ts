/**
 * @file auth.ts
 * @description このファイルは、VS Code 内蔵の認証 API (vscode.authentication) を利用して、
 *              GitHub アカウントと連携し、セキュアに OAuth アクセストークンを取得・キャッシュ・破棄する
 *              認証管理サービス (AuthService) を定義します。
 */

import * as vscode from 'vscode';

/**
 * GitHub 認証を管理するサービス。
 * VS Code が提供する安全なキーチェーンストレージを介して GitHub のアクセストークンを取得・保持します。
 */
export class AuthService {
    // キャッシュされたアクセストークンを一時保持する変数
    private token: string | null = null;

    /**
     * 認証サービスの初期化処理。
     * 拡張機能起動時に、ユーザーにログインプロンプトを出さずに、
     * 既存の有効なセッションがあるかどうかをバックグラウンドで確認します。
     */
    async initialize(): Promise<void> {
        // バックグラウンドでトークンの取得を試みる (forceLogin: false)
        await this.getToken(false);
    }

    /**
     * GitHub のアクセストークンを取得します。
     * @param forceLogin true の場合、有効なセッションがなければユーザーにログインを促すダイアログを表示します。
     *                   false の場合、ダイアログを表示せずに既存のセッション取得のみを試みます。
     * @returns 取得できたアクセストークン文字列。取得できなかった場合は null を返します。
     */
    async getToken(forceLogin: boolean = true): Promise<string | null> {
        // すでにトークンがメモリ上にキャッシュされている場合はそれを返します
        if (this.token) {
            return this.token;
        }

        try {
            // VS Code の authentication API を呼び出します。
            // 第1引数: 認証プロバイダーID。GitHub を指定します。
            // 第2引数: 要求するスコープの配列。プライベートリポジトリの読み書きに必要な 'repo' を指定します。
            // 第3引数: オプション。createIfNone が true の場合、セッションがなければログイン画面を開きます。
            const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: forceLogin });
            
            // セッションが取得できた場合、アクセストークンをキャッシュして返します
            if (session) {
                this.token = session.accessToken;
                return this.token;
            }
        } catch (error) {
            // 認証プロセス中にエラー（ユーザーのキャンセルなど）が発生した場合にエラーメッセージを表示します
            vscode.window.showErrorMessage(`GitHub authentication failed: ${error}`);
        }

        return null;
    }

    /**
     * ログアウト処理。
     * キャッシュしているアクセストークンを破棄します。
     */
    async logout(): Promise<void> {
        this.token = null;
    }
}
