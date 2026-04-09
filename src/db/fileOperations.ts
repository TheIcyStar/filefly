import { getConnection } from './connectionManagement'

export function insertFile(path: string, content: string) {
    const connection = getConnection();
    if (connection === undefined) {
        throw "connection is undefined"
    }

    return connection`
        INSERT INTO file
        ${ connection([{ path: path, content: content }]) }
    `;
}
