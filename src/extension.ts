import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { disconnectDatabaseConnection, getConnection, getDatabaseConnection } from './db/connectionManagement'
import { upsertUser } from './db/userOperations'
import { updateActiveUserPresence } from './db/activeUserOperations'
import postgres from 'postgres'
import { fileCreateListener, fileDeleteListener, fileRenameListener, textDocumentChangeListener } from './listeners/fileListeners'
import { getActiveConnectionName, getActiveConnectionProfile, hasSavedUserConfigForConnection, saveActiveConnectionProfile, setActiveConnectionName, UserConfig } from './utils/profileConnectionState'
import { showUserConnectionPicker } from './utils/uiHelpers'
import { markCurrentUserActive, markCurrentUserInactive } from './utils/userTracking'
import { getWorkspaceTreeDiff } from './utils/filetreeDiff'
import { connectionTargetKey } from './utils/generalHelpers'
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

export interface ConnectionConfig {
    connectionName: string
    displayName?: string
    color?: string
    authType: string
    username: string
    password: string
    hostname: string
    port: number
    connectionMode: string
    database: string
    serviceName: string
}

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

type DashboardMessage =
    | { command: 'submit'; payload: ConnectionConfig }
    | { command: 'cancel' }
    | { command: 'testConnection'; payload: ConnectionConfig }

type UserConfigMessage =
    | { command: 'submit'; payload: UserConfig }
    | { command: 'cancel' }

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
function getNonce(): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

function userIdKey(connectionName: string): string {
    return `filefly.userId.${connectionName}`
}

function getStoredUserId(context: vscode.ExtensionContext, connectionName: string): number | undefined {
    return context.globalState.get<number>(userIdKey(connectionName))
}

function storeUserId(context: vscode.ExtensionContext, connectionName: string, userId: number): void {
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
        } catch (error) {
            console.error('FileFly real-time sync failed:', error)
        } finally {
            realTimeSyncRunning = false
        }
    }, realTimeSyncIntervalMs)
}

//since it's not just the connection anymore, I renamed this + a few other things
function loadView(extensionUri: vscode.Uri, viewName: string, title: string): string {
    const viewDir = path.join(extensionUri.fsPath, 'dist', 'views', viewName)
    const html    = fs.readFileSync(path.join(viewDir, 'index.html'), 'utf8')
    const css     = fs.readFileSync(path.join(viewDir, 'style.css'),  'utf8')
    const js      = fs.readFileSync(path.join(viewDir, 'index.js'),   'utf8')
    const nonce   = getNonce()

    return html
        .replace(/\{\{NONCE\}\}/g, nonce)
        .replace(/\{\{TITLE\}\}/g, title)
        .replace('{{STYLE}}',  css)
        .replace('{{SCRIPT}}', js)
}

function getConnectionDashboardHtml(extensionUri: vscode.Uri, title = 'New FileFly Instance'): string {
    return loadView(extensionUri, 'connectionEdit', title)
}

function getUserConfigHtml(extensionUri: vscode.Uri, title = 'Your Profile'): string {
    return loadView(extensionUri, 'userConfig', title)
}

class UserConfigPanel {
    public static readonly viewType = 'filefly.userConfig'

    private readonly _panel: vscode.WebviewPanel
    private readonly _disposables: vscode.Disposable[] = []

