import postgres from 'postgres'
import { ConnectionConfig } from './extension'

export function getDatabaseConnection(connConfig: ConnectionConfig): postgres.Sql | undefined {
    if (connConfig === undefined) {
        return undefined;
    }
    return postgres({
        host    : connConfig.hostname,
        port    : connConfig.port,
        database: connConfig.database,
        username: connConfig.username,
        password: connConfig.password,
    })
}
