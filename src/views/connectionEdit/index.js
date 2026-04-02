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

/*
 * Kept as a named function because buildEditHtml's injected populate script
 * calls handleAuthTypeChange(cfg.authType) by name after setting field values.
 */
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