    private constructor(
        panel: vscode.WebviewPanel,
        extensionUri: vscode.Uri,
        private readonly _chainToConnection: boolean,
        private readonly _context: vscode.ExtensionContext,
        private _userId: number | undefined,
        existingConfig: UserConfig | undefined
    ) {
        this._panel = panel
        this._panel.webview.html = buildUserConfigHtml(extensionUri, existingConfig)
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables)
        this._panel.webview.onDidReceiveMessage(
            (msg: UserConfigMessage) => this._handleMessage(msg),
            null,
            this._disposables
        )
    }

    public static createOrShow(
        extensionUri: vscode.Uri,
        _context: vscode.ExtensionContext,
        // when called from editUserConfig, skip chaining to the connection panel
        chainToConnection = true
    ): void {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
        const existing = getActiveConnectionProfile(_context)
        const activeConnectionName = getActiveConnectionName(_context)

        const userId = activeConnectionName ? getStoredUserId(_context, activeConnectionName) : undefined

        const title = chainToConnection ? 'Your Profile' : 'Edit Your Profile'

        const panel = vscode.window.createWebviewPanel(
            UserConfigPanel.viewType,
            title,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'views')]
            }
        )

        new UserConfigPanel(panel, extensionUri, chainToConnection, _context, userId, existing)
    }

    private _handleMessage(msg: UserConfigMessage): void {
        switch (msg.command) {
            case 'submit':
                this._saveUserConfig(msg.payload)
                break
            case 'cancel':
                this.dispose()
                break
        }
    }

    private _saveUserConfig(config: UserConfig): void {
        if (getConnection() === undefined) {
            vscode.window.showWarningMessage(
                'Connect with FileFly: Connect before saving your profile.'
            )
            return
        }

        ;(async () => {
            try {
                // Save to database first. Local settings should only be updated on successful DB sync.
                // On first save userId is undefined — Postgres assigns one via SERIAL and we store it.
                const assignedId = await upsertUser(this._userId, config.displayName, config.color)
                if (this._userId === undefined) {
                    this._userId = assignedId
                    const activeConnectionName = getActiveConnectionName(this._context)
                    if (activeConnectionName) {
                        storeUserId(this._context, activeConnectionName, assignedId)
                    }
                }

                // If user is already active, sync the new display name and color into activeUser immediately
                await updateActiveUserPresence({
                    userId: assignedId,
                    displayName: config.displayName,
                    cursorColor: config.color,
                    colPos: null,
                    rowPos: null,
                    openFilePath: null,
                    highlightStartRow: null,
                    highlightStartCol: null,
                    highlightStopRow: null,
                    highlightStopCol: null,
                })

                await saveActiveConnectionProfile(this._context, config)

                this.dispose()
                vscode.window.showInformationMessage('Profile updated and synced to FileFly database.')
            } catch (err) {
                console.error('Failed to save user config to database:', err)
                vscode.window.showErrorMessage(
                    'Could not save profile to FileFly database. Local profile was not updated.'
                )
            }
        })()
    }

    public dispose(): void {
        this._panel.dispose()
        while (this._disposables.length) {
            this._disposables.pop()?.dispose()
        }
    }
}

/*
Builds the user config HTML, injecting a pre-population script when an
existing config is provided so the form opens with the user's saved values.
 */
function buildUserConfigHtml(extensionUri: vscode.Uri, existing: UserConfig | undefined): string {
    const baseHtml = getUserConfigHtml(extensionUri)

    if (!existing) { return baseHtml }

    const nonceMatch = baseHtml.match(/nonce="([^"]+)"/)
    const nonce = nonceMatch ? nonceMatch[1] : ''

    // Escape any </script> sequences inside the JSON to prevent early tag close
    const safeJson = JSON.stringify(existing).replace(/<\/script>/gi, '<\\/script>')

    const populateScript = `
<script nonce="${nonce}">
(function () {
    var cfg = ${safeJson};
    if (typeof populateConfig === 'function') { populateConfig(cfg); }
}());
</script>`

    return baseHtml.replace('</body>', populateScript + '\n</body>')
}

/*
    placeholder/proof of concept - for now,
    most of this sits until someone else implements
     legit TCP probing or handshakes
*/

class ConnectionDashboardPanel {
    public static readonly viewType = 'filefly.connectionDashboard'

