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



export async function getFileContents() {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor)
        return;

    const document = await vscode.workspace.openTextDocument(activeEditor.document.uri)

    return document.getText();
        
}




export async function makeChunks(): Promise<chunk[] | undefined> {
    const content = await getFileContents();

    if (!content) {
        return undefined;
    }

    const chunkSize = 500;
    const numOfChunks = Math.ceil(content.length / chunkSize);
    let currentpos = 0;
    let chunks: chunk[] = [];

    for (let i = 0; i < numOfChunks; i++) {
        const chunkContent = content.slice(currentpos, currentpos + chunkSize);
        chunks.push(new chunk(i, chunkContent, currentpos, currentpos + chunkSize));
        currentpos += chunkSize;
    }

    return chunks;
}
