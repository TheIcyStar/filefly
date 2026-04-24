import * as vscode from 'vscode'
import { deleteFile, insertDirectory, insertFile } from '../db/fileOperations'
import { getConnection } from '../db/connectionManagement'
import { getFileContents } from '../utils/fileTracking'
import { isApplyingRemoteSync } from '../utils/syncGuard'

//These listeners act as the primary pushers to the db, it pushes local changes detected to db. Pulls are handled by updateWorkspace.ts.
//This takes care of file creation, deletion, and renaming events, and updates the database accordingly. It also listens for text document changes to push content updates to the database. All listeners are guarded by the "isApplyingRemoteSync" function to prevent write/read loops to db.

export async function fileCreateListener(fileCreateEvent: vscode.FileCreateEvent): Promise<void> {
    //prevent rewriting of files that were created from a pull from the db
   if (isApplyingRemoteSync()) {
        return
    }

    console.log(`[FileFly][create] event received: ${fileCreateEvent.files.length} file(s), guard=${isApplyingRemoteSync()}`)


    const connection = getConnection()
    if (!connection) {
        console.warn('[FileFly][create] skipped: no DB connection')
        vscode.window.showWarningMessage('FileFly: Ignoring create event because no database connection is active.')
        return
    }

    for (const uri of fileCreateEvent.files) {
        const filePath = uri.fsPath
        let relativePath = ''
        try {
            console.log(`[FileFly][create] start: ${filePath}`)

            const stat = await vscode.workspace.fs.stat(uri)

            console.log(`[FileFly][create] stat: type=${stat.type} mtime=${stat.mtime} path=${filePath}`)

            relativePath = vscode.workspace.asRelativePath(uri, false).replaceAll('\\', '/')
            if (!relativePath || relativePath === '.') {
                console.log(`[FileFly][create] skip invalid relative path: ${filePath}`)
                continue
            }

            if (stat.type === vscode.FileType.Directory) {
                console.log(`[FileFly][create] directory insert begin: ${relativePath}`)
                await insertDirectory(relativePath, stat.mtime)
                console.log(`[FileFly][create] directory insert done: ${relativePath}`)
                continue
            }

            if (stat.type !== vscode.FileType.File) {
                console.log(`[FileFly][create] skip unsupported type: ${filePath}`)
                continue
            }

            console.log(`[FileFly][create] reading content: ${relativePath}`)

            const content = await getFileContents(uri)

            console.log(`[FileFly][create] insert begin: ${relativePath}`)

            await insertFile(relativePath, stat.mtime, content ?? '')

            console.log(`[FileFly][create] insert done: ${relativePath}`)
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to insert new file ${filePath}`)
            console.error(`[FileFly][create] failed: ${relativePath || filePath}`, error)
        }
    }
}

export async function fileDeleteListener(fileDeleteEvent: vscode.FileDeleteEvent): Promise<void> {
    if (isApplyingRemoteSync()) {
        return
    }

    const connection = getConnection()
    if (!connection) {
        vscode.window.showWarningMessage('FileFly: Ignoring delete event because no database connection is active.')
        return
    }

    for (const uri of fileDeleteEvent.files) {
        const relativePath = vscode.workspace.asRelativePath(uri, false)
        if (!relativePath || relativePath === '.') {
            continue
        }

        try {
            await deleteFile(relativePath)

            vscode.window.showInformationMessage(`FileFly: Removed "${relativePath}" from database.`)
        } catch (error) {
            vscode.window.showErrorMessage(`FileFly: Failed to delete "${relativePath}" from database.`)
            console.error(`Failed deleting path ${relativePath} from database:`, error)
        }
    }
}

export async function fileRenameListener(fileRenameEvent: vscode.FileRenameEvent): Promise<void> {
    if (isApplyingRemoteSync()) {
        return
    }

    for (const rename of fileRenameEvent.files) {
        const oldRelativePath = vscode.workspace.asRelativePath(rename.oldUri, false)
        const newRelativePath = vscode.workspace.asRelativePath(rename.newUri, false)

        if (!oldRelativePath || oldRelativePath === '.' || !newRelativePath || newRelativePath === '.') {
            continue
        }

        try {
            await deleteFile(oldRelativePath)

            const targetStat = await vscode.workspace.fs.stat(rename.newUri)
            if (targetStat.type === vscode.FileType.Directory) {
                const stack: Array<{ uri: vscode.Uri, relativePath: string }> = [
                    { uri: rename.newUri, relativePath: newRelativePath }
                ]

                while (stack.length > 0) {
                    const current = stack.pop()!
                    const currentStat = await vscode.workspace.fs.stat(current.uri)
                    await insertDirectory(current.relativePath, currentStat.mtime)

                    const children = await vscode.workspace.fs.readDirectory(current.uri)
                    for (const [name, type] of children) {
                        const childUri = vscode.Uri.joinPath(current.uri, name)
                        const childRelativePath = `${current.relativePath}/${name}`

                        if (type === vscode.FileType.Directory) {
                            stack.push({ uri: childUri, relativePath: childRelativePath })
                            continue
                        }

                        const [fileStat, content] = await Promise.all([
                            vscode.workspace.fs.stat(childUri),
                            getFileContents(childUri),
                        ])

                        await insertFile(childRelativePath, fileStat.mtime, content ?? '')
                    }
                }
            } else {
                const [fileStat, content] = await Promise.all([
                    vscode.workspace.fs.stat(rename.newUri),
                    getFileContents(rename.newUri),
                ])

                await insertFile(newRelativePath, fileStat.mtime, content ?? '')
            }

            vscode.window.showInformationMessage(`FileFly: Renamed "${oldRelativePath}" to "${newRelativePath}" in database.`)
        } catch (error) {
            vscode.window.showErrorMessage(`FileFly: Failed to sync rename "${oldRelativePath}" -> "${newRelativePath}".`)
            console.error(`Failed syncing rename ${oldRelativePath} -> ${newRelativePath}:`, error)
        }
    }
}

const _textChangeTimers = new Map<string, ReturnType<typeof setTimeout>>()

export function textDocumentChangeListener(event: vscode.TextDocumentChangeEvent): void {
    if (isApplyingRemoteSync()) {
        return
    }
    if (event.document.uri.scheme !== 'file' || event.contentChanges.length === 0) {
        return
    }
    if (!getConnection()) {
        return
    }

    const uri = event.document.uri
    const key = uri.toString()

    const existing = _textChangeTimers.get(key)
    if (existing) {
        clearTimeout(existing)
    }

    _textChangeTimers.set(key, setTimeout(async () => {
        _textChangeTimers.delete(key)
        try {
            const relativePath = vscode.workspace.asRelativePath(uri, false).replaceAll('\\', '/')
            if (!relativePath || relativePath === '.') {
                return
            }
            const content = event.document.getText()
            const mtime = Date.now()
            await insertFile(relativePath, mtime, content)
        } catch (error) {
            console.error('[FileFly][textChange] failed to push:', error)
        }
    }, 500))
}