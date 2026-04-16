import * as vscode from 'vscode'
import { FileType } from 'vscode'
import { getConnection } from '../db/connectionManagement'

export type FSNode = FileNode | DirectoryNode
type FileNode = {
    workspacePath: string, // unix-style path stored in DB. root folder is "."
    uri: vscode.Uri // full system path, platform dependant
    parent: DirectoryNode,
    status: SyncStatus,
    mtime?: number, //last modified
    type: FileType.File | FileType.SymbolicLink | FileType.Unknown,
}
type DirectoryNode = {
    workspacePath: string,
    uri: vscode.Uri
    parent?: DirectoryNode, //Only root has no parent
    status: SyncStatus,
    mtime?: number,
    type: FileType.Directory,
    children: FSNode[]
}

type FSNodeDBSchema = {
    path: string,
    mtime: number
}

/*
  SyncStatus is from the perspective of the client, holds what should be done about a particular file or directory

  OK: Client and Server have identical files
  NEED_PUSH: Client has a newer file; create/overwrite file on server
  NEED_PULL: Server has a newer file; createoverwrite file on client

    For Files:
        Local == Remote  ->  OK
        Local >  Remote  ->  NEED_PUSH
        Local <  Remote  ->  NEED_PULL

    If one of the mtimes are missing (i.e. file does not exist), we look at the parent directory
    If the directory doesn't exist, keep going up directories until we find one
    If a directory is now a file instead, just read the mtime anyway

    Local file exists, remote file does not:
        local dir > remote dir  ->  NEED_PUSH on all local files in dir
        local dir < remote dir  ->  NEED_DELETE_LOCAL on dir

    local file does not exist, remote file does:
        local dir > remote dir  ->  NEED_DELETE_REMOTE
        local dir < remote dir  ->  NEED_PULL on all files in remote dir

*/
export type SyncStatus = "OK" | "NEED_PUSH" | "NEED_PULL" | "NEED_DELETE_LOCAL" | "NEED_DELETE_REMOTE" | "UNKNOWN"

/**
 * Builds an array of files and directories that are out of sync
 * Will return an empty array of changes if there is no database connection
 * @returns fileDiffs array of FSNodes with a status that isn't "OK" or "UNKNOWN"
 */
