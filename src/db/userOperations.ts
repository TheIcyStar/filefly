import { getConnection } from './connectionManagement'

// Inserts a new user row and returns the DB-assigned userId.
// If a row with this userId already exists (reconnect), updates name/color and returns the existing userId.
export async function upsertUser(userId: number | undefined, displayName: string, cursorColor: string): Promise<number> {
    const connection = getConnection();
    if (connection === undefined) {
        throw "connection is undefined"
    }

    if (userId === undefined) {
        // First time Connect: Postgres assigns the ID via SERIAL
        const result = await connection`
            INSERT INTO fileflyuser (displayName, cursorColor)
            VALUES (${displayName}, ${cursorColor})
            RETURNING userId
        `;
        return result[0].userid as number;
    } else {
        // Reconnect: update profile and return same ID
        await connection`
            INSERT INTO fileflyuser (userId, displayName, cursorColor)
            VALUES (${userId}, ${displayName}, ${cursorColor})
            ON CONFLICT (userId) DO UPDATE SET
                displayName = EXCLUDED.displayName,
                cursorColor = EXCLUDED.cursorColor
        `;
        return userId;
    }
}

export async function getUser(userId: number) {
    const connection = getConnection();
    if (connection === undefined) {
        throw "connection is undefined"
    }

    const result = await connection`
        SELECT *
        FROM fileflyuser
        WHERE userId = ${userId}
    `;

    return result.length > 0 ? result[0] : null;
}
