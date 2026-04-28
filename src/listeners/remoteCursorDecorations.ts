import * as vscode from 'vscode'
import { getActiveUsersOnFile } from '../db/activeUserOperations'
import { getConnection } from '../db/connectionManagement'

//OLD From when rendering cursors, kept if we want to change it back
interface RemoteCursorDecoration {
    userId: number
    displayName: string
    color: string
    position: vscode.Position
}


// Changes whole line to color of user editing that line
export function registerRemoteCursorDecorations(
    context: vscode.ExtensionContext,
    getUserId: () => number | undefined
): vscode.Disposable {
    void context
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
                    backgroundColor: user.cursorColor,
                    isWholeLine: true,
                })
                decorationTypes.set(user.userId, deco)
            }
            // Highlight the entire line at the user's cursor
            const line = user.rowPos!;
            const lineRange = activeEditor.document.lineAt(line).range;
            activeEditor.setDecorations(deco, [{
                range: lineRange,
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

    const onDidChangeActiveTextEditorDisp = vscode.window.onDidChangeActiveTextEditor(editor => {
        activeEditor = editor
        updateDecorations()
    })

    const onDidCloseTextDocumentDisp = vscode.workspace.onDidCloseTextDocument(() => {
        stopPolling()
    })

    startPolling()
    updateDecorations()

    const disposable = { dispose: () => {
        stopPolling()
        for (const deco of decorationTypes.values()) deco.dispose()
        decorationTypes.clear()
        try { onDidChangeActiveTextEditorDisp.dispose() } catch (e) {}
        try { onDidCloseTextDocumentDisp.dispose() } catch (e) {}
    }}
    return disposable as vscode.Disposable
}
