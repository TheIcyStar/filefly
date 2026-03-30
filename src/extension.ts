<<<<<<< HEAD
import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
=======
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
>>>>>>> c12412281b998a02ff7bff4a9e8fe1183e1e59d1

//types 
//note: largely doesn't work right now and is mostly just
// UI - saving that workload for others.
interface ConnectionConfig {
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
<<<<<<< HEAD

    New:
    reads HTML, CSS, and JS from src/views/connectionEdit/ (copied to dist/views/
    by esbuild) and stitches them together
=======
>>>>>>> c12412281b998a02ff7bff4a9e8fe1183e1e59d1
 */
function getNonce(): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

<<<<<<< HEAD
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
=======
function getConnectionDashboardHtml(title = 'New FileFly Instance'): string {
    const nonce = getNonce()
    return /* html */`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
          content="default-src 'none';
                   style-src 'nonce-${nonce}';
                   script-src 'nonce-${nonce}';" />
    <title>${title}</title>
    <style nonce="${nonce}">
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            padding: 20px 24px 40px;
        }

        h1 {
            font-size: 15px;
            font-weight: 600;
            margin-bottom: 16px;
            color: var(--vscode-foreground);
        }

        .section { margin-bottom: 16px; }

        .section-title {
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
        }

        .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 12px;
        }

        .field-full { grid-column: 1 / -1; }

        .field { display: flex; flex-direction: column; gap: 3px; }

        label {
            font-size: 12px;
            color: var(--vscode-foreground);
        }

        .req { color: var(--vscode-notificationsErrorIcon-foreground); }

        input, select {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
            border-radius: 2px;
            padding: 4px 6px;
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            outline: none;
            width: 100%;
        }

        input:focus, select:focus {
            border-color: var(--vscode-focusBorder);
            outline: 1px solid var(--vscode-focusBorder);
            outline-offset: -1px;
        }

        input.error, select.error {
            border-color: var(--vscode-notificationsErrorIcon-foreground);
        }

        .field-error {
            font-size: 11px;
            color: var(--vscode-notificationsErrorIcon-foreground);
            display: none;
        }

        .field-error.visible { display: block; }

        .password-wrap { position: relative; }
        .password-wrap input { padding-right: 28px; }

        .password-toggle {
            position: absolute;
            right: 5px;
            top: 50%;
            transform: translateY(-50%);
            background: none;
            border: none;
            cursor: pointer;
            padding: 2px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            align-items: center;
        }

        .password-toggle:hover { color: var(--vscode-foreground); }
        .password-toggle svg { width: 13px; height: 13px; }

        hr {
            border: none;
            border-top: 1px solid var(--vscode-panel-border);
            margin: 16px 0;
        }

        .test-banner {
            display: none;
            font-size: 12px;
            padding: 5px 0;
            margin-bottom: 8px;
        }

        .test-banner.visible { display: block; }
        .test-banner.success { color: var(--vscode-testing-iconPassed, #3dca79); }
        .test-banner.failure { color: var(--vscode-notificationsErrorIcon-foreground); }
        .test-banner.pending { color: var(--vscode-descriptionForeground); }

        .actions {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
        }

        button {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            padding: 4px 12px;
            border-radius: 2px;
            cursor: pointer;
            border: 1px solid var(--vscode-button-border, transparent);
        }

        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: transparent;
        }

        .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }

        .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .btn-secondary:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-ghost {
            background: transparent;
            color: var(--vscode-foreground);
            border-color: var(--vscode-panel-border);
        }

        .btn-ghost:hover { background: var(--vscode-list-hoverBackground); }

        .validation-summary {
            display: none;
            font-size: 12px;
            color: var(--vscode-notificationsErrorIcon-foreground);
            margin-bottom: 12px;
        }

        .validation-summary.visible { display: block; }
        .validation-summary ul { padding-left: 16px; margin-top: 3px; }
    </style>
</head>
<body>

    <h1>${title}</h1>

    <div class="validation-summary" id="validationSummary">
        Please fix the following before saving:
        <ul id="validationList"></ul>
    </div>

    <div class="section">
        <div class="section-title">Connection Name</div>
        <div class="grid">
            <div class="field field-full">
                <label>Name <span class="req">*</span></label>
                <input type="text" id="connectionName" placeholder="e.g. Production DB" autocomplete="off" spellcheck="false" />
                <span class="field-error" id="err-connectionName">Connection name is required.</span>
            </div>
        </div>
    </div>

    <hr />

    <div class="section">
        <div class="section-title">Server</div>
        <div class="grid">
            <div class="field">
                <label>Hostname <span class="req">*</span></label>
                <input type="text" id="hostname" placeholder="localhost" autocomplete="off" spellcheck="false" />
                <span class="field-error" id="err-hostname">Hostname is required.</span>
            </div>
            <div class="field">
                <label>Port <span class="req">*</span></label>
                <input type="number" id="port" min="1" max="65535" value="5432" />
                <span class="field-error" id="err-port">Port must be 1-65535.</span>
            </div>
            <div class="field">
                <label>Database <span class="req">*</span></label>
                <input type="text" id="database" placeholder="postgres" autocomplete="off" spellcheck="false" />
                <span class="field-error" id="err-database">Database is required.</span>
            </div>
            <div class="field">
                <label>Service name</label>
                <input type="text" id="serviceName" placeholder="optional" autocomplete="off" spellcheck="false" />
            </div>
            <div class="field field-full">
                <label>Connection type</label>
                <select id="connectionMode">
                    <option value="tcp">TCP/IP</option>
                    <option value="socket">Unix Domain Socket</option>
                </select>
            </div>
        </div>
    </div>

    <hr />

    <div class="section">
        <div class="section-title">Authentication</div>
        <div class="grid">
            <div class="field field-full">
                <label>Authentication type</label>
                <select id="authType">
                    <option value="password">Password</option>
                    <option value="scram-sha-256">SCRAM-SHA-256</option>
                    <option value="trust">Trust (no password)</option>
                </select>
            </div>
            <div class="field">
                <label>Username <span class="req">*</span></label>
                <input type="text" id="username" placeholder="postgres" autocomplete="username" spellcheck="false" />
                <span class="field-error" id="err-username">Username is required.</span>
            </div>
            <div class="field" id="field-password">
                <label>Password</label>
                <div class="password-wrap">
                    <input type="password" id="password" placeholder="••••••••" autocomplete="current-password" />
                    <button type="button" id="pwToggle" class="password-toggle" aria-label="Show/hide password">
                        <svg id="eyeIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    </div>

    <hr />

    <div class="test-banner" id="testBanner">
        <span id="testMessage"></span>
    </div>

    <div class="actions">
        <button id="btnCancel" class="btn-ghost">Cancel</button>
        <button class="btn-secondary" id="btnTest">Test Connection</button>
        <button class="btn-primary" id="btnSave">Save</button>
    </div>

<script nonce="${nonce}">
    const vscode = acquireVsCodeApi()

    function togglePasswordVisibility() {
        const input = document.getElementById('password')
        const icon = document.getElementById('eyeIcon')
        const isHidden = input.type === 'password'
        input.type = isHidden ? 'text' : 'password'
        icon.innerHTML = isHidden
            ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
            : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
    }

    function handleAuthTypeChange(value) {
        document.getElementById('field-password').style.display =
            value === 'trust' ? 'none' : ''
    }

    const REQUIRED_FIELDS = [
        { id: 'connectionName', errId: 'err-connectionName', label: 'Connection Name' },
        { id: 'hostname', errId: 'err-hostname', label: 'Hostname' },
        { id: 'port', errId: 'err-port', label: 'Port' },
        { id: 'database', errId: 'err-database', label: 'Database' },
        { id: 'username', errId: 'err-username', label: 'Username' },
    ]

    function clearErrors() {
        REQUIRED_FIELDS.forEach(function(f) {
            document.getElementById(f.id).classList.remove('error')
            document.getElementById(f.errId).classList.remove('visible')
        })
        document.getElementById('validationSummary').classList.remove('visible')
    }

    function validateAll() {
        clearErrors()
        const errors = []
        const authType = document.getElementById('authType').value

        REQUIRED_FIELDS.forEach(function(f) {
            if (f.id === 'username' && authType === 'trust') return

            const el = document.getElementById(f.id)
            const value = el.value.trim()

            if (!value) {
                el.classList.add('error')
                document.getElementById(f.errId).classList.add('visible')
                errors.push(f.label + ' is required.')
                return
            }

            if (f.id === 'port') {
                const port = parseInt(value, 10)
                if (isNaN(port) || port < 1 || port > 65535) {
                    el.classList.add('error')
                    document.getElementById(f.errId).classList.add('visible')
                    errors.push('Port must be between 1 and 65535.')
                    return
                }
            }
        })

        if (errors.length > 0) {
            const summary = document.getElementById('validationSummary')
            document.getElementById('validationList').innerHTML =
                errors.map(function(e) { return '<li>' + e + '</li>' }).join('')
            summary.classList.add('visible')
        }

        return errors.length === 0
    }

    function collectPayload() {
        return {
            connectionName: document.getElementById('connectionName').value.trim(),
            authType: document.getElementById('authType').value,
            username: document.getElementById('username').value.trim(),
            password: document.getElementById('password').value,
            hostname: document.getElementById('hostname').value.trim(),
            port: parseInt(document.getElementById('port').value, 10),
            connectionMode: document.getElementById('connectionMode').value,
            database: document.getElementById('database').value.trim(),
            serviceName: document.getElementById('serviceName').value.trim(),
        }
    }

    function handleSubmit() {
        if (!validateAll()) return
        document.getElementById('btnSave').disabled = true
        vscode.postMessage({ command: 'submit', payload: collectPayload() })
    }

    function handleTestConnection() {
        if (!validateAll()) return
        const banner = document.getElementById('testBanner')
        const message = document.getElementById('testMessage')
        const payload = collectPayload()

        banner.className = 'test-banner visible pending'
        message.textContent = 'Connecting to ' + payload.hostname + ':' + payload.port + '\u2026'
        document.getElementById('btnTest').disabled = true

        vscode.postMessage({ command: 'testConnection', payload: payload })
    }

    function handleCancel() {
        vscode.postMessage({ command: 'cancel' })
    }

    window.addEventListener('message', function(event) {
        const msg = event.data
        const banner = document.getElementById('testBanner')
        const message = document.getElementById('testMessage')

        if (msg.command === 'testResult') {
            document.getElementById('btnTest').disabled = false
            if (msg.success) {
                banner.className = 'test-banner visible success'
                message.textContent = 'Connection successful.'
            } else {
                banner.className = 'test-banner visible failure'
                message.textContent = msg.error || 'Could not reach the server. Check host and port.'
            }
        }

        if (msg.command === 'saveFailed') {
            document.getElementById('btnSave').disabled = false
        }
    })

    document.getElementById('authType').addEventListener('change', function() { handleAuthTypeChange(this.value) })
    document.getElementById('pwToggle').addEventListener('click', togglePasswordVisibility)
    document.getElementById('btnSave').addEventListener('click', handleSubmit)
    document.getElementById('btnTest').addEventListener('click', handleTestConnection)
    document.getElementById('btnCancel').addEventListener('click', handleCancel)
</script>
</body>
</html>`
>>>>>>> c12412281b998a02ff7bff4a9e8fe1183e1e59d1
}

/*
    placeholder/proof of concept - for now, 
    most of this sits until someone else implements
<<<<<<< HEAD
    legit TCP probing or handshakes
=======
     legit TCP probing or handshakes
>>>>>>> c12412281b998a02ff7bff4a9e8fe1183e1e59d1
*/

class ConnectionDashboardPanel {
    public static readonly viewType = 'filefly.connectionDashboard'

