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

    const result = await connection<any>`
        SELECT *
        FROM activeUser a
        WHERE a.openFilePath = ${filePath}
    `;

    console.log('[ActiveUserOperations] Raw DB result:', result);

    // Try to extract the array of user objects from the Result object
    let users: any[] = [];
    if (Array.isArray(result)) {
        users = result;
    } else if (result && typeof result === 'object') {
        // Try common properties
        if (Array.isArray(result.rows)) {
            users = result.rows;
        } else if (typeof result[0] === 'object') {
            users = Object.values(result).filter(v => typeof v === 'object' && v !== null && !Array.isArray(v));
        }
    }

    // Map fields to ActiveUserPresence (handles snake_case or camelCase)
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
