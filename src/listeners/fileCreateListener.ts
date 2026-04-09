import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from "path";

export function fileCreateListener(fileCreateEvent: vscode.FileCreateEvent) {
    vscode.window.showInformationMessage(`You created file(s): "${fileCreateEvent.files}!"`)
    for (let i = 0; i < fileCreateEvent.files.length; i++) {
        const uri = fileCreateEvent.files[i];
        const filePath = uri.fsPath;
        try {
            if (!fs.existsSync(filePath)) {
                continue;
            }
            const filename = path.parse(filePath).base;
            const relativePath = vscode.workspace.asRelativePath(uri, false);
            vscode.window.showInformationMessage(`Path: ${relativePath}, Filename: ${filename}!`)
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to get data from ${filePath}`)
            console.error(`Failed to get file info for ${filePath}:`, error);
        }
    }
}