
// for consistancy across OS
export function toUnixPath(value: string): string {
    return value.replace(/\\/g, '/')
}

// Generate random 32 character string for security purposes
// Used to comply with VS Code's Content Security Policy (CSP) requirements, which require a unique nonce value to be attached to inline scripts and styles
export function getNonce(): string {
    let text = ''
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length))
    }
    return text
}

// ensures db target (hostname, port, database) are normalized for comparison
export function connectionTargetKey(config: { hostname: string; port: number; database: string }): string {
    return `${config.hostname.trim().toLowerCase()}:${config.port}/${config.database.trim().toLowerCase()}`
}

