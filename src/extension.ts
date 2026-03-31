import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

//types 
//note: largely doesn't work right now and is mostly just
// UI - saving that workload for others.
export interface ConnectionConfig {
    connectionName: string
    authType: string
    username: string
    password: string
    hostname: string
    port: number
    connectionMode: string
    database: string
    serviceName: string
}

type ConnectionStatus = 'disconnected' | 'connected'

type DashboardMessage =
    | { command: 'submit'; payload: ConnectionConfig }
    | { command: 'cancel' }
    | { command: 'testConnection'; payload: ConnectionConfig }


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

function getConnectionDashboardHtml(extensionUri: vscode.Uri, title = 'New FileFly Instance'): string {
    const viewDir = path.join(extensionUri.fsPath, 'dist', 'views', 'connectionEdit')
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
                `A connection named "${config.connectionName}" already exists.`
            )
            this._panel.webview.postMessage({ command: 'saveFailed', reason: 'duplicate' })
            return
        }

        existing.push(config)
        vscode.workspace.getConfiguration('filefly')
            .update('connections', existing, vscode.ConfigurationTarget.Global)
            .then(() => {
                vscode.window.showInformationMessage(
                    `Connection "${config.connectionName}" saved successfully.`
                )
                this._panel.webview.postMessage({ command: 'saveSuccess' })
                this.dispose()
            })
    }

    private _testConnection(config: ConnectionConfig): void {
        vscode.window.showInformationMessage(
            `Testing connection to ${config.hostname}:${config.port}...`
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

class ConnectionItem extends vscode.TreeItem {
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

            // replace the entry that matches the original name, preserving order.
            settings.update(
                'connections',
                existing.map(c => c.connectionName === originalName ? config : c),
                vscode.ConfigurationTarget.Global
            ).then(() => {
                vscode.window.showInformationMessage(
                    `Connection "${config.connectionName}" updated successfully.`
                )
                currentEditPanel?.dispose()
            })
            break
        }
        case 'testConnection':
            vscode.window.showInformationMessage(
                `Testing connection to ${msg.payload.hostname}:${msg.payload.port}...`
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
    const treeProvider = new ConnectionTreeProvider()
    vscode.window.registerTreeDataProvider('fileflyConnections', treeProvider)

    context.subscriptions.push(

        vscode.commands.registerCommand(
            'filefly.newConnection',
            () => ConnectionDashboardPanel.createOrShow(context.extensionUri)
        ),

        vscode.commands.registerCommand(
            'filefly.refreshConnections',
            () => treeProvider.refresh()
        ),

        vscode.commands.registerCommand(
            'filefly.connectConnection',
            (item: ConnectionItem) => {
                treeProvider.setStatus(item.config.connectionName, 'connected')
                vscode.window.showInformationMessage(`Connected to "${item.config.connectionName}"`)
            }
        ),

        vscode.commands.registerCommand(
            'filefly.disconnectConnection',
            (item: ConnectionItem) => {
                treeProvider.setStatus(item.config.connectionName, 'disconnected')
                vscode.window.showInformationMessage(`Disconnected from "${item.config.connectionName}"`)
            }
        ),

        vscode.commands.registerCommand(
            'filefly.editConnection',
            (item: ConnectionItem) =>
                EditConnectionPanel.createOrShow(context.extensionUri, item.config, context)
        ),

        vscode.commands.registerCommand(
            'filefly.deleteConnection',
            async (item: ConnectionItem) => {
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
            }
        )

    )
}

export function deactivate(): void {}
