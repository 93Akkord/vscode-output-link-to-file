'use strict';
import * as vscode from 'vscode';
import { LinkProvider } from './linkProvider';
import { showConfirmToReloadMessage } from './reload';
import nonOutputLanguageIds from './nonOutputLanguageIds';

let unknownLanguageIds: string[] = [];

export function activate(context: vscode.ExtensionContext) {
    const linkProvider = new LinkProvider();
    let languagesIds: string[] = vscode.workspace.getConfiguration('output-link-to-file').get('languagesIds');

    registerCommands(context);

    let outputLink = vscode.languages.registerDocumentLinkProvider(languagesIds, linkProvider);

    vscode.workspace.onDidChangeConfiguration((e) => {
        outputLink.dispose();

        languagesIds = vscode.workspace.getConfiguration('output-link-to-file').get('languagesIds');

        outputLink = vscode.languages.registerDocumentLinkProvider(languagesIds, linkProvider);
    });

    vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor != null && !languagesIds.includes(editor.document.languageId) && !nonOutputLanguageIds.includes(editor.document.languageId) && !unknownLanguageIds.includes(editor.document.languageId)) {
            unknownLanguageIds.push(editor.document.languageId);
        }
    });

    context.subscriptions.push(outputLink);
}

function registerCommands(context: vscode.ExtensionContext) {
    const outputUnknownLanguageIds = vscode.commands.registerCommand('output-link-to-file.outputUnknownLanguageIds', () => {
        let lines: string[] = [];

        for (let i = 0; i < unknownLanguageIds.length; i++) {
            lines.push(unknownLanguageIds[i]);
        }

        console.log(lines.join('\n'));

        vscode.window.showInformationMessage(lines.join('\n'));
    });

    context.subscriptions.push(outputUnknownLanguageIds);
}

function outputChannelWorker() {
    let outputChannel = vscode.window.createOutputChannel('Output Link to File');

    outputChannel.show();

    vscode.languages.getLanguages().then((languages) => {
        console.log('languages:', languages);

        let l = [];

        for (let i = 0; i < languages.length; i++) {
            l.push(languages[i]);
        }

        outputChannel.append(l.join('\n'));
    });
}

/** Reload vs code window */
export const promptToReload = () => {
    return showConfirmToReloadMessage().then((result) => {
        if (result) reloadWindow();
    });
};

const reloadWindow = () => {
    return vscode.commands.executeCommand('workbench.action.reloadWindow');
};

function arrayCompare(a: any[], b: any[]): boolean {
    if (!b) return false;

    if (a.length != b.length) return false;

    for (let i = 0, l = a.length; i < l; i++) {
        if (a[i] instanceof Array && b[i] instanceof Array) {
            if (!arrayCompare(a[i], b[i])) return false;
        } else if (a[i] != b[i]) {
            return false;
        }
    }

    return true;
}

export function deactivate() {}
