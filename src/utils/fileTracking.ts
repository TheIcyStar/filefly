import * as vscode from 'vscode';

export class chunk {
    chunkId: number | null = null;
    contents: string = "";
    startpos: number | null = null;
    endpos: number | null = null;

    constructor(chunkId: number, contents: string, startpos: number, endpos: number){
        this.chunkId = chunkId;
        this.contents = contents;
        this.startpos = startpos;
        this.endpos = endpos;
    }
}



export async function getFileContents(uri?: vscode.Uri): Promise<string | undefined> {
    if (uri) {
        const document = await vscode.workspace.openTextDocument(uri)
        return document.getText()
    }

    const activeEditor = vscode.window.activeTextEditor
    if (!activeEditor) {
        return undefined
    }

    return activeEditor.document.getText()
}




export async function makeChunks(): Promise<chunk[] | undefined> {
    const content = await getFileContents()

    if (!content) {
        return undefined;
    }

    const chunkSize = 500;
    const numOfChunks = Math.ceil(content.length / chunkSize);
    let currentpos = 0;
    const chunks: chunk[] = [];

    for (let i = 0; i < numOfChunks; i++) {
        const chunkContent = content.slice(currentpos, currentpos + chunkSize);
        chunks.push(new chunk(i, chunkContent, currentpos, currentpos + chunkSize));
        currentpos += chunkSize;
    }

    return chunks;
}