export async function getWorkspaceTreeDiff(): Promise<FSNode[]> {
    const db = getConnection()
    if(!db){
        console.log("Not connected to database")
        return []
    }
    if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length != 1) {
        //TODO: disconnect from DB here, we're supporting only one workspace folder
        return []
    }

    const fileIOPromises = []
    //Note that the same nodes are effectively stored in several data structures
    const fileDiffs: FSNode[] = [] //Nodes NOT with "UNKNOWN" or "OK" as their status; this is what gets returned
    const nodeMap = new Map<string, FSNode>() // vscode.Uri.path keys, node values
    const unknownNodes = new Map<string, FSNode>() //workspacePath keys, Node values

    const dbFilesMap = new Map<string, number>() // Path keys, mtime values

    const rootNode: DirectoryNode = {
        workspacePath: ".",
        uri: vscode.workspace.workspaceFolders[0].uri,
        status: "UNKNOWN",
        type: FileType.Directory,
        children: [],
    }
    nodeMap.set(rootNode.workspacePath, rootNode)
    fileIOPromises.push(
        vscode.workspace.fs.stat(rootNode.uri).then((fileInfo) => {
            rootNode.mtime = fileInfo.mtime
        })
    )


    // Use DFS to traverse the workspace folder
    const stack = [rootNode]
    while (stack.length > 0) {
        const thisNode = stack.pop()!
        if (thisNode.type == FileType.Directory) {
            const children = await vscode.workspace.fs.readDirectory(thisNode.uri)

            for (const child of children) {
                let newChildNode: FSNode

                if (child[1] == FileType.Directory) {
                    newChildNode = {
                        workspacePath: thisNode.workspacePath + "/" + child[0],
                        uri: vscode.Uri.joinPath(thisNode.uri, child[0]),
                        parent: thisNode,
                        status: "UNKNOWN",
                        type: FileType.Directory,
                        children: [],
                    } as DirectoryNode

                    stack.push(newChildNode)
                } else {
                    newChildNode = {
                        workspacePath: thisNode.workspacePath + "/" + child[0],
                        uri: vscode.Uri.joinPath(thisNode.uri, child[0]),
                        parent: thisNode,
                        status: "UNKNOWN",
                        type: child[1]
                    } as FileNode
                }

                //kick off the metadata read but don't wait for it until later
                fileIOPromises.push(
                    vscode.workspace.fs.stat(newChildNode.uri).then((fileInfo) => {
                        newChildNode.mtime = fileInfo.mtime
                    })
                )
                thisNode.children.push(newChildNode)
                nodeMap.set(newChildNode.workspacePath, newChildNode)
                unknownNodes.set(newChildNode.workspacePath, newChildNode)
            }
        }
    }

    const remoteFilePromise = db<FSNodeDBSchema[]>`
        SELECT path, mtime FROM file
        UNION ALL
        SELECT path, mtime from directory
    `

    //COALESCE(file.path, directory.path) AS path,
    //COALESCE(file.mtime, directory.mtime) AS mtime

    // wait for all of the file reads and database query to finish
    await Promise.allSettled(fileIOPromises)

    const dbFiles = await remoteFilePromise

    for(const dbFile of dbFiles){
        dbFilesMap.set(dbFile.path, dbFile.mtime);
    }

    for(const dbFile of dbFiles){
        const localNode = nodeMap.get(dbFile.path)

        if(localNode){ //Local and remote file exists
            if(localNode.mtime! == dbFile.mtime){
                // localNode.status = "OK"
            } else if(localNode.mtime! > dbFile.mtime) {
                localNode.status = "NEED_PUSH"
                fileDiffs.push(localNode)
            } else if(localNode.mtime! < dbFile.mtime) {
                localNode.status = "NEED_PULL"
                fileDiffs.push(localNode)
            }


            // if(localNode.type !== FileType.Directory){
            //     nodeMap.delete(dbFile.path)
            // }
            unknownNodes.delete(dbFile.path)

        } else { //local file does not exist, remote file does
            //Go up directories until we find one that exists
            let nextParentPath = dbFile.path.substring(0, dbFile.path.lastIndexOf("/"))
            while(!nodeMap.has(nextParentPath)){
                if(nextParentPath === "."){
                    console.error(`getWorkspaceTreeDiff(): Failed to find any matching parent directories for ${dbFile.path} locally`)
                    break //shouldn't hit this because root exists, but I don't like this potential infinite while if something goes wrong
                }
                nextParentPath = nextParentPath.substring(0, nextParentPath.lastIndexOf("/"))
            }

            const localParent: DirectoryNode = nodeMap.get(nextParentPath) as DirectoryNode
            const remoteParentMtime: number = dbFilesMap.get(nextParentPath)!

            if(localParent.mtime! > remoteParentMtime){
                localParent.status = "NEED_DELETE_REMOTE"
                fileDiffs.push(localParent)

            } else if(localParent.mtime! < remoteParentMtime){
                const newNode = {
                    workspacePath: dbFile.path,
                    uri: vscode.Uri.joinPath(rootNode.uri, dbFile.path),
                    parent: localParent,
                    status: "NEED_PULL",
                    type: FileType.File
                } as FileNode
                localParent.children.push(newNode)
                nodeMap.set(dbFile.path, newNode)
                fileDiffs.push(newNode)
            } else {
                console.error(`getWorkspaceTreeDiff(): Sync error for (remote) ${dbFile.path}: ${nextParentPath} has same mtime locally and remotely! Can't decide what to sync`)

            }
        }
    }

    //handle leftover local files that had no db entries
    //We also stop deleting unknownNodes here
    const needPushDirectories: string[] = []
    for(const [curNodePath, curNode] of unknownNodes.entries()){
        //If the file is part of a directory that has status=NEEDS_PUSH, add it immediately
        if(needPushDirectories.some((dirName) => curNodePath.startsWith(dirName))){
            curNode.status = "NEED_PUSH"
            fileDiffs.push(curNode)
            continue
        }


        let nextParentPath = curNodePath.substring(0, curNodePath.lastIndexOf("/"))
        while(!dbFilesMap.has(nextParentPath)){
            if(nextParentPath === "."){
                console.error(`getWorkspaceTreeDiff(): Failed to find any matching parent directories for ${curNodePath} in database`)
                break //shouldn't hit this because root exists
            }
            nextParentPath = nextParentPath.substring(0, nextParentPath.lastIndexOf("/"))
        }

        const localParent: DirectoryNode = nodeMap.get(nextParentPath) as DirectoryNode
        const remoteParentMtime: number | undefined = dbFilesMap.get(nextParentPath)

        if(!remoteParentMtime || localParent.mtime! > remoteParentMtime) {
            //NEED_PUSH on all files
            curNode.status = "NEED_PUSH"
            fileDiffs.push(curNode)
            needPushDirectories.push(localParent.workspacePath)

        } else if(localParent.mtime! < remoteParentMtime) {
            localParent.status = "NEED_DELETE_LOCAL"

        } else {
            console.error(`getWorkspaceTreeDiff(): Sync error for (local) ${curNodePath}: "${nextParentPath}" has same mtime locally and remotely! Can't decide what to sync`)
        }
    }

    return fileDiffs
}