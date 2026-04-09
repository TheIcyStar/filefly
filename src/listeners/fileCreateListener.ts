import * as vscode from 'vscode'
import * as fs from 'fs'
import { insertFile } from '../db/fileOperations';

export function fileCreateListener(fileCreateEvent: vscode.FileCreateEvent) {
    for (let i = 0; i < fileCreateEvent.files.length; i++) {
        const uri = fileCreateEvent.files[i];
        const filePath = uri.fsPath;
        try {
            if (!fs.existsSync(filePath)) {
                continue;
            }
            const relativePath = vscode.workspace.asRelativePath(uri, false);
            insertFile(relativePath, "").then(() => {
                vscode.window.showInformationMessage(`Successfully added "${relativePath}"!`)
            })
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to insert new file ${filePath}`)
            console.error(`Failed to insert new file ${filePath}:`, error);
        }
    }
}