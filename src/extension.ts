'use strict';

import * as vscode from 'vscode';
import { LinkProvider } from './linkProvider';
import nonOutputLanguageIds from './nonOutputLanguageIds';

let unknownLanguageIds: string[] = [];
let outputChannel = vscode.window.createOutputChannel('Output Link to File');

export function activate(context: vscode.ExtensionContext) {
    let linkProvider = new LinkProvider();
    let languagesIds: string[] = vscode.workspace.getConfiguration('output-link-to-file', null).get('languagesIds');

    registerCommands(context);

    let outputLinkProvider = vscode.languages.registerDocumentLinkProvider(languagesIds, linkProvider);

    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration((e) => {
            outputLinkProvider.dispose();

            languagesIds = vscode.workspace.getConfiguration('output-link-to-file', null).get('languagesIds');

            outputLinkProvider = vscode.languages.registerDocumentLinkProvider(languagesIds, linkProvider);
        })
    );

    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor((editor) => {
            if (editor != null && !languagesIds.includes(editor.document.languageId) && !nonOutputLanguageIds.includes(editor.document.languageId) && !unknownLanguageIds.includes(editor.document.languageId)) {
                unknownLanguageIds.push(editor.document.languageId);
            }
        })
    );

    context.subscriptions.push(outputLinkProvider);
}

function registerCommands(context: vscode.ExtensionContext) {
    context.subscriptions.push(vscode.commands.registerCommand('output-link-to-file.outputUnknownLanguageIds', displayUnknownLanguageIds));
}

function displayUnknownLanguageIds() {
    if (unknownLanguageIds.length > 0) {
        let lines: string[] = [];

        lines.push('Unknown Language Ids:\n');

        for (let i = 0; i < unknownLanguageIds.length; i++) {
            lines.push(unknownLanguageIds[i]);
        }

        outputChannel.clear();
        outputChannel.show();
        outputChannel.append(lines.join('\n'));
    }
}

export function deactivate() {}
