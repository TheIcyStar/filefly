import * as vscode from 'vscode';


export async function getFileContents() {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor)
        return;

    const document = await vscode.workspace.openTextDocument(activeEditor.document.uri)

    return document.getText();
        
}