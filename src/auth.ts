import * as vscode from 'vscode';

export class AuthService {
    private token: string | null = null;

    /**
     * Initialize auth service by checking for existing sessions quietly.
     */
    async initialize(): Promise<void> {
        await this.getToken(false);
    }

    /**
     * Get GitHub access token.
     * @param forceLogin If true, prompt user to log in if no session exists.
     */
    async getToken(forceLogin: boolean = true): Promise<string | null> {
        if (this.token) {
            return this.token;
        }

        try {
            const session = await vscode.authentication.getSession('github', ['repo'], { createIfNone: forceLogin });
            if (session) {
                this.token = session.accessToken;
                return this.token;
            }
        } catch (error) {
            vscode.window.showErrorMessage(`GitHub authentication failed: ${error}`);
        }

        return null;
    }

    /**
     * Clear cached token.
     */
    async logout(): Promise<void> {
        this.token = null;
    }
}
