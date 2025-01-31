
import * as vscode from "vscode";

export class DrexelWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true, // Allow JS execution in Webview
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (message.type === "getEnvironmentCheck") {
                const environmentData = await vscode.commands.executeCommand("drexelCci.getEnvironmentCheck");
                webviewView.webview.postMessage({ type: "environmentCheckData", data: environmentData });
            }
        });
    }

    private getHtml(): string {
        const codiconsUri = this._view?.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "node_modules", "@vscode/codicons", "dist", "codicon.css")
        );

        const styleUri = this._view?.webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, "resources", "provider.css")
        );

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

            <details open>
                <summary>
                    <span class="summary-content">
                        <span class="summary-text">Environment Check</span>
                        <button id="refresh-button"><i class="codicon codicon-refresh"></i></button>
                    </span>
                </summary>
                <ul id="envList">Loading...</ul>
            </details>



            <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();

                function fetchEnvironmentCheck() {
                    vscode.postMessage({ type: "getEnvironmentCheck" });
                }

                document.getElementById("refresh-button").addEventListener("click", (event) => {
                    event.stopPropagation(); // Prevents the summary from toggling
                    console.log("Refreshing Environment Check...");
                    const list = document.getElementById("envList");
                    list.innerHTML = "Loading...";
                    fetchEnvironmentCheck();
                });


                window.addEventListener("message", (event) => {
                    const message = event.data;
                    if (message.type === "environmentCheckData") {
                        const list = document.getElementById("envList");
                        list.innerHTML = ""; // Clear existing items
                        message.data.forEach(item => {
                            const li = document.createElement("li");
                            li.innerHTML = '<span class="binary-name">' + item.name + '</span><span>' + item.status + '</span>';
                            list.appendChild(li);
                        });
                    }
                });


                fetchEnvironmentCheck();
            </script>

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
