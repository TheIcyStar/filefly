import postgres from 'postgres'
import { ConnectionConfig } from './extension'

export async function getDatabaseConnection(connConfig: ConnectionConfig): Promise<postgres.Sql | undefined> {
    if (connConfig === undefined) {
        return undefined;
    }
    const conn = postgres({
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
