import * as vscode from 'vscode'
import { getConnection } from '../db/connectionManagement'

type DirectoryRow = {
    path: string
}

type FileRow = {
    path: string
    content: string
}

export async function makeWorkspaceFromDatabase(): Promise<void> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length !== 1) {
        throw new Error('makeWorkspaceFromDatabase requires exactly one workspace folder.')
    }

    const connection = getConnection()
    if (!connection) {
        throw new Error('makeWorkspaceFromDatabase requires an active database connection.')
    }

    const rootUri = vscode.workspace.workspaceFolders[0].uri
    const encoder = new TextEncoder()

    const [directoryRows, fileRows] = await Promise.all([
        connection<DirectoryRow[]>`
            SELECT path
            FROM directory
            ORDER BY LENGTH(path) ASC
        `,
        connection<FileRow[]>`
            SELECT path, content
            FROM file
            ORDER BY LENGTH(path) ASC
        `,
    ])

    const rootChildren = await vscode.workspace.fs.readDirectory(rootUri)

    // First clear the workspace root to ensure a clean slate for the rebuild.
    for (const [name] of rootChildren) {
        const childUri = vscode.Uri.joinPath(rootUri, name)
        await vscode.workspace.fs.delete(childUri, {
            recursive: true,
            useTrash: false,
        })
    }

    //rebuild workspace from database, creating directories before files to ensure proper structure for file creation

    for (const directory of directoryRows) {
        if (directory.path === '.') {
            continue
        }

        const relativePath = directory.path.startsWith('./')
            ? directory.path.slice(2)
            : directory.path

        if (!relativePath) {
            continue
        }

        await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, relativePath))
    }

    for (const file of fileRows) {
        const relativePath = file.path.startsWith('./')
            ? file.path.slice(2)
            : file.path

        if (!relativePath) {
            continue
        }

        const targetUri = vscode.Uri.joinPath(rootUri, relativePath)
        const parentPath = relativePath.includes('/')
            ? relativePath.slice(0, relativePath.lastIndexOf('/'))
            : ''

        if (parentPath) {
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, parentPath))
        }

        await vscode.workspace.fs.writeFile(targetUri, encoder.encode(file.content ?? ''))
    }
}