    private readonly _panel: vscode.WebviewPanel
<<<<<<< HEAD
    private readonly _extensionUri: vscode.Uri
    private readonly _disposables: vscode.Disposable[] = []

    private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
        this._panel = panel
        this._extensionUri = extensionUri
        this._panel.webview.html = getConnectionDashboardHtml(extensionUri)
=======
    private readonly _disposables: vscode.Disposable[] = []

    private constructor(panel: vscode.WebviewPanel) {
        this._panel = panel
        this._panel.webview.html = getConnectionDashboardHtml()
>>>>>>> c12412281b998a02ff7bff4a9e8fe1183e1e59d1
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
<<<<<<< HEAD
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'views')]
            }
        )
        new ConnectionDashboardPanel(panel, extensionUri)
=======
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        )
        new ConnectionDashboardPanel(panel)
>>>>>>> c12412281b998a02ff7bff4a9e8fe1183e1e59d1
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
<<<<<<< HEAD
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'dist', 'views')]
            }
        )
        currentEditPanel.webview.html = buildEditHtml(extensionUri, config)
=======
                localResourceRoots: [vscode.Uri.joinPath(extensionUri, 'media')]
            }
        )
        currentEditPanel.webview.html = buildEditHtml(config)
>>>>>>> c12412281b998a02ff7bff4a9e8fe1183e1e59d1
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
<<<<<<< HEAD
function buildEditHtml(extensionUri: vscode.Uri, config: ConnectionConfig): string {
    const baseHtml = getConnectionDashboardHtml(extensionUri, `Edit Connection: ${config.connectionName}`)
=======
function buildEditHtml(config: ConnectionConfig): string {
    const baseHtml = getConnectionDashboardHtml(`Edit Connection: ${config.connectionName}`)
>>>>>>> c12412281b998a02ff7bff4a9e8fe1183e1e59d1
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

<<<<<<< HEAD
// basically same functionality from first version, but pre-populates fields and updates an 
// existing entry instead of creating a new one

=======
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
>>>>>>> c12412281b998a02ff7bff4a9e8fe1183e1e59d1
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

<<<<<<< HEAD
export function deactivate(): void {}
=======
// This method is called when your extension is deactivated
export function deactivate(): void {}
>>>>>>> c12412281b998a02ff7bff4a9e8fe1183e1e59d1
