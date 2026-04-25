import * as vscode from 'vscode'
import { getActiveUsersOnFile } from '../db/activeUserOperations'
import { getConnection } from '../db/connectionManagement'

interface RemoteCursorDecoration {
    userId: number
    displayName: string
    color: string
    position: vscode.Position
}

export function registerRemoteCursorDecorations(
    context: vscode.ExtensionContext,
    getUserId: () => number | undefined
): vscode.Disposable {
    let activeEditor = vscode.window.activeTextEditor
    let pollInterval: NodeJS.Timeout | undefined
    const decorationTypes = new Map<number, vscode.TextEditorDecorationType>()

    async function updateDecorations() {
        if (!activeEditor || !getConnection()) return
        const userId = getUserId()
        if (!userId) return
        const filePath = vscode.workspace.asRelativePath(activeEditor.document.uri, false).replaceAll('\\', '/')
        if (!filePath || filePath === '.') return

        let users = await getActiveUsersOnFile(filePath)
        users = users.filter(u => u.userId !== userId && u.rowPos !== null && u.colPos !== null)

        // Remove decorations for users no longer present
        for (const [uid, deco] of decorationTypes.entries()) {
            if (!users.some(u => u.userId === uid)) {
                deco.dispose()
                decorationTypes.delete(uid)
            }
        }

        for (const user of users) {
            let deco = decorationTypes.get(user.userId)
            if (!deco) {
                deco = vscode.window.createTextEditorDecorationType({
                    border: `2px solid ${user.cursorColor}`,
                    borderRadius: '2px',
                    after: {
                        contentText: '',
                        margin: '0 0 0 2px',
                    },
                    isWholeLine: false,
                })
                decorationTypes.set(user.userId, deco)
            }
            // Place a 0-width decoration at the user's cursor
            const pos = new vscode.Position(user.rowPos!, user.colPos!)
            activeEditor.setDecorations(deco, [{
                range: new vscode.Range(pos, pos),
                hoverMessage: `${user.displayName}`,
            }])
        }
    }

    function startPolling() {
        if (pollInterval) clearInterval(pollInterval)
        pollInterval = setInterval(updateDecorations, 300)
    }

    function stopPolling() {
        if (pollInterval) clearInterval(pollInterval)
        pollInterval = undefined
    }

    vscode.window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor
        updateDecorations()
    }, null, context.subscriptions)

    vscode.workspace.onDidCloseTextDocument(() => {
        stopPolling()
    }, null, context.subscriptions)

    startPolling()
    updateDecorations()

    const disposable = { dispose: () => {
        stopPolling()
        for (const deco of decorationTypes.values()) deco.dispose()
        decorationTypes.clear()
    }}
    context.subscriptions.push(disposable)
    return disposable as vscode.Disposable
}
