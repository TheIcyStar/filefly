import * as vscode from 'vscode'

export interface UserConfig {
    displayName: string
    color: string
}

const activeConnectionStateKey = 'filefly.activeConnectionName'

interface ConnectionProfileCarrier {
    connectionName: string
    displayName?: string
    color?: string
}

function getSavedConnections(): ConnectionProfileCarrier[] {
    return vscode.workspace.getConfiguration('filefly').get<ConnectionProfileCarrier[]>('connections') ?? []
}

export function getActiveConnectionName(context: vscode.ExtensionContext): string | undefined {
    return context.globalState.get<string>(activeConnectionStateKey)
}

export function hasSavedUserConfigForConnection(connectionName: string): boolean {
    const connection = getSavedConnections().find((entry) => entry.connectionName === connectionName)
    return Boolean(connection?.displayName?.trim() && connection?.color)
}

export function setActiveConnectionName(context: vscode.ExtensionContext, connectionName: string | undefined): Thenable<void> {
    return context.globalState.update(activeConnectionStateKey, connectionName)
}

export function getActiveConnectionProfile(context: vscode.ExtensionContext): UserConfig | undefined {
    const connectionName = getActiveConnectionName(context)
    if (!connectionName) {
        return undefined
    }

    const connection = getSavedConnections().find((entry) => entry.connectionName === connectionName)
    if (!connection?.displayName?.trim() || !connection?.color) {
        return undefined
    }

    return {
        displayName: connection.displayName,
        color: connection.color,
    }
}

export async function saveActiveConnectionProfile(context: vscode.ExtensionContext, profile: UserConfig): Promise<void> {
    const connectionName = getActiveConnectionName(context)
    if (!connectionName) {
        return
    }

    const connections = getSavedConnections()
    const updatedConnections = connections.map((connection) =>
        connection.connectionName === connectionName
            ? { ...connection, displayName: profile.displayName, color: profile.color }
            : connection
    )

    await vscode.workspace.getConfiguration('filefly').update(
        'connections',
        updatedConnections,
        vscode.ConfigurationTarget.Global
    )
}