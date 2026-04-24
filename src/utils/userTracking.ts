import * as vscode from 'vscode';
import { upsertUser } from '../db/userOperations'
import { removeActiveUser, updateActiveUserPresence } from '../db/activeUserOperations'
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
