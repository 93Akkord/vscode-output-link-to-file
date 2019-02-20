'use strict';
// import * as ts from "typescript";
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

const pathPrefix = '(\\.\\.?|\\~)';
const pathSeparatorClause = '\\/';
// '":; are allowed in paths but they are often separators so ignore them
// Also disallow \\ to prevent a catastropic backtracking case #24798
const excludedPathCharactersClause = '[^\\0\\s!$`&*()\\[\\]+\'":;\\\\]';
/** A regex that matches paths in the form /foo, ~/foo, ./foo, ../foo, foo/bar */
const unixLocalLinkClause = '((' + pathPrefix + '|(' + excludedPathCharactersClause + ')+)?(' + pathSeparatorClause + '(' + excludedPathCharactersClause + ')+)+)';

const winDrivePrefix = '[a-zA-Z]:';
const winPathPrefix = '(' + winDrivePrefix + '|\\.\\.?|\\~)';
const winPathSeparatorClause = '(\\\\|\\/)';
const winExcludedPathCharactersClause = '[^\\0<>\\?\\|\\/\\s!$`&*()\\[\\]+\'":;]';
/** A regex that matches paths in the form c:\foo, ~\foo, .\foo, ..\foo, foo\bar */
const winLocalLinkClause = '((' + winPathPrefix + '|(' + winExcludedPathCharactersClause + ')+)?(' + winPathSeparatorClause + '(' + winExcludedPathCharactersClause + ')+)+)';

/**
 * As xterm reads from DOM, space in that case is nonbreaking char ASCII code - 160,
 * replacing space with nonBreakningSpace or space ASCII code - 32.
 */
const lineAndColumnClause = [
    // "(file path)", line 45 [see #40468]
    '((\\S*)", line ((\\d+)( column (\\d+))?))',

    // (file path) on line 8, column 13
    '((\\S*) on line ((\\d+)(, column (\\d+))?))',

    // (file path):line 8, column 13
    '((\\S*):line ((\\d+)(, column (\\d+))?))',

    // (file path)(45), (file path) (45), (file path)(45,18), (file path) (45,18), (file path)(45, 18), (file path) (45, 18), also with []
    '(([^\\s\\(\\)]*)(\\s?[\\(\\[](\\d+)(,\\s?(\\d+))?)[\\)\\]])',

    // (file path):336, (file path):336:9
    '(([^:\\s\\(\\)<>\'"\\[\\]]*)(:(\\d+))?(:(\\d+))?)',
]
    .join('|')
    .replace(/ /g, `[${'\u00A0'} ]`);

// Changing any regex may effect this value, hence changes this as well if required.
const winLineAndColumnMatchIndex = 12;
const unixLineAndColumnMatchIndex = 11;

// Each line and column clause have 6 groups (ie no. of expressions in round brackets)
const lineAndColumnClauseGroupCount = 6;

interface IConfiguration {
    eol: string;
}

export interface ILineColumnInfo {
    lineNumber: number;
    columnNumber: number;
}

export class LinkProvider implements vscode.DocumentLinkProvider {
    private processCwd: string | null;
    private localLinkPattern: RegExp;
    private localLinkPattern2: RegExp;
    private currentWorkspaceFolder: vscode.WorkspaceFolder;

    private configuration: IConfiguration;

