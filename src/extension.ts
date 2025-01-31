import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import {DrexelWebviewProvider} from './provider';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const commands = [
        { command: 'drexelCci.helloWorld', callback: sayHello },
        { command: 'drexelCci.checkRemote', callback: checkRemote }
    ];

    commands.forEach(({ command, callback }) => {
        const disposable = vscode.commands.registerCommand(command, callback);
        context.subscriptions.push(disposable);
    });

	vscode.commands.registerCommand("drexelCci.getEnvironmentCheck", () => {
        return getEnvironmentCheckData();
    });

    const provider = new DrexelWebviewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('drexelCciView', provider)
    );

    // if (vscode.env.remoteName) {
    //     console.log(`Running in remote: ${vscode.env.remoteName}`);
    // }
    
}


function getEnvironmentCheckData(): any {
    const binaries = ['make', 'gcc', 'gdb', 'valgrind', 'jq', 'bats', 'git'];
    const results: { name: string; status: string }[] = [];

    binaries.forEach((binary) => {
        try {
            // Check if the binary is available in the PATH
            childProcess.execSync(`command -v ${binary}`, { stdio: 'ignore' });
            results.push({ name: `${binary}`, status: "✅" });
        } catch {
            results.push({ name: `${binary}`, status: "❌" });
        }
    });

    // Sort results: Found (`✅`) first, Missing (`❌`) last
    results.sort((a, b) => {
        // Primary sort: "✅" status first
        const statusOrder = a.status === "✅" ? -1 : 1;
        if (a.status !== b.status) {
            return statusOrder;
        }
    
        // Secondary sort: Alphabetical order of `name`
        return a.name.localeCompare(b.name);
    });

    return results;
}

function sayHello() {
    vscode.window.showInformationMessage('Hello from dragon!');
}

function checkRemote() {
    const remoteName = vscode.env.remoteName;

    if (remoteName === "ssh-remote") {
        vscode.window.showInformationMessage("This project is connected via Remote-SSH.");
    } else if (remoteName === undefined) {
        vscode.window.showInformationMessage("This project is local.");
    } else {
        vscode.window.showInformationMessage(`This project is using a remote environment: ${remoteName}`);
    }
}

export function deactivate() {}

