import * as vscode from 'vscode';

export class GitHubService {
    private token: string;
    private repoName: string;
    private owner: string | null = null;

    constructor(token: string, repoName: string) {
        this.token = token;
        this.repoName = repoName;
    }

    private async request(path: string, options: RequestInit = {}): Promise<any> {
        const url = `https://api.github.com${path}`;
        const headers: Record<string, string> = {
            'Authorization': `Bearer ${this.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'Antigravity-Sync-Extension',
            ...((options.headers as Record<string, string>) || {})
        };

        const res = await fetch(url, { ...options, headers });
        if (!res.ok) {
            const body = await res.text().catch(() => '');
            throw new Error(`GitHub API Error: ${res.status} ${res.statusText} - ${body}`);
        }

        if (res.status === 204) {
            return null;
        }
        return res.json();
    }

    async getUsername(): Promise<string> {
        if (this.owner) {
            return this.owner;
        }
        const user = await this.request('/user');
        this.owner = user.login;
        return this.owner!;
    }

    /**
     * Ensure the sync repository exists, create it if not.
     */
    async ensureRepositoryExists(): Promise<void> {
        const owner = await this.getUsername();
        try {
            await this.request(`/repos/${owner}/${this.repoName}`);
        } catch (error) {
            vscode.window.showInformationMessage(`Creating private repository: ${this.repoName}...`);
            await this.request('/user/repos', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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
     * Upload file content to repository.
     */
    async uploadFile(path: string, content: string, message: string = 'Sync updates'): Promise<void> {
        const owner = await this.getUsername();
        let sha: string | undefined;

        try {
            const fileInfo = await this.request(`/repos/${owner}/${this.repoName}/contents/${path}`);
            sha = fileInfo.sha;
        } catch {
            // File does not exist
        }

        const base64Content = Buffer.from(content, 'utf-8').toString('base64');
        await this.request(`/repos/${owner}/${this.repoName}/contents/${path}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                message,
                content: base64Content,
                sha
            })
        });
    }

    /**
     * Download file content from repository.
     */
    async downloadFile(path: string): Promise<string | null> {
        const owner = await this.getUsername();
        try {
            const fileInfo = await this.request(`/repos/${owner}/${this.repoName}/contents/${path}`);
            if (fileInfo.content) {
                // GitHub returns base64 content with newlines occasionally, clean it
                const cleanedContent = fileInfo.content.replace(/\s/g, '');
                return Buffer.from(cleanedContent, 'base64').toString('utf-8');
            }
        } catch (error) {
            // File not found or other issues
        }
        return null;
    }
}
