import { getConnection } from './connectionManagement'

export interface ActiveUserPresence {
    userId: number
    displayName: string
    cursorColor: string
    colPos: number | null
    rowPos: number | null
    openFilePath: string | null
    highlightStartRow: number | null
    highlightStartCol: number | null
    highlightStopRow: number | null
    highlightStopCol: number | null
}

export function updateActiveUserPresence(presence: ActiveUserPresence) {
    const connection = getConnection();
    if (connection === undefined) {
        throw "connection is undefined"
    }

    return connection`
        INSERT INTO activeUser
        (userId, displayName, cursorColor, colPos, rowPos, openFilePath, highlightStartRow, highlightStartCol, highlightStopRow, highlightStopCol)
        VALUES
        (${presence.userId}, ${presence.displayName}, ${presence.cursorColor}, ${presence.colPos}, ${presence.rowPos}, ${presence.openFilePath},
         ${presence.highlightStartRow}, ${presence.highlightStartCol}, ${presence.highlightStopRow}, ${presence.highlightStopCol})
        ON CONFLICT (userId) DO UPDATE SET
            displayName = EXCLUDED.displayName,
            cursorColor = EXCLUDED.cursorColor,
            colPos = EXCLUDED.colPos,
            rowPos = EXCLUDED.rowPos,
            openFilePath = EXCLUDED.openFilePath,
            highlightStartRow = EXCLUDED.highlightStartRow,
            highlightStartCol = EXCLUDED.highlightStartCol,
            highlightStopRow = EXCLUDED.highlightStopRow,
            highlightStopCol = EXCLUDED.highlightStopCol
    `;
}


export async function getActiveUsersOnFile(filePath: string): Promise<ActiveUserPresence[]> {
    const connection = getConnection();
    if (connection === undefined) {
        throw "connection is undefined"
    }

    const result = await connection<ActiveUserPresence[]>`
        SELECT *
        FROM activeUser a
        WHERE a.openFilePath = ${filePath}
    `;

    // Some postgres drivers return a wrapper, so force cast to plain array
    return result as unknown as ActiveUserPresence[];
}

export async function removeActiveUser(userId: number) {
    const connection = getConnection();
    if (connection === undefined) {
        throw "connection is undefined"
    }

    return connection`
        DELETE FROM activeUser
        WHERE userId = ${userId}
    `;
}

export async function getActiveUsersBelowLine(filePath: string, lineNumber: number, excludeUserId: number): Promise<ActiveUserPresence[]> {
    const connection = getConnection()
    if (connection === undefined) {
        throw "connection is undefined"
    }

    const result = await connection<ActiveUserPresence[]>`
        SELECT *
        FROM activeUser
        WHERE openFilePath = ${filePath}
          AND rowPos > ${lineNumber}
          AND userId != ${excludeUserId}
    `

    return result
}

export async function getActiveUsersOnLine(filePath: string, lineNumber: number, excludeUserId: number): Promise<ActiveUserPresence[]> {
    const connection = getConnection()
    if (connection === undefined) {
        throw "connection is undefined"
    }

    const result = await connection<ActiveUserPresence[]>`
        SELECT *
        FROM activeUser
        WHERE openFilePath = ${filePath}
          AND rowPos = ${lineNumber}
          AND userId != ${excludeUserId}
    `

    return result
}

export async function getAllActiveUsers() {
    const connection = getConnection();
    if (connection === undefined) {
        throw "connection is undefined"
    }

    const result = await connection`
        SELECT *
        FROM activeUser a
    `;

    return result;
}
