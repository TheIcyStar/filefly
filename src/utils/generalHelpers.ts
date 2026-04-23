
// for consistancy across OS
export function toUnixPath(value: string): string {
    return value.replace(/\\/g, '/')
}

// ensures db target (hostname, port, database) are normalized for comparison
export function connectionTargetKey(config: { hostname: string; port: number; database: string }): string {
    return `${config.hostname.trim().toLowerCase()}:${config.port}/${config.database.trim().toLowerCase()}`
}

