import * as vscode from 'vscode';

export interface GridPosition {
    row: number;
    col: number;

}


export function getActiveCursorPosition(): GridPosition | undefined {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor){
        return undefined
    };

    const position = activeEditor.selection.active;

    return {
        row: position.line + 1,
        col: position.character + 1
    };



}

export function getHighlightPositions(): GridPosition[] | undefined {
    const activeEditor = vscode.window.activeTextEditor;

    if (!activeEditor){
        return undefined
    };

    const highlightStart = activeEditor.selection.start;

    const highlightStop = activeEditor.selection.end;

    
    return [
            {row: highlightStart.line + 1, col: highlightStart.character + 1},
            {row: highlightStart.line + 1, col: highlightStop.character + 1}
        ];


};


