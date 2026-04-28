import { getConnection } from './connectionManagement'


//Inserts Directory into Directory table
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


//Inserts file into file table
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

// Inserts line into line table
export async function upsertLines(path: string, lines: { number: number; content: string }[]): Promise<void> {
    if (lines.length === 0) {
        return
    }
    const connection = getConnection()
    if (connection === undefined) {
        throw "connection is undefined"
    }

    await connection`
        INSERT INTO line ${connection(lines.map((l) => ({ path, number: l.number, content: l.content })))}
        ON CONFLICT (path, number) DO UPDATE SET
            content = EXCLUDED.content
    `
}

// Removes stale lines(lines no longer used) from db
export async function deleteStaleLines(path: string, lineCount: number): Promise<void> {
    const connection = getConnection()
    if (connection === undefined) {
        throw "connection is undefined"
    }

    await connection`
        DELETE FROM line
        WHERE path = ${path}
          AND number >= ${lineCount}
    `
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
