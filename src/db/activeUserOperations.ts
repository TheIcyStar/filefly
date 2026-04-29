import { getConnection } from './connectionManagement'

// Contains all modifying operations relating to the active User table

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

// Inserts data from presence object into Active User table
export async function updateActiveUserPresence(presence: ActiveUserPresence) {
    const connection = getConnection();
    if (connection === undefined) {
        throw "connection is undefined"
    }

    let openPath = presence.openFilePath
    if (openPath) {
        const rows = await connection`SELECT 1 FROM file WHERE path = ${openPath}`
        if (!rows || rows.length === 0) openPath = null
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


function mapActiveUserResult(result: any): ActiveUserPresence[] {
    console.log('[ActiveUserOperations] Raw DB result:', result);

    let users: any[] = [];
    if (Array.isArray(result)) {
        users = result;
    } else if (result && typeof result === 'object') {
        if (Array.isArray(result.rows)) {
            users = result.rows;
        } else if (typeof result[0] === 'object') {
            users = Object.values(result).filter(v => typeof v === 'object' && v !== null && !Array.isArray(v));
        }
    }

   const mapped = users.map(u => ({
        userId: u.userId ?? u.userid ?? u.user_id,
        displayName: u.displayName ?? u.displayname ?? u.display_name,
        cursorColor: u.cursorColor ?? u.cursorcolor ?? u.cursor_color,
        colPos: u.colPos ?? u.colpos ?? u.col_pos,
        rowPos: u.rowPos ?? u.rowpos ?? u.row_pos,
        openFilePath: u.openFilePath ?? u.openfilepath ?? u.open_file_path,
        highlightStartRow: u.highlightStartRow ?? u.highlightstartrow ?? u.highlight_start_row,
        highlightStartCol: u.highlightStartCol ?? u.highlightstartcol ?? u.highlight_start_col,
        highlightStopRow: u.highlightStopRow ?? u.highlightstoprow ?? u.highlight_stop_row,
        highlightStopCol: u.highlightStopCol ?? u.highlightstopcol ?? u.highlight_stop_col,
    }));

    console.log('[ActiveUserOperations] Mapped users:', mapped);
    return mapped;
}

//For decorations
export async function getActiveUsersOnFile(filePath: string): Promise<ActiveUserPresence[]> {
    const connection = getConnection();
    if (connection === undefined) {
        throw "connection is undefined"
    }

    const result = await connection<any>`
        SELECT *
        FROM activeUser a
        WHERE a.openFilePath = ${filePath}
    `;

    return mapActiveUserResult(result);
}

//For deletes
export async function getActiveUsersOnPath(filePath: string): Promise<ActiveUserPresence[]> {
    const connection = getConnection();
    if (connection === undefined) {
        throw "connection is undefined"
    }

    const likePrefix = `${filePath.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_')}/%`

    const result = await connection<any>`
        SELECT *
        FROM activeUser a
        WHERE a.openFilePath = ${filePath}
           OR a.openFilePath LIKE ${likePrefix} ESCAPE '\\'
    `;

    return mapActiveUserResult(result);
}


// Remove active user from table (in case of disconnect)
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

//Returns array of active users below passed line number.
//Used for enterGuard - RealtimeSync
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

//Returns array of activeUser on a given line number
//Used for lineSelectionGuard - RealtimeSync
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


//Returns all active users
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
