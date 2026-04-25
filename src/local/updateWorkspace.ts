import * as vscode from 'vscode'
import { getConnection } from '../db/connectionManagement'
import { FSNode } from '../utils/filetreeDiff'
import { lastKnownLines, pendingLocalPushPaths } from '../listeners/fileListeners'

//Handles pulls from db and applies them to the workspace.

export async function updateWorkspaceFromDiff(nodes: FSNode[]): Promise<void> {
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length !== 1) {
        throw new Error('updateWorkspaceFromDiff requires exactly one workspace folder.')
    }

    const connection = getConnection()
    if (!connection) {
        throw new Error('updateWorkspaceFromDiff requires an active database connection.')
    }

    const rootUri = vscode.workspace.workspaceFolders[0].uri
    const encoder = new TextEncoder()

    const deleteNodes = nodes
        .filter((node) => node.status === 'NEED_DELETE_LOCAL' && node.workspacePath !== '.')
        .sort((left, right) => right.workspacePath.length - left.workspacePath.length)

    for (const node of deleteNodes) {
        const relativePath = node.workspacePath.startsWith('./')
            ? node.workspacePath.slice(2)
            : node.workspacePath
        const targetUri = vscode.Uri.joinPath(rootUri, relativePath)

        try {
            await vscode.workspace.fs.delete(targetUri, { recursive: true, useTrash: false })
        } catch {
            // Path may already be missing locally; ignore.
        }
    }

    const pullNodes = nodes.filter((node) => node.status === 'NEED_PULL' && node.workspacePath !== '.')
    const filePaths = Array.from(new Set(
        pullNodes
            .filter((node) => node.type !== vscode.FileType.Directory)
            .map((node) => node.workspacePath.startsWith('./') ? node.workspacePath.slice(2) : node.workspacePath)
    ))

    const contentByPath = new Map<string, string>()
    for (const filePath of filePaths) {
        const lineRows = await connection<{ content: string }[]>`
            SELECT content
            FROM line
            WHERE path = ${filePath}
            ORDER BY number ASC
        `

        const assembled = lineRows.length > 0
            ? lineRows.map((r) => r.content).join('\n')
            : (await connection<{ content: string }[]>`
                SELECT content FROM file WHERE path = ${filePath} LIMIT 1
              `)[0]?.content ?? ''

        contentByPath.set(filePath, assembled)
        contentByPath.set(`./${filePath}`, assembled)
    }

    const sortedPullNodes = [...pullNodes].sort((left, right) => left.workspacePath.length - right.workspacePath.length)
    for (const node of sortedPullNodes) {
        const relativePath = node.workspacePath.startsWith('./')
            ? node.workspacePath.slice(2)
            : node.workspacePath
        const targetUri = vscode.Uri.joinPath(rootUri, relativePath)

        if (node.type === vscode.FileType.Directory) {
            await vscode.workspace.fs.createDirectory(targetUri)
            continue
        }

        const parentPath = relativePath.includes('/')
            ? relativePath.slice(0, relativePath.lastIndexOf('/'))
            : ''
        if (parentPath) {
            await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(rootUri, parentPath))
        }

        const fileContent = contentByPath.get(node.workspacePath) ?? ''
        const openDocument = vscode.workspace.textDocuments.find((document) => document.uri.toString() === targetUri.toString())

        if (openDocument) {
            // Skip pulling only while a local debounce push is pending for this path.
            // Once the local push flushes, pulls can apply even if the editor is still dirty.
            if (pendingLocalPushPaths.has(relativePath)) {
                continue
            }
            if (openDocument.getText() !== fileContent) {
                const fullDocumentRange = new vscode.Range(
                    openDocument.positionAt(0),
                    openDocument.positionAt(openDocument.getText().length)
                )
                const edit = new vscode.WorkspaceEdit()
                edit.replace(targetUri, fullDocumentRange, fileContent)
                await vscode.workspace.applyEdit(edit)
                await openDocument.save()
            }
            lastKnownLines.set(relativePath, fileContent.split('\n'))
        } else {
            await vscode.workspace.fs.writeFile(targetUri, encoder.encode(fileContent))
            lastKnownLines.set(relativePath, fileContent.split('\n'))
        }

        // Do not write pulled files back to DB here.
        // Pull should be one-way (DB -> local) to avoid mtime/content feedback races.
    }
}