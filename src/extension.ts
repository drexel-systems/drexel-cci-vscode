import * as vscode from 'vscode';
import * as childProcess from 'child_process';
import { DrexelWebviewProvider } from './provider';
import * as fs from 'fs';
import * as path from 'path';

const okSymbol = "✅";
const failSymbol = "❌";
const catalogPath = path.join(__dirname, 'catalog.json');

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    const SELECTED_COURSE_KEY = 'selectedCourse';

    const commands = [
        { command: 'drexelCci.helloWorld', callback: sayHello },
        { command: 'drexelCci.checkRemote', callback: checkRemote }
    ];

    commands.forEach(({ command, callback }) => {
        const disposable = vscode.commands.registerCommand(command, callback);
        context.subscriptions.push(disposable);
    });

    vscode.commands.registerCommand("drexelCci.getEnvironmentCheck", () => {
        let courseId = context.globalState.get<string>(SELECTED_COURSE_KEY, 'cs-503');
        return getEnvironmentCheckData(courseId);
    });

    const provider = new DrexelWebviewProvider(context);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('drexelCciView', provider)
    );

    // if (vscode.env.remoteName) {
    //     console.log(`Running in remote: ${vscode.env.remoteName}`);
    // }

}

function getRequiredBinaries(courseId: string): string[] {
    try {
        const rawData = fs.readFileSync(catalogPath, 'utf-8');
        const catalog = JSON.parse(rawData);
        
        const course = catalog.courses.find((c: { id: string }) => c.id === courseId);
        if (course && course.cli && Array.isArray(course.cli.required)) {
            return course.cli.required;
        } else {
            console.error(`Course ID ${courseId} not found or missing required binaries`);
            return [];
        }
    } catch (error) {
        console.error('Error reading catalog.json:', error);
        return [];
    }
}

function getEnvironmentCheckData(courseId: string): any {
    let requiredBinaries = getRequiredBinaries(courseId);
    let allOk = true;

    // const binaries = ['make', 'gcc', 'gdb', 'valgrind', 'jq', 'bats', 'git'];
    const results: { name: string; status: string }[] = [];

    requiredBinaries.forEach((binary) => {
        try {
            // Check if the binary is available in the PATH
            childProcess.execSync(`command -v ${binary}`, { stdio: 'ignore' });
            results.push({ name: `${binary}`, status: "✅" });
        } catch {
            results.push({ name: `${binary}`, status: "❌" });
            allOk = false;
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

    return {binaries: results, allOk: allOk};
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

export function deactivate() { }