    private readonly _panel: vscode.WebviewPanel
    private readonly _extensionUri: vscode.Uri
    private readonly _disposables: vscode.Disposable[] = []

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel
        this._extensionUri = extensionUri
        this._panel.webview.html = getConnectionDashboardHtml(extensionUri)
        this._panel.onDidDispose(() => this.dispose(), null, this._disposables)
        this._panel.webview.onDidReceiveMessage(
            (msg: DashboardMessage) => this._handleMessage(msg),
            null,
            this._disposables
        )
    }

    public static createOrShow(extensionUri: vscode.Uri): void {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
        const panel = vscode.window.createWebviewPanel(
            ConnectionDashboardPanel.viewType,
            'New FileFly Instance',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'views')]
            }
        )
        new ConnectionDashboardPanel(panel, extensionUri)
    }

    private _handleMessage(msg: DashboardMessage): void {
        switch (msg.command) {
            case 'submit': this._saveConnection(msg.payload); break
            case 'testConnection': this._testConnection(msg.payload); break
            case 'cancel': this.dispose(); break
        }
    }

    private _saveConnection(config: ConnectionConfig): void {
        const existing: ConnectionConfig[] =
            vscode.workspace.getConfiguration('filefly').get('connections') ?? []

        if (existing.some(c => c.connectionName === config.connectionName)) {
            vscode.window.showErrorMessage(
                `FileFly: A connection named "${config.connectionName}" already exists.`
            )
            this._panel.webview.postMessage({ command: 'saveFailed', reason: 'duplicate' })
            return
        }

        const target = connectionTargetKey(config)
        if (existing.some(c => connectionTargetKey(c) === target)) {
            vscode.window.showErrorMessage(
                'FileFly: A saved connection already points to this database target (same host, port, and database).'
            )
            this._panel.webview.postMessage({ command: 'saveFailed', reason: 'duplicate-target' })
            return
        }

        existing.push(config)
        vscode.workspace.getConfiguration('filefly')
            .update('connections', existing, vscode.ConfigurationTarget.Global)
            .then(() => {
                vscode.window.showInformationMessage(
                    `FileFly: Connection "${config.connectionName}" saved successfully.`
                )
                this._panel.webview.postMessage({ command: 'saveSuccess' })
                this.dispose()
            })
    }

    private _testConnection(config: ConnectionConfig): void {
        vscode.window.showInformationMessage(
            `FileFly: Testing connection to ${config.hostname}:${config.port}...`
        )
        this._panel.webview.postMessage({ command: 'testResult', success: true })
    }

    public dispose(): void {
        this._panel.dispose()
        while (this._disposables.length) {
            this._disposables.pop()?.dispose()
        }
    }
}


function iconForStatus(status: ConnectionStatus): vscode.ThemeIcon {
    switch (status) {
        case 'connected': return new vscode.ThemeIcon('database', new vscode.ThemeColor('testing.iconPassed'))
        case 'connecting': return new vscode.ThemeIcon('loading~spin')
        case 'error': return new vscode.ThemeIcon('database', new vscode.ThemeColor('testing.iconFailed'))
        case 'disconnected': return new vscode.ThemeIcon('circle-outline', new vscode.ThemeColor('disabledForeground'))
    }
}

function buildTooltip(config: ConnectionConfig, status: ConnectionStatus): vscode.MarkdownString {
    const label = status.charAt(0).toUpperCase() + status.slice(1)
    const md = new vscode.MarkdownString('', true)
    md.appendMarkdown(`**${config.connectionName}**\n\n`)
    md.appendMarkdown(`$(circle-filled) ${label}\n\n`)
    md.appendMarkdown(`\`${config.username}@${config.hostname}:${config.port}/${config.database}\`\n\n`)
    md.appendMarkdown(`Auth: \`${config.authType}\``)
    return md
}

export class ConnectionItem extends vscode.TreeItem {
    constructor(
        public readonly config: ConnectionConfig,
        public readonly status: ConnectionStatus
    ) {
        super(config.connectionName, vscode.TreeItemCollapsibleState.None)
        this.description = `${config.username}@${config.hostname}:${config.port}/${config.database}`
        this.tooltip=buildTooltip(config, status)
        this.iconPath = iconForStatus(status)

        /*
        contextValue is matched against the when clauses in package.json menus
            to show Connect vs Disconnect in the right context.

         */
        this.contextValue = status === 'connected' ? 'fileflyConnectionActive' : 'fileflyConnection'
    }
}

