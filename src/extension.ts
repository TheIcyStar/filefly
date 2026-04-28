import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { disconnectDatabaseConnection, getConnection, getDatabaseConnection } from './db/connectionManagement'
import { upsertUser } from './db/userOperations'
import { updateActiveUserPresence } from './db/activeUserOperations'
import postgres from 'postgres'
import { fileCreateListener, fileDeleteListener, fileRenameListener, textDocumentChangeListener } from './listeners/fileListeners'
import { registerEnterGuard } from './listeners/enterGuard'
import { registerLineSelectionGuard } from './listeners/lineSelectionGuard'
import { updateDecorations } from './utils/userTracking'
import { getActiveConnectionName, getActiveConnectionProfile, hasSavedUserConfigForConnection, saveActiveConnectionProfile, setActiveConnectionName, UserConfig } from './utils/profileConnectionState'
import { showUserConnectionPicker, loadView, getConnectionDashboardHtml, getUserConfigHtml, UserConfigPanel, buildUserConfigHtml, ConnectionConfig, ConnectionItem, ConnectionDashboardPanel, EditConnectionPanel } from './utils/uiHelpers'
import { markCurrentUserActive, markCurrentUserInactive } from './utils/userTracking'
import { getWorkspaceTreeDiff } from './utils/filetreeDiff'
import { connectionTargetKey, getNonce } from './utils/generalHelpers'
import { runAsRemoteApply } from './utils/syncGuard'
import { makeWorkspaceFromDatabase } from './local/makeWorkspace'
import { updateWorkspaceFromDiff } from './local/updateWorkspace'

let realTimeSyncInterval: NodeJS.Timeout | undefined
let realTimeSyncRunning = false
const realTimeSyncIntervalMs = 200
let _extensionContext: vscode.ExtensionContext | undefined

//types
//note: largely doesn't work right now and is mostly just
// UI - saving that workload for others.

//FURTHER NOTE: I tested userConfig on a separate branch without the most recent
// database connection changes and it worked - HOWEVER, it will not compile
// on this version with said changes.
/*
    html section:
    needed to generate a random nonce because VSCode requires CSP compliance
    for inline scripts and styles.

    Also unfortunate because VSCode doesn't like Typescript in the webview
    so the next best option is generate the Javascript as a string and compile
    it via this typescript file

    New:
    reads HTML, CSS, and JS from src/views/connectionEdit/ (copied to dist/views/
    by esbuild) and stitches them together12412281b998a02ff7bff4a9e8fe1183e1e59d1
 */


function userIdKey(connectionName: string): string {
    return `filefly.userId.${connectionName}`
}


export function getStoredUserId(context: vscode.ExtensionContext, connectionName: string): number | undefined {
    return context.globalState.get<number>(userIdKey(connectionName))
}

export function storeUserId(context: vscode.ExtensionContext, connectionName: string, userId: number): void {
    context.globalState.update(userIdKey(connectionName), userId)
}


async function realTimeSync(): Promise<void> {
    if (realTimeSyncInterval) {
        clearInterval(realTimeSyncInterval)
        realTimeSyncInterval = undefined
    }

    // During the initial workspace rebuild, we may receive file events triggered by our own fs operations. This prevents that.
    console.log('[FileFly][sync] initial rebuild start')
    await runAsRemoteApply(async () => {
            await makeWorkspaceFromDatabase()
    })
    console.log('[FileFly][sync] initial rebuild done')

    console.log('[FileFly][sync] realtime sync active')
    vscode.window.showInformationMessage('FileFly: Real-time sync is now active.')
    console.log('[FileFly][sync] any file events will be logged below')

    realTimeSyncInterval = setInterval(async () => {
        if (realTimeSyncRunning) {
            console.log('[FileFly][sync] tick skipped: previous tick still running')
            return
        }

        realTimeSyncRunning = true

        try {
            //console.log(`[FileFly][sync] tick begin`)

            const diffs = await getWorkspaceTreeDiff()

            //console.log(`[FileFly][sync] tick diffs: ${diffs.length}`)

            await runAsRemoteApply(async () => {
                await updateWorkspaceFromDiff(diffs)
            })
            //console.log('[FileFly][sync] tick apply done')
            const connName = getActiveConnectionName(_extensionContext!)
            const userId = connName ? getStoredUserId(_extensionContext!, connName) : undefined
            await updateDecorations(userId)
        } catch (error) {
            console.error('FileFly real-time sync failed:', error)
        } finally {

            realTimeSyncRunning = false
        }
    }, realTimeSyncIntervalMs)
}


