
import * as fs from 'fs'
import * as path from 'path'
import { connectionTargetKey, getNonce } from './generalHelpers'
import * as vscode from 'vscode'



import { upsertUser } from '../db/userOperations'
import { updateActiveUserPresence } from '../db/activeUserOperations'
import { getActiveConnectionProfile, getActiveConnectionName, saveActiveConnectionProfile } from './profileConnectionState'
import { getStoredUserId, storeUserId } from '../extension'
import { getConnection } from '../db/connectionManagement'
import type { UserConfig } from './profileConnectionState'
import postgres from 'postgres'





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

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export type DashboardMessage =
    | { command: 'submit'; payload: ConnectionConfig }
    | { command: 'cancel' }
    | { command: 'testConnection'; payload: ConnectionConfig }

export type UserConfigMessage =
    | { command: 'submit'; payload: UserConfig }
    | { command: 'cancel' }



// UserConfigPanel class moved from extension.ts
export class UserConfigPanel {
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

// buildUserConfigHtml moved from extension.ts
export function buildUserConfigHtml(extensionUri: vscode.Uri, existing: UserConfig | undefined): string {
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

export class ConnectionDashboardPanel {
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


let currentEditPanel: vscode.WebviewPanel | undefined

export class EditConnectionPanel {
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




// Loads and stitches together HTML, CSS, and JS for a webview, injecting nonce and title
export function loadView(extensionUri: vscode.Uri, viewName: string, title: string): string {
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

export function getConnectionDashboardHtml(extensionUri: vscode.Uri, title = 'New FileFly Instance'): string {
    return loadView(extensionUri, 'connectionEdit', title)
}

export function getUserConfigHtml(extensionUri: vscode.Uri, title = 'Your Profile'): string {
    return loadView(extensionUri, 'userConfig', title)
}

//Dropdown with current connections, returns selected connection
export async function showUserConnectionPicker(placeHolder: string): Promise<ConnectionItem | undefined> {
    const configs: ConnectionConfig[] =
        vscode.workspace.getConfiguration('filefly').get('connections') ?? []

    if (configs.length === 0) {
        vscode.window.showErrorMessage(`FileFly: No saved FileFly connections available. Create a new connection using the "FileFly: New Multiplayer Connection" command.`)
        return undefined
    }

    const picked = await vscode.window.showQuickPick(
        configs.map(cfg => ({
            label: cfg.connectionName,
            description: `${cfg.hostname}:${cfg.port}/${cfg.database}`,
            config: cfg,
        })),
        { placeHolder }
    )

    return picked ? new ConnectionItem(picked.config, 'disconnected') : undefined
}
