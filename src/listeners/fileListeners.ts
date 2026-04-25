import * as vscode from 'vscode'
import { applyLineNumberShift, deleteFile, deleteStaleLines, insertDirectory, insertFile, upsertLines } from '../db/fileOperations'
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
const _pendingContentChanges = new Map<string, vscode.TextDocumentContentChangeEvent[]>()
export const pendingLocalPushPaths = new Set<string>()
export const lastKnownLines = new Map<string, string[]>()

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
    const relativePath = vscode.workspace.asRelativePath(uri, false).replaceAll('\\', '/')
    if (!relativePath || relativePath === '.') {
        return
    }

    const existing = _textChangeTimers.get(key)
    if (existing) {
        clearTimeout(existing)
    }

    const pendingChanges = _pendingContentChanges.get(key) ?? []
    pendingChanges.push(...event.contentChanges)
    _pendingContentChanges.set(key, pendingChanges)

    // Mark this path as having a pending local push while debounce is active.
    pendingLocalPushPaths.add(relativePath)

    _textChangeTimers.set(key, setTimeout(async () => {
        _textChangeTimers.delete(key)
        try {
            const content = event.document.getText()
            const mtime = Date.now()
            const newLines = content.split('\n')
            const prevLines = lastKnownLines.get(relativePath)
            const debouncedChanges = _pendingContentChanges.get(key) ?? []

            console.log(`[FileFly][textChange] push begin: ${relativePath} lines=${newLines.length} changes=${debouncedChanges.length} firstPush=${prevLines === undefined}`)

            if (prevLines === undefined) {
                // First push for this file: full insert + seed line cache
                console.log(`[FileFly][textChange] first push: writing ${newLines.length} lines to ${relativePath}`)
                await insertFile(relativePath, mtime, content)
                await upsertLines(relativePath, newLines.map((c, i) => ({ number: i, content: c })))
                await deleteStaleLines(relativePath, newLines.length)
            } else {
                // For newline insertions, shift all DB lines after the insertion boundary
                // by the number of new lines created so line numbers stay aligned.
                const structuralInserts = [...debouncedChanges]
                    .map((change) => {
                        const removedLineCount = change.range.end.line - change.range.start.line
                        const addedLineCount = change.text.split('\n').length - 1
                        return {
                            change,
                            delta: addedLineCount - removedLineCount,
                        }
                    })
                    .filter((item) => item.delta > 0)
                    .sort((left, right) => {
                        if (right.change.range.end.line !== left.change.range.end.line) {
                            return right.change.range.end.line - left.change.range.end.line
                        }
                        return right.change.range.end.character - left.change.range.end.character
                    })

                if (structuralInserts.length > 0) {
                    console.log(`[FileFly][textChange] ${structuralInserts.length} structural insert(s) detected for ${relativePath}`)
                }
                for (const item of structuralInserts) {
                    const shiftStartLine = item.change.range.end.line + 1
                    console.log(`[FileFly][textChange] shift: ${relativePath} startLine=${shiftStartLine} delta=+${item.delta} (range ${item.change.range.start.line}:${item.change.range.start.character}-${item.change.range.end.line}:${item.change.range.end.character})`)
                    await applyLineNumberShift(relativePath, shiftStartLine, item.delta)
                    console.log(`[FileFly][textChange] shift done: ${relativePath} startLine=${shiftStartLine}`)
                }

                // Incremental content updates after structural shifts.
                const changed: { number: number; content: string }[] = []
                for (let i = 0; i < newLines.length; i++) {
                    if (prevLines[i] !== newLines[i]) {
                        changed.push({ number: i, content: newLines[i] })
                    }
                }
                console.log(`[FileFly][textChange] upsert: ${changed.length} changed line(s) in ${relativePath}`)
                await upsertLines(relativePath, changed)

                if (newLines.length < prevLines.length) {
                    const trimCount = prevLines.length - newLines.length
                    console.log(`[FileFly][textChange] trim: removing ${trimCount} stale tail line(s) from ${relativePath} (keeping 0-${newLines.length - 1})`)
                    await deleteStaleLines(relativePath, newLines.length)
                }
                await insertFile(relativePath, mtime, content)
            }

            lastKnownLines.set(relativePath, newLines)
        } catch (error) {
            console.error('[FileFly][textChange] failed to push:', error)
        } finally {
            _pendingContentChanges.delete(key)
            if (!_textChangeTimers.has(key)) {
                pendingLocalPushPaths.delete(relativePath)
            }
        }
    }, 500))
}