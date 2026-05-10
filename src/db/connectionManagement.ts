import postgres from 'postgres'
import { ConnectionConfig } from '../utils/uiHelpers';

let conn: postgres.Sql | undefined;

export async function getDatabaseConnection(connConfig: ConnectionConfig): Promise<postgres.Sql | undefined> {
    if (connConfig === undefined) {
        return undefined;
    }
    conn = postgres({
        host    : connConfig.hostname,
        port    : connConfig.port,
        database: connConfig.database,
        username: connConfig.username,
        password: connConfig.password,
    })
    // Run a basic query to initialize the connection
    // Throws an error if the connection is invalid which should be handled by the caller
    await conn`SELECT 1`;
    return conn;
}

export function getConnection(): postgres.Sql | undefined {
    return conn;
}

export async function disconnectDatabaseConnection(): Promise<void> {
    if (!conn) {
        return;
    }

    await conn.end();
    conn = undefined;
}