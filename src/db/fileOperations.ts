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

    return connection`
        INSERT INTO file (path, mtime, content)
        VALUES (${path}, ${mtime}, ${content})
        ON CONFLICT (path) DO UPDATE SET
            mtime = EXCLUDED.mtime,
            content = EXCLUDED.content
    `
}
