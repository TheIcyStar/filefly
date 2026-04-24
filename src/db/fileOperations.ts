import { getConnection } from './connectionManagement'

export function insertDirectory(path: string, mtime: number) {
    const connection = getConnection()
    if (connection === undefined) {
        throw "connection is undefined"
    }

    return connection`
        INSERT INTO directory (path, mtime)
        VALUES (${path}, ${mtime})
        ON CONFLICT (path) DO UPDATE SET
            mtime = EXCLUDED.mtime
    `
}

export function insertFile(path: string, mtime: number, content: string) {
    const connection = getConnection()
    if (connection === undefined) {
        throw "connection is undefined"
    }

    console.log(`[FileFly][db] insertFile begin: ${path} (mtime=${mtime}, size=${content.length})`)
    const query = connection`
        INSERT INTO file (path, mtime, content)
        VALUES (${path}, ${mtime}, ${content})
        ON CONFLICT (path) DO UPDATE SET
            mtime = EXCLUDED.mtime,
            content = EXCLUDED.content
        WHERE EXCLUDED.mtime >= file.mtime
    `

    query
        .then(() => console.log(`[FileFly][db] insertFile done: ${path}`))
        .catch((error) => console.error(`[FileFly][db] insertFile failed: ${path}`, error))

    return query
}

export async function deleteFile(path: string): Promise<void> {
    const connection = getConnection()
    if (connection === undefined) {
        throw "connection is undefined"
    }

    const likePrefix = `${path.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}/%`

    await connection`
        UPDATE activeUser
        SET openFilePath = NULL
        WHERE openFilePath = ${path}
           OR openFilePath LIKE ${likePrefix} ESCAPE '\\'
    `

    await connection`
        DELETE FROM openFile
        WHERE filePath = ${path}
           OR filePath LIKE ${likePrefix} ESCAPE '\\'
    `

    await connection`
        DELETE FROM file
        WHERE path = ${path}
           OR path LIKE ${likePrefix} ESCAPE '\\'
    `

    await connection`
        DELETE FROM directory
        WHERE path = ${path}
           OR path LIKE ${likePrefix} ESCAPE '\\'
    `
}
