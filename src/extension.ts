import * as vscode from 'vscode';
import { AuthService } from './auth';
import { GitHubService } from './githubService';
import { SyncService } from './syncService';

let authService: AuthService;

export async function activate(context: vscode.ExtensionContext) {
    console.log('Antigravity Sync is now active!');

    authService = new AuthService();
    await authService.initialize();

    const outputChannel = vscode.window.createOutputChannel('Antigravity Sync');
    context.subscriptions.push(outputChannel);

    /**
     * Helper to instantiate SyncService with valid authentication.
     */
    const getSyncService = async (forceLogin: boolean = true): Promise<SyncService | null> => {
        const token = await authService.getToken(forceLogin);
        if (!token) {
            if (forceLogin) {
                vscode.window.showErrorMessage('GitHub authentication required for Antigravity Sync.');
            }
            return null;
        }

        const config = vscode.workspace.getConfiguration('antigravitySync');
        const repoName = config.get<string>('repoName') || 'antigravity-sync-data';

        const githubService = new GitHubService(token, repoName);
        return new SyncService(githubService);
    };

    // Register Upload Command
    const uploadCmd = vscode.commands.registerCommand('antigravity-sync.upload', async () => {
        outputChannel.appendLine('Upload started...');
        try {
            const syncService = await getSyncService(true);
            if (syncService) {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: "Antigravity Sync: Uploading...",
                    cancellable: false
                }, async () => {
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

    // Register Download Command
    const downloadCmd = vscode.commands.registerCommand('antigravity-sync.download', async () => {
        outputChannel.appendLine('Download started...');
        try {
            const syncService = await getSyncService(true);
            if (syncService) {
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

    // Register Sync Command (Double Sync)
    const syncCmd = vscode.commands.registerCommand('antigravity-sync.sync', async () => {
        outputChannel.appendLine('Sync process triggered...');
        // Standard Sync will upload and then download or log information
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

    context.subscriptions.push(uploadCmd, downloadCmd, syncCmd);

    // Watch configuration changes for autoSync (without triggering authentication prompt on startup)
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            const config = vscode.workspace.getConfiguration('antigravitySync');
            const autoSync = config.get<boolean>('autoSync');

            // Trigger upload if autoSync is active and the change is not inside our own config settings
            if (autoSync && !e.affectsConfiguration('antigravitySync')) {
                outputChannel.appendLine('Configuration changed. Attempting auto-upload...');
                try {
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

export function deactivate() {}