    constructor() {
        this.configuration = {
            eol: vscode.workspace.getConfiguration('files').get('eol'),
        };

        const baseLocalLinkClause = process.platform === 'win32' ? winLocalLinkClause : unixLocalLinkClause;

        // Append line and column number regex
        this.localLinkPattern = new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`, 'g');
        this.localLinkPattern2 = new RegExp(`${baseLocalLinkClause}(${lineAndColumnClause})`);
    }

    public async provideDocumentLinks(document: vscode.TextDocument, token: vscode.CancellationToken): Promise<vscode.DocumentLink[]> {
        let results: vscode.DocumentLink[] = [];

        this.currentWorkspaceFolder = vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri);
        this.processCwd = this.currentWorkspaceFolder ? this.currentWorkspaceFolder.uri.fsPath : null;
        let lines = document.getText().split(this.configuration.eol);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            let result = await this.getLinksOnLine(line, i);

            if (result.length > 0) {
                results.push(...result);
            }
        }

        return Promise.resolve(results);
    }

    public async getLinksOnLine(line: string, lineNumber: number) {
        const results: vscode.DocumentLink[] = [];

        let match: RegExpMatchArray | null = null;

        this.localLinkPattern.lastIndex = 0;

        while ((match = this.localLinkPattern.exec(line))) {
            let start = match.index;
            let end = match.index + match[0].length;

            let linkUrl = this.extractLinkUrl(match[0]);

            let resolvedPath = await this.resolvePath(linkUrl);
            linkUrl = path.normalize(resolvedPath);

            if (!(await this.fileExists(linkUrl))) {
                break;
            }

            let fileUri = vscode.Uri.file(linkUrl);
            let lineColumnInfo = this.extractLineColumnInfo(match[0]);

            const linkTarget = fileUri.with({ fragment: `${lineColumnInfo.lineNumber},${lineColumnInfo.columnNumber}` });

            results.push(new vscode.DocumentLink(new vscode.Range(new vscode.Position(lineNumber, start), new vscode.Position(lineNumber, end)), linkTarget));
        }

        return results;
    }

    /**
     * Returns line and column number of URl if that is present.
     *
     * @param link Url link which may contain line and column number.
     */
    public extractLineColumnInfo(link: string): ILineColumnInfo {
        const matches: string[] | null = this.localLinkPattern2.exec(link);
        const lineColumnInfo: ILineColumnInfo = {
            lineNumber: 1,
            columnNumber: 1,
        };

        if (!matches) {
            return lineColumnInfo;
        }

        const lineAndColumnMatchIndex = process.platform === 'win32' ? winLineAndColumnMatchIndex : unixLineAndColumnMatchIndex;

        for (let i = 0; i < lineAndColumnClause.length; i++) {
            const lineMatchIndex = lineAndColumnMatchIndex + lineAndColumnClauseGroupCount * i;
            const rowNumber = matches[lineMatchIndex];
            if (rowNumber) {
                lineColumnInfo.lineNumber = parseInt(rowNumber, 10);

                // Check if column number exists
                const columnNumber = matches[lineMatchIndex + 2];

                if (columnNumber) {
                    lineColumnInfo.columnNumber = parseInt(columnNumber, 10);
                }

                break;
            }
        }

        return lineColumnInfo;
    }

    /**
     * Returns url from link as link may contain line and column information.
     *
     * @param link url link which may contain line and column number.
     */
    public extractLinkUrl(link: string): string | null {
        const matches: string[] | null = this.localLinkPattern2.exec(link);

        if (!matches) {
            return null;
        }

        return matches[1];
    }

    private preprocessPath(link: string): string | null {
        if (process.platform === 'win32') {
            // Resolve ~ -> %HOMEDRIVE%\%HOMEPATH%
            if (link.charAt(0) === '~') {
                if (!process.env.HOMEDRIVE || !process.env.HOMEPATH) {
                    return null;
                }

                link = `${process.env.HOMEDRIVE}\\${process.env.HOMEPATH + link.substring(1)}`;
            }

            // Resolve relative paths (.\a, ..\a, ~\a, a\b)
            if (!link.match('^' + winDrivePrefix)) {
                if (!this.processCwd) {
                    // Abort if no workspace is open
                    return null;
                }

                link = path.join(this.processCwd, link);
            }
        } else if (link.charAt(0) !== '/' && link.charAt(0) !== '~') {
            // Resolve workspace path . | .. | <relative_path> -> <path>/. | <path>/.. | <path>/<relative_path>

            if (!this.processCwd) {
                // Abort if no workspace is open
                return null;
            }

            link = path.join(this.processCwd, link);
        }

        return link;
    }

    private async resolvePath(link: string): Promise<string | null> {
        const preprocessedLink = this.preprocessPath(link);

        if (!preprocessedLink) {
            return null;
        }

        return preprocessedLink;
    }

    private async fileExists(_path: string): Promise<boolean> {
        try {
            fs.accessSync(_path);

            return true;
        } catch (error) {
            return false;
        }
    }
}