class ConnectionTreeProvider implements vscode.TreeDataProvider<ConnectionItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<ConnectionItem | undefined | void>()
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event

    private readonly connectionMap = new Map<string, postgres.Sql>()

    // tracks live status for each saved connection by name
    private readonly statusMap = new Map<string, ConnectionStatus>()

    constructor() {
        // refresh the tree whenever the persisted connections list changes
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('filefly.connections')) {
                this._onDidChangeTreeData.fire()
            }
        })
    }

    refresh(): void { this._onDidChangeTreeData.fire() }

    setConnection(connectionName: string, connection: postgres.Sql): void {
        this.connectionMap.set(connectionName, connection)
        this._onDidChangeTreeData.fire()
    }

    clearRuntimeConnection(connectionName: string): void {
        this.connectionMap.delete(connectionName)
        this._onDidChangeTreeData.fire()
    }

    setStatus(connectionName: string, status: ConnectionStatus): void {
        this.statusMap.set(connectionName, status)
        this._onDidChangeTreeData.fire()
    }

    getTreeItem(element: ConnectionItem): vscode.TreeItem { return element }

    getChildren(element?: ConnectionItem): ConnectionItem[] {
        if (element) { return [] }
        const configs: ConnectionConfig[] =
            vscode.workspace.getConfiguration('filefly').get('connections') ?? []
        return configs.map(cfg =>
            new ConnectionItem(cfg, this.statusMap.get(cfg.connectionName) ?? 'disconnected')
        )
    }
}

let currentEditPanel: vscode.WebviewPanel | undefined

class EditConnectionPanel {
    public static createOrShow(
        extensionUri: vscode.Uri,
        config: ConnectionConfig,
        context: vscode.ExtensionContext
    ): void {
        currentEditPanel?.dispose()

        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One
        currentEditPanel = vscode.window.createWebviewPanel(
            'fileflyEditConnection',
            `FileFly - Edit: ${config.connectionName}`,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'views')]
            }
        )
        currentEditPanel.webview.html = buildEditHtml(extensionUri, config)
        currentEditPanel.webview.onDidReceiveMessage(
            (msg: DashboardMessage) => handleEditMessage(msg, config.connectionName),
            undefined,
            context.subscriptions
        )
        currentEditPanel.onDidDispose(() => { currentEditPanel = undefined }, null, context.subscriptions)
    }
}

function handleEditMessage(msg: DashboardMessage, originalName: string): void {
    switch (msg.command) {
        case 'submit': {
            const config = msg.payload
            const settings = vscode.workspace.getConfiguration('filefly')
            const existing: ConnectionConfig[] = settings.get('connections') ?? []

            if (existing.some(c => c.connectionName === config.connectionName && c.connectionName !== originalName)) {
                vscode.window.showErrorMessage(
                    `FileFly: A connection named "${config.connectionName}" already exists.`
                )
                currentEditPanel?.webview.postMessage({ command: 'saveFailed', reason: 'duplicate' })
                return
            }

            const target = connectionTargetKey(config)
            if (existing.some(c => c.connectionName !== originalName && connectionTargetKey(c) === target)) {
                vscode.window.showErrorMessage(
                    'FileFly: Another saved connection already points to this database target (same host, port, and database).'
                )
                currentEditPanel?.webview.postMessage({ command: 'saveFailed', reason: 'duplicate-target' })
                return
            }

            // replace the entry that matches the original name, preserving order.
            settings.update(
                'connections',
                existing.map(c => c.connectionName === originalName ? { ...c, ...config } : c),
                vscode.ConfigurationTarget.Global
            ).then(() => {
                vscode.window.showInformationMessage(
                    `FileFly: Connection "${config.connectionName}" updated successfully.`
                )
                currentEditPanel?.dispose()
            })
            break
        }
        case 'testConnection':
            vscode.window.showInformationMessage(
                `FileFly: Testing connection to ${msg.payload.hostname}:${msg.payload.port}...`
            )
            currentEditPanel?.webview.postMessage({ command: 'testResult', success: true })
            break
        case 'cancel':
            currentEditPanel?.dispose()
            break
    }
}

