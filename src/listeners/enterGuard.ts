import * as vscode from 'vscode'
import { getActiveUsersBelowLine } from '../db/activeUserOperations'
import { getConnection } from '../db/connectionManagement'

// Intercepts the Enter key. If another active user has their cursor below the current user's
// cursor line in the same file, the newline is blocked and a warning is shown. This prevents
// the line-number drift problem where one user's Enter shifts another user's line numbers.
export function registerEnterGuard(context: vscode.ExtensionContext, getUserId: () => number | undefined): vscode.Disposable {
    console.log('[FileFly][enterGuard] registering type command override')
    void context

    const disposable = vscode.commands.registerCommand('type', async (args: { text: string }) => {
        // Only intercept Enter keystrokes; pass everything else straight through.
        if (args.text !== '\n') {
            await vscode.commands.executeCommand('default:type', args)
            return
        }

        //console.log('[FileFly][enterGuard] Enter pressed — checking guard conditions')

        // If no DB connection is active, let the editor behave normally.
        if (!getConnection()) {
            //console.log('[FileFly][enterGuard] no DB connection — allowing Enter')
            await vscode.commands.executeCommand('default:type', args)
            return
        }

        const editor = vscode.window.activeTextEditor
        if (!editor) {
            //console.log('[FileFly][enterGuard] no active editor — allowing Enter')
            await vscode.commands.executeCommand('default:type', args)
            return
        }

        const userId = getUserId()
        if (userId === undefined) {
            //console.log('[FileFly][enterGuard] no userId — allowing Enter')
            await vscode.commands.executeCommand('default:type', args)
            return
        }

        const filePath = vscode.workspace.asRelativePath(editor.document.uri, false).replaceAll('\\', '/')
        if (!filePath || filePath === '.') {
            //console.log('[FileFly][enterGuard] could not resolve filePath — allowing Enter')
            await vscode.commands.executeCommand('default:type', args)
            return
        }

        // Use the lowest cursor position if there are multiple selections.
        const lowestCursorLine = Math.max(...editor.selections.map((s) => s.active.line))

        //console.log(`[FileFly][enterGuard] userId=${userId} filePath=${filePath} lowestCursorLine=${lowestCursorLine} — querying users below`)

        try {
            const usersBelow = await getActiveUsersBelowLine(filePath, lowestCursorLine, userId)
            //console.log(`[FileFly][enterGuard] usersBelow count=${usersBelow.length}`, usersBelow.map(u => `${u.displayName}@row${u.rowPos}`))

            if (usersBelow.length > 0) {
                const names = usersBelow.map((u) => u.displayName).join(', ')
                console.log(`[FileFly][enterGuard] BLOCKING Enter - There are users editing below you`)
                vscode.window.showWarningMessage(
                    `FileFly: Cannot create a new line — there are users editing below your cursor.`
                )
                // Do NOT forward the keystroke — newline is blocked.
                return
            }
        } catch (err) {
            //console.error('[FileFly][enterGuard] failed to check users below cursor:', err)
            // On error, fall through and allow the newline so editing is not permanently broken.
        }

        //console.log('[FileFly][enterGuard] no users below — allowing Enter')
        await vscode.commands.executeCommand('default:type', args)
    })

    return disposable
}
