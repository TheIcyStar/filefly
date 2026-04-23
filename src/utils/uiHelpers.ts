import * as vscode from 'vscode'
import { ConnectionConfig, ConnectionItem } from '../extension'


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