export function activate(context: vscode.ExtensionContext): void {
    _extensionContext = context

    console.log('FileFly extension activated')
    vscode.window.showInformationMessage('FileFly activated. Use the FileFly panel to connect to a database and start syncing files!')

    let activeConnectionName: string | undefined

    context.subscriptions.push(

        vscode.commands.registerCommand(
            'filefly.resetState',
            async () => {
                const keys = context.globalState.keys()
                for (const key of keys) {
                    await context.globalState.update(key, undefined)
                }
                vscode.window.showInformationMessage('FileFly: Global state cleared.')
            }
        ),

        vscode.commands.registerCommand(
            'filefly.newConnection',
            () => ConnectionDashboardPanel.createOrShow(context.extensionUri)
        ),

        vscode.commands.registerCommand(
            'filefly.editUserConfig',
            () => UserConfigPanel.createOrShow(context.extensionUri, context, false)
        ),

        vscode.commands.registerCommand(
            'filefly.refreshConnections',
            () => {
                if(activeConnectionName) {

                    vscode.window.showInformationMessage("FileFly: Connection Refreshed")
                } else {
                    vscode.window.showInformationMessage("FileFly: No Active FileFly Connection")
                }
            }
        ),

        vscode.commands.registerCommand(
            'filefly.startRealtimeSync',
            async () => {
                try {
                    if (!getConnection()) {
                        vscode.window.showErrorMessage('FileFly: Connect to a database before starting real-time sync.')
                        return
                    }

                    const confirm = await vscode.window.showWarningMessage(
                        'FileFly: Starting real-time sync will delete all current workspace files and rebuild from the database. Continue?',
                        { modal: true },
                        'Start Real-Time Sync'
                    )

                    if (confirm !== 'Start Real-Time Sync') {
                        return
                    }

                    await realTimeSync()
                } catch (err) {
                    console.error('Failed starting real-time sync:', err)
                    vscode.window.showErrorMessage('FileFly: Failed to start real-time sync.')
                }
            }
        ),

        vscode.commands.registerCommand(
            'filefly.connectConnection',
            async (connitem?: ConnectionItem) => {
                let item = connitem

                if (!item) {
                    item = await showUserConnectionPicker('Select a FileFly connection to connect')
                    if (!item) { return }
                }


                try {

                    //Closes current connection if user selects another connection to connect to using FileFly:Connect
                    if (activeConnectionName && activeConnectionName !== item.config.connectionName) {
                        try {
                            await markCurrentUserInactive(context)
                        } catch (err) {
                            console.error('Failed removing active-user presence while switching connections:', err)
                        }
                        if (realTimeSyncInterval) {
                            clearInterval(realTimeSyncInterval)
                            realTimeSyncInterval = undefined
                        }
                        await setActiveConnectionName(context, undefined)
                        await disconnectDatabaseConnection()

                    }

                    const connection = await getDatabaseConnection(item.config)
                    if (connection === undefined) {
                        vscode.window.showErrorMessage(`FileFly: Failed to connect to "${item.config.connectionName}"`)
                    } else {
                        activeConnectionName = item.config.connectionName
                        await setActiveConnectionName(context, item.config.connectionName)

                        UserConfigPanel.createOrShow(context.extensionUri, context, false)

                        try {
                            await markCurrentUserActive(context)
                            console.log(`[FileFly] Connected to "${item.config.connectionName}"`)
                        } catch (err) {
                            console.error('Failed marking user as active after connect:', err)
                            vscode.window.showWarningMessage(
                                'FileFly: Connected, but failed to record active-user presence.'
                            )
                        }

                        vscode.window.showInformationMessage(`Connected to "${item.config.connectionName}"`)

                    }
                } catch (err) {
                    console.log(err)
                    vscode.window.showErrorMessage(`FileFly: Failed to connect to "${item.config.connectionName}"`)
                }
            }
        ),

        vscode.commands.registerCommand(
            'filefly.disconnectConnection',
            async () => {
                if (!activeConnectionName) {
                    vscode.window.showErrorMessage('FileFly: No Active FileFly Connection.')
                    return
                }

                const connectionName = activeConnectionName

                try {
                    try {
                        await markCurrentUserInactive(context)
                        console.log(`[FileFly] Disconnected from "${connectionName}"`)
                    } catch (err) {
                        console.error('Failed removing active-user presence on disconnect:', err)
                    }

                    if (realTimeSyncInterval) {
                        clearInterval(realTimeSyncInterval)
                        realTimeSyncInterval = undefined
                    }

                    await setActiveConnectionName(context, undefined)
                    await disconnectDatabaseConnection()

                    activeConnectionName = undefined
                    vscode.window.showInformationMessage(`FileFly: Disconnected from "${connectionName}"`)
                } catch (err) {
                    console.error(err)
                    vscode.window.showErrorMessage(`FileFly: Failed to disconnect from "${connectionName}"`)
                }
            }
        ),

        vscode.commands.registerCommand(
            'filefly.editConnection',
            async (connitem?: ConnectionItem) => {

                //same as in filefly:connect
                let item = connitem

                if (!item) {
                    item = await showUserConnectionPicker('Select a FileFly connection to edit')
                    if (!item) { return }
                }

                //open editing panel for selected connection
                EditConnectionPanel.createOrShow(context.extensionUri, item.config, context)
            }
        ),

        vscode.commands.registerCommand(
            'filefly.deleteConnection',
            async (connitem?: ConnectionItem) => {
                let item = connitem

                if (!item) {
                    item = await showUserConnectionPicker('Select a FileFly connection to delete')
                    if (!item) { return }
                }

                const answer = await vscode.window.showWarningMessage(
                    `Delete connection "${item.config.connectionName}"? This cannot be undone.`,
                    { modal: true },
                    'Delete'
                )
                if (answer !== 'Delete') { return }

                const settings = vscode.workspace.getConfiguration('filefly')
                const existing: ConnectionConfig[] = settings.get('connections') ?? []
                await settings.update(
                    'connections',
                    existing.filter(c => c.connectionName !== item.config.connectionName),
                    vscode.ConfigurationTarget.Global
                )


                vscode.window.showInformationMessage(`FileFly: Connection "${item.config.connectionName}" Succesfully Deleted.`)
            }
        ),

        vscode.workspace.onDidCreateFiles(fileCreateListener),

        vscode.workspace.onDidDeleteFiles(fileDeleteListener),

        vscode.workspace.onDidRenameFiles(fileRenameListener),

        vscode.workspace.onDidChangeTextDocument(textDocumentChangeListener),

        vscode.window.onDidChangeTextEditorSelection(async (event) => {
            const connName = getActiveConnectionName(context)
            const userId = connName ? getStoredUserId(context, connName) : undefined
            if (userId === undefined || !getConnection()) { return }

            const profile = getActiveConnectionProfile(context)
            const displayName = profile?.displayName?.trim() || 'Anonymous'
            const color = profile?.color || '#4fc3f7'

            const editor = event.textEditor
            const pos = editor.selection.active
            const filePath = vscode.workspace.asRelativePath(editor.document.uri, false).replaceAll('\\', '/')

            await updateActiveUserPresence({
                userId,
                displayName,
                cursorColor: color,
                rowPos: pos.line,
                colPos: pos.character,
                openFilePath: filePath,
                highlightStartRow: null,
                highlightStartCol: null,
                highlightStopRow: null,
                highlightStopCol: null,
            })
        })

    )

    // Guards and decorations will be registered after realTimeSync is started
    // Only register guards/decorations once
    if (!(realTimeSync as any)._guardsRegistered) {
        registerEnterGuard(_extensionContext!, () => {
            const connName = getActiveConnectionName(_extensionContext!)
            return connName ? getStoredUserId(_extensionContext!, connName) : undefined
        })

        registerLineSelectionGuard(_extensionContext!, () => {
            const connName = getActiveConnectionName(_extensionContext!)
            return connName ? getStoredUserId(_extensionContext!, connName) : undefined
        })

        ;(realTimeSync as any)._guardsRegistered = true
    }
}


export async function deactivate(): Promise<void> {
    if (_extensionContext) {
        await markCurrentUserInactive(_extensionContext)
    }
}
