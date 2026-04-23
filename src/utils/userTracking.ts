import * as vscode from 'vscode';
import { upsertUser } from '../db/userOperations'
import { removeActiveUser, updateActiveUserPresence } from '../db/activeUserOperations'
import { toUnixPath } from './generalHelpers'
import { getActiveConnectionName, getActiveConnectionProfile } from './profileConnectionState'

export interface GridPosition {
    row: number;
    col: number;

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
    const editor = vscode.window.activeTextEditor

    const profile = getActiveConnectionProfile(context)
    const displayName = profile?.displayName?.trim() || 'Anonymous'
    const color = profile?.color || '#4fc3f7'

    const activeConnectionName = getActiveConnectionName(context)
    const userIdKey = activeConnectionName ? `filefly.userId.${activeConnectionName}` : undefined
    const localUserId = userIdKey ? context.globalState.get<number>(userIdKey) : undefined
    const userId = await upsertUser(localUserId, displayName, color)
    if (localUserId === undefined && userIdKey) {
        await context.globalState.update(userIdKey, userId)
    }

    const hasFileContext = Boolean(editor && !editor.document.isUntitled && editor.document.uri.scheme === 'file')

    const openFilePath = hasFileContext
        ? toUnixPath(vscode.workspace.asRelativePath(editor!.document.uri, false))
        : null
    const selection = hasFileContext ? editor!.selection : undefined
    const active = selection?.active
    const anchor = selection?.anchor

    await updateActiveUserPresence({
        userId,
        displayName,
        cursorColor: color,
        colPos: active?.character ?? null,
        rowPos: active?.line ?? null,
        openFilePath,
        highlightStartRow: anchor?.line ?? null,
        highlightStartCol: anchor?.character ?? null,
        highlightStopRow: active?.line ?? null,
        highlightStopCol: active?.character ?? null,
    })
}

export async function markCurrentUserInactive(context: vscode.ExtensionContext): Promise<void> {
    const activeConnectionName = getActiveConnectionName(context)
    const userIdKey = activeConnectionName ? `filefly.userId.${activeConnectionName}` : undefined
    const userId = userIdKey ? context.globalState.get<number>(userIdKey) : undefined
    if (userId === undefined) {
        return
    }

    await removeActiveUser(userId)
}