/*
Takes the base html and injects a script that populates the fields with the provided config values, then calls
and sets the correct visibility for the password field based on auth type
 */
function buildEditHtml(extensionUri: vscode.Uri, config: ConnectionConfig): string {
    const baseHtml = getConnectionDashboardHtml(extensionUri, `Edit Connection: ${config.connectionName}`)
    const nonceMatch = baseHtml.match(/nonce="([^"]+)"/)
    const nonce = nonceMatch ? nonceMatch[1] : ''

    // forces an escape from any script sequences
    const safeJson = JSON.stringify(config).replace(/<\/script>/gi, '<\\/script>')

    const populateScript = `
<script nonce="${nonce}">
(function () {
    var cfg = ${safeJson};
    function setVal(id, val) {
        var el = document.getElementById(id);
        if (el && val !== undefined && val !== null) { el.value = String(val); }
    }
    setVal('connectionName', cfg.connectionName);
    setVal('hostname', cfg.hostname);
    setVal('port', cfg.port);
    setVal('database', cfg.database);
    setVal('serviceName', cfg.serviceName);
    setVal('connectionMode', cfg.connectionMode);
    setVal('authType', cfg.authType);
    setVal('username', cfg.username);
    setVal('password', cfg.password);
    if (typeof handleAuthTypeChange === 'function') { handleAuthTypeChange(cfg.authType); }
}());
</script>`

    return baseHtml.replace('</body>', populateScript + '\n</body>')
}


// basically same functionality from first version, but pre-populates fields and updates an
// existing entry instead of creating a new one
export function activate(context: vscode.ExtensionContext): void {
    _extensionContext = context

    console.log('FileFly extension activated')
    vscode.window.showInformationMessage('FileFly activated. Use the FileFly panel to connect to a database and start syncing files!')

    const treeProvider = new ConnectionTreeProvider()
    let activeConnectionName: string | undefined
    vscode.window.registerTreeDataProvider('fileflyConnections', treeProvider)

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
                    treeProvider.refresh()
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
                        treeProvider.setStatus(activeConnectionName, 'disconnected')
                        treeProvider.clearRuntimeConnection(activeConnectionName)
                    }

                    const connection = await getDatabaseConnection(item.config)
                    if (connection === undefined) {
                        vscode.window.showErrorMessage(`FileFly: Failed to connect to "${item.config.connectionName}"`)
                    } else {
                        activeConnectionName = item.config.connectionName
                        await setActiveConnectionName(context, item.config.connectionName)
                        treeProvider.setConnection(item.config.connectionName, connection)
                        treeProvider.setStatus(item.config.connectionName, 'connected')

                        const needsInitialProfile = !hasSavedUserConfigForConnection(item.config.connectionName)

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

                        if (needsInitialProfile) {
                            UserConfigPanel.createOrShow(context.extensionUri, context, false)
                        }
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
                    treeProvider.clearRuntimeConnection(connectionName)
                    treeProvider.setStatus(connectionName, 'disconnected')
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
                // an explicit refresh guarantees the status map is also cleared for this entry
                treeProvider.setStatus(item.config.connectionName, 'disconnected')

                vscode.window.showInformationMessage(`FileFly: Connection "${item.config.connectionName}" Succesfully Deleted.`)
            }
        ),

        vscode.workspace.onDidCreateFiles(fileCreateListener),

        vscode.workspace.onDidDeleteFiles(fileDeleteListener),

        vscode.workspace.onDidRenameFiles(fileRenameListener),

        vscode.workspace.onDidChangeTextDocument(textDocumentChangeListener)

    )
}


export async function deactivate(): Promise<void> {
    if (_extensionContext) {
        await markCurrentUserInactive(_extensionContext)
    }
}
