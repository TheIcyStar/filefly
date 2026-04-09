import * as vscode from 'vscode'

export function fileCreateListener(fileCreateEvent: vscode.FileCreateEvent) {
    vscode.window.showInformationMessage(`You created file(s): "${fileCreateEvent.files}!"`)
}