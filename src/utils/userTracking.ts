import { getActiveUsersOnFile } from '../db/activeUserOperations'
import { getConnection } from '../db/connectionManagement'
// use colors directly from DB; no conversion needed

import * as vscode from 'vscode';
import { upsertUser } from '../db/userOperations'
import { removeActiveUser, updateActiveUserPresence } from '../db/activeUserOperations'
import { getActiveConnectionName, getActiveConnectionProfile } from './profileConnectionState'

export interface GridPosition {
    row: number;
    col: number;

}


const decorationTypes = new Map<number, vscode.TextEditorDecorationType>()
const lastLineByUser = new Map<number, number | undefined>()

export async function updateDecorations(userId: number | undefined) {
    try {
        const activeEditorNow = vscode.window.activeTextEditor
        console.log('[RemoteCursor] tick', new Date().toISOString())
        if (!activeEditorNow || !getConnection()) {
            console.log('[RemoteCursor] no active editor or no DB connection')
            return
        }
        if (!userId) return
        const filePath = vscode.workspace.asRelativePath(activeEditorNow.document.uri, false).replaceAll('\\', '/')
        if (!filePath || filePath === '.') return

        let users = await getActiveUsersOnFile(filePath)
        users = users.filter(u => u.userId !== userId && u.rowPos !== null && u.colPos !== null)

        console.log('[RemoteCursor] updateDecorations users:', users.map(u => ({ userId: u.userId, displayName: u.displayName, rowPos: u.rowPos, colPos: u.colPos, cursorColor: u.cursorColor })))

        // Remove decorations for users no longer present
        for (const [uid, deco] of decorationTypes.entries()) {
            if (!users.some(u => u.userId === uid)) {
                deco.dispose()
                decorationTypes.delete(uid)
                lastLineByUser.delete(uid)
            }
        }

        for (const user of users) {
            const uid = user.userId as number
            const color = user.cursorColor ?? '#000000'

            // Convert color to 30% opacity (hex or rgba)
            function toAlpha(c: string): string {
                if (c.startsWith('#') && (c.length === 7 || c.length === 9)) {
                    return c.slice(0, 7) + '4D' // 0x4D = 77/255 ≈ 0.3
                }
                if (c.startsWith('rgb(')) {
                    return c.replace('rgb(', 'rgba(').replace(')', ',0.3)')
                }
                if (c.startsWith('rgba(')) {
                    return c.replace(/,\s*([\d.]+)\)/, ',0.3)')
                }
                return c // fallback
            }
            const fadedColor = toAlpha(color)
            let deco = decorationTypes.get(uid)
            if (!deco) {
                deco = vscode.window.createTextEditorDecorationType({
                    backgroundColor: fadedColor,
                    isWholeLine: true,
                    after: {
                        contentText: `  ← ${user.displayName}`,
                        color: user.cursorColor ?? '#222',
                        margin: '0 0 0 1em',
                        fontWeight: 'bold',
                        fontStyle: 'italic',
                        backgroundColor: fadedColor,
                    },
                })
                decorationTypes.set(uid, deco)
            }

            // Highlight the entire line at the user's cursor (only if valid)
            const line = user.rowPos as number
            if (line >= 0 && line < activeEditorNow.document.lineCount) {
                const prev = lastLineByUser.get(uid)
                if (prev !== line) {
                    console.log(`[RemoteCursor] user ${uid} moved from ${prev} to ${line}`)
                    // force recreate decoration type to ensure editor re-renders change
                    try {
                        deco.dispose()
                    } catch (e) {
                        // ignore
                    }
                    deco = vscode.window.createTextEditorDecorationType({
                        backgroundColor: fadedColor,
                        isWholeLine: true,
                        after: {
                            contentText: `  ← ${user.displayName}`,
                            color: user.cursorColor ?? '#222',
                            margin: '0 0 0 1em',
                            fontWeight: 'bold',
                            fontStyle: 'normal',
                            backgroundColor: fadedColor,
                        },
                    })
                    decorationTypes.set(uid, deco)
                }
                const lineRange = activeEditorNow.document.lineAt(line).range
                activeEditorNow.setDecorations(deco, [{ range: lineRange, hoverMessage: `${user.displayName}` }])
                lastLineByUser.set(uid, line)
            } else {
                // Out of bounds - clear decorations for this user
                if (decorationTypes.has(uid)) activeEditorNow.setDecorations(decorationTypes.get(uid)!, [])
                lastLineByUser.set(uid, undefined)
            }
        }
    } catch (err) {
        console.error('[RemoteCursor] updateDecorations error', err)
    }
}


export function getActiveCursorPosition(): GridPosition | undefined {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor){
        return undefined
    };

    const position = activeEditor.selection.active;

    return {
        row: position.line + 1,
        col: position.character + 1
    };



}

export function getHighlightPositions(): GridPosition[] | undefined {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor){
        return undefined
    };

    const highlightStart = activeEditor.selection.start;

    const highlightStop = activeEditor.selection.end;


    return [
            {row: highlightStart.line + 1, col: highlightStart.character + 1},
            {row: highlightStart.line + 1, col: highlightStop.character + 1}
        ];


};

export async function markCurrentUserActive(context: vscode.ExtensionContext): Promise<void> {
    const profile = getActiveConnectionProfile(context)
    const displayName = profile?.displayName?.trim() || 'Anonymous'
    const color = profile?.color || '#4fc3f7'

    const activeConnectionName = getActiveConnectionName(context)
    const userIdKey = activeConnectionName ? `filefly.userId.${activeConnectionName}` : undefined
    let localUserId = userIdKey ? context.globalState.get<number>(userIdKey) : undefined

    if (localUserId === undefined) {
        //If this is a first connect for this connection: insert a new row into fileflyuser and persist the assigned id
        const newId = await upsertUser(undefined, displayName, color)
        if (userIdKey) {
            await context.globalState.update(userIdKey, newId)
        }
        localUserId = newId
    }

    const userId = localUserId

    const openFilePath = null

    await updateActiveUserPresence({
        userId,
        displayName,
        cursorColor: color,
        colPos: null,
        rowPos: null,
        openFilePath,
        highlightStartRow: null,
        highlightStartCol: null,
        highlightStopRow: null,
        highlightStopCol: null,
    })
}

export async function markCurrentUserInactive(context: vscode.ExtensionContext): Promise<void> {
    const activeConnectionName = getActiveConnectionName(context)
    const userIdKey = activeConnectionName ? `filefly.userId.${activeConnectionName}` : undefined
    const userId = userIdKey ? context.globalState.get<number>(userIdKey) : undefined
    if (userId === undefined) {
        return
    }

    // Meant to save changes of current file if window is closed or user dicsonnects as their have been instances of db being more up to date than local.
    // doesnt really work when window is clossed, still needs testing/fixing
    const activeEditor = vscode.window.activeTextEditor
    if (activeEditor?.document && activeEditor.document.uri.scheme === 'file' && activeEditor.document.isDirty) {
        try {
            await activeEditor.document.save()
        } catch (error) {
            console.error('Failed to save active editor before disconnect:', error)
        }
    }

    await removeActiveUser(userId)
}
