import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { GitHubService } from './githubService';

export class SyncService {
    private githubService: GitHubService;

    constructor(githubService: GitHubService) {
        this.githubService = githubService;
    }

    private getUserConfigPath(): string {
        const home = os.homedir();
        switch (process.platform) {
            case 'win32':
                return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'Code', 'User');
            case 'darwin':
                return path.join(home, 'Library', 'Application Support', 'Code', 'User');
            default:
                return path.join(home, '.config', 'Code', 'User');
        }
    }

    private getAntigravityDataPath(): string {
        return path.join(os.homedir(), '.gemini', 'antigravity');
    }

    /**
     * Upload settings, extensions, and Antigravity data to GitHub.
     */
    async upload(): Promise<void> {
        await this.githubService.ensureRepositoryExists();

        const userConfigDir = this.getUserConfigPath();

        // 1. VS Code settings.json
        const settingsPath = path.join(userConfigDir, 'settings.json');
        if (fs.existsSync(settingsPath)) {
            const settings = fs.readFileSync(settingsPath, 'utf-8');
            await this.githubService.uploadFile('settings.json', settings, 'Sync: Update settings.json');
        }

        // 2. VS Code keybindings.json
        const keybindingsPath = path.join(userConfigDir, 'keybindings.json');
        if (fs.existsSync(keybindingsPath)) {
            const keybindings = fs.readFileSync(keybindingsPath, 'utf-8');
            await this.githubService.uploadFile('keybindings.json', keybindings, 'Sync: Update keybindings.json');
        }

        // 3. Installed Extensions list
        const extensions = vscode.extensions.all
            .filter(ext => !ext.packageJSON.isBuiltin)
            .map(ext => ext.id);
        await this.githubService.uploadFile(
            'extensions.json', 
            JSON.stringify(extensions, null, 2), 
            'Sync: Update extensions list'
        );

        // 4. Antigravity Data
        const agPath = this.getAntigravityDataPath();
        if (fs.existsSync(agPath)) {
            await this.uploadDirectory(agPath, 'antigravity-data');
        }
    }

    /**
     * Recursively upload a local directory to GitHub repository.
     */
    private async uploadDirectory(localDir: string, remoteDir: string): Promise<void> {
        if (!fs.existsSync(localDir)) {
            return;
        }

        const entries = fs.readdirSync(localDir, { withFileTypes: true });
        for (const entry of entries) {
            const localPath = path.join(localDir, entry.name);
            const remotePath = `${remoteDir}/${entry.name}`;

            if (entry.isDirectory()) {
                // Ignore node_modules, .git, etc.
                if (entry.name !== 'node_modules' && entry.name !== '.git') {
                    await this.uploadDirectory(localPath, remotePath);
                }
            } else if (entry.isFile()) {
                const stat = fs.statSync(localPath);
                // Limit file size to 1MB to avoid GitHub API issues
                if (stat.size < 1024 * 1024) {
                    const content = fs.readFileSync(localPath, 'utf-8');
                    await this.githubService.uploadFile(remotePath, content, `Sync: Update ${entry.name}`);
                }
            }
        }
    }

    /**
     * Download settings, extensions, and Antigravity data from GitHub.
     */
    async download(): Promise<void> {
        const confirm = await vscode.window.showWarningMessage(
            'This will overwrite your local settings. Do you want to proceed?',
            'Yes',
            'No'
        );
        if (confirm !== 'Yes') {
            return;
        }

        const userConfigDir = this.getUserConfigPath();
        if (!fs.existsSync(userConfigDir)) {
            fs.mkdirSync(userConfigDir, { recursive: true });
        }

        // 1. VS Code settings.json
        const settings = await this.githubService.downloadFile('settings.json');
        if (settings) {
            fs.writeFileSync(path.join(userConfigDir, 'settings.json'), settings, 'utf-8');
        }

        // 2. VS Code keybindings.json
        const keybindings = await this.githubService.downloadFile('keybindings.json');
        if (keybindings) {
            fs.writeFileSync(path.join(userConfigDir, 'keybindings.json'), keybindings, 'utf-8');
        }

        // 3. Extensions
        const extensionsJson = await this.githubService.downloadFile('extensions.json');
        if (extensionsJson) {
            try {
                const extensionIds: string[] = JSON.parse(extensionsJson);
                await this.installMissingExtensions(extensionIds);
            } catch (e) {
                vscode.window.showErrorMessage(`Failed to parse extensions list: ${e}`);
            }
        }

        // 4. Antigravity Data
        // To keep the skeleton simple, we fetch a manifest or list of files.
        // For a full implementation, we would query the GitHub contents API recursively.
        // For now, we stub this out or log it.
        vscode.window.showInformationMessage('Antigravity data download is initialized.');
    }

    /**
     * Helper to install extensions that are missing locally.
     */
    private async installMissingExtensions(extensionIds: string[]): Promise<void> {
        const installedIds = vscode.extensions.all.map(ext => ext.id.toLowerCase());
        
        for (const extId of extensionIds) {
            if (!installedIds.includes(extId.toLowerCase())) {
                vscode.window.showInformationMessage(`Installing extension: ${extId}...`);
                // VS Code command to install extension
                await vscode.commands.executeCommand('workbench.extensions.installExtension', extId);
            }
        }
    }
}
