import * as vscode from 'vscode'
import postgres from 'postgres'
import { ConnectionConfig } from './extension'

function getPrimaryConnectionConfig(): ConnectionConfig | undefined {
    const connections = vscode.workspace.getConfiguration("filefly").get<ConnectionConfig[]>("connections");

    if (connections === undefined || connections.length === 0) {
        return undefined;
    }
    return connections[0];
}

let sql: postgres.Sql | undefined = undefined;

export function getDatabaseConnection(): postgres.Sql | undefined {
    if (sql === undefined) {
        const connDetails = getPrimaryConnectionConfig();
        if (connDetails === undefined) {
            return undefined;
        }
        sql = postgres({
            host    : connDetails.hostname,
            port    : connDetails.port,
            database: connDetails.database,
            username: connDetails.username,
            password: connDetails.password,
        })
        return sql;
    }
    return sql;
}
