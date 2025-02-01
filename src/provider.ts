
import * as vscode from "vscode";
import * as fs from 'fs';
import * as path from 'path';

const catalogPath = path.join(__dirname, 'catalog.json');
const SELECTED_COURSE_KEY = 'selectedCourse';

export class DrexelWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;

    constructor( context: vscode.ExtensionContext) {
        this._context = context;
     }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        // we fetch these here and pass them to getHtml() because the course list is static with the 
        // extension; there is no reason to pass course list through the message system to populate the
        // select list; courseId is still set in session state by the setState event, so the correct
        // selection is restored if the existing view gets reloaded (like when navigating away and then back)
        const courses = this.getCourses();
        let savedCourseId = this._context.globalState.get<string>(SELECTED_COURSE_KEY, 'cs-503');
        
        webviewView.webview.onDidReceiveMessage(async (message) => {

            if (message.type === "requestState") {
                savedCourseId = this._context.globalState.get<string>(SELECTED_COURSE_KEY, 'cs-503');

                if (message.setCourseId) {
                    this._context.globalState.update(SELECTED_COURSE_KEY, message.setCourseId);
                    savedCourseId = message.setCourseId;
                    vscode.window.showInformationMessage("Drexel CCI: Set course id to " + message.setCourseId);
                }
                
                const binaryCheckData = await vscode.commands.executeCommand("drexelCci.getEnvironmentCheck");
                const remoteName = vscode.env.remoteName || "Local";
                
                webviewView.webview.postMessage({ type: "setState", binaryCheckData: binaryCheckData, remoteName: remoteName, courseId: savedCourseId });
            } 
        });

        // webviewView.onDidChangeVisibility(() => {
        //     if (webviewView.visible) {
        //         webviewView.webview.postMessage({ type: "viewReloaded" });
        //     }
        // });

        webviewView.webview.html = this.getHtml(courses, savedCourseId);
    }

    private getCourses() {
        try {
            const rawData = fs.readFileSync(catalogPath, 'utf-8');
            const catalog = JSON.parse(rawData);
            return catalog.courses || [];
        } catch (error) {
            console.error('Error reading catalog.json:', error);
            return [];
        }
    }

    private getHtml(courses: { id: string; name: string }[], selectedCourseId: string): string {
        const codiconsUri = this._view?.webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "node_modules", "@vscode/codicons", "dist", "codicon.css")
        );

        const styleUri = this._view?.webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "resources", "provider.css")
        );


        const scriptUri = this._view?.webview.asWebviewUri(
            vscode.Uri.joinPath(this._context.extensionUri, "resources", "provider.js")
        );

        const options = courses
        .map(course => `<option value="${course.id}" ${course.id === selectedCourseId ? 'selected' : ''}>${course.name}</option>`)
        .join('');

        const nonce = getNonce();

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Drexel CCI</title>
                <link rel="stylesheet" href="${codiconsUri}">
                <link rel="stylesheet" href="${styleUri}">
            </head>
            <body>

            <script nonce="${nonce}" src="${scriptUri}" defer></script>

            Course:
            <select id="courseDropdown" onchange="sendSelection()">
                ${options}
            </select>

            <details open>
                <summary>
                    <span class="summary-content">
                        <span class="summary-text">Environment Check</span>
                        <span id="env_status" class="summary-text">&nbsp;</span>
                        <button id="refresh-button"><i class="codicon codicon-refresh"></i></button>
                    </span>
                </summary>
                <div class="status-container">
                    <div class="status-header">Connection: <span id="connection-name" class="conn-name" >...</span></div>
                    <div id="connection">Loading...</div>
                </div>
                <hr />
                <p>Required binaries:</p>
                <ul id="envList">Loading...</ul>
            </details>

            <details>
                <summary>other</summary>
            </details>

            

            </body>
            </html>
        `;
    }
}

function getNonce() {
    let text = "";
    const possible =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
