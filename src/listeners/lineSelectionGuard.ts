import * as vscode from 'vscode'
import { getActiveUsersOnLine } from '../db/activeUserOperations'
import { getConnection } from '../db/connectionManagement'

export function registerLineSelectionGuard(
    context: vscode.ExtensionContext,
    getUserId: () => number | undefined
): vscode.Disposable {
    void context
    const lastValidSelectionsByEditor = new Map<string, vscode.Selection[]>()
    let isRestoringSelection = false

    const disposable = vscode.window.onDidChangeTextEditorSelection(async (event) => {
        if (isRestoringSelection) {
            return
        }

        const editor = event.textEditor
        if (editor.document.uri.scheme !== 'file') {
            return
        }

        const editorKey = editor.document.uri.toString()

        if (!getConnection()) {
            lastValidSelectionsByEditor.set(editorKey, [...event.selections])
            return
        }

        const userId = getUserId()
        if (userId === undefined) {
            lastValidSelectionsByEditor.set(editorKey, [...event.selections])
            return
        }

        const filePath = vscode.workspace.asRelativePath(editor.document.uri, false).replaceAll('\\', '/')
        if (!filePath || filePath === '.') {
            lastValidSelectionsByEditor.set(editorKey, [...event.selections])
            return
        }

        // Block if any active cursor line in this selection is occupied by another user.
        const targetLines = Array.from(new Set(event.selections.map((s) => s.active.line)))

        try {
            for (const lineNumber of targetLines) {
                const usersOnLine = await getActiveUsersOnLine(filePath, lineNumber, userId)
                if (usersOnLine.length > 0) {
                    const names = usersOnLine.map((u) => u.displayName).join(', ')
                    const fallbackSelections = lastValidSelectionsByEditor.get(editorKey)

                    if (fallbackSelections && fallbackSelections.length > 0) {
                        isRestoringSelection = true
                        editor.selections = fallbackSelections
                        isRestoringSelection = false
                    }

                    vscode.window.showWarningMessage(
                        `FileFly: Line ${lineNumber + 1} is occupied by ${names}.`
                    )
                    return
                }
            }
        } catch (error) {
            console.error('[FileFly][lineSelectionGuard] failed occupancy check:', error)
            lastValidSelectionsByEditor.set(editorKey, [...event.selections])
            return
        }

        lastValidSelectionsByEditor.set(editorKey, [...event.selections])
    })

    return disposable
}
