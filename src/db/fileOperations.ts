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

export async function touchFileMtime(path: string, mtime: number): Promise<void> {
    const connection = getConnection()
    if (connection === undefined) {
        throw "connection is undefined"
    }

    await connection`
        UPDATE file
        SET mtime = ${mtime}
        WHERE path = ${path}
    `
}

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

export async function applyLineNumberShift(path: string, startLine: number, delta: number): Promise<void> {
    if (delta === 0) {
        return
    }
    if (delta < 0) {
        throw new Error('applyLineNumberShift only supports positive deltas.')
    }

    const connection = getConnection()
    if (connection === undefined) {
        throw "connection is undefined"
    }

    const tempOffset = 1000000000

    await connection.begin(async (tx) => {
        // Move the affected rows out of the way first to avoid UNIQUE(path, number) collisions.
        await tx.unsafe(
            `
                UPDATE line
                SET number = number + $1
                WHERE path = $2
                  AND number >= $3
            `,
            [tempOffset, path, startLine]
        )

        await tx.unsafe(
            `
                UPDATE line
                SET number = number - $1 + $2
                WHERE path = $3
                  AND number >= $4
            `,
            [tempOffset, delta, path, startLine + tempOffset]
        )
    })
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
