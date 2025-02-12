
import * as vscode from "vscode";
import * as fs from 'fs';
import * as path from 'path';
import * as os from "os";
import { Course, getCourses2, folderExists, mergeExtensionConfigs, mergeLaunchConfigs, mergeTaskConfigs } from './lib';

const catalogPath = path.join(__dirname, 'catalog.json');
const SELECTED_COURSE_KEY = 'selectedCourse';

interface Binary {
    name: string;
    status: string;
}

interface BinaryCheckData {
    binaries: Binary[];
    allOk: boolean;
}

interface RepoParams {
    course: Course;
    basePath: string;
    owner: string;
    repo: string;
    dirPath: string;
    ref: string;
    localDir: string;
    token?: string; // Optional GitHub personal access token for private repos
}

function isOsSupported(course: Course, osName: string): boolean {
    return course.cli.supportedOs.includes(osName);
}

export class DrexelWebviewProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this._context = context;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        try {
            this._view = webviewView;

            webviewView.webview.options = {
                enableScripts: true,
            };

            // we fetch these here and pass them to getHtml() because the course list is static with the 
            // extension; there is no reason to pass course list through the message system to populate the
            // select list; courseId is still set in session state by the setState event, so the correct
            // selection is restored if the existing view gets reloaded (like when navigating away and then back)
            const courses = getCourses2(catalogPath);
            let savedCourseId = this._context.globalState.get<string>(SELECTED_COURSE_KEY, 'cs-503');
            let theCourse: Course = courses.find((course: Course) => course.id === savedCourseId) || null;
            let assignmentsPromise: Promise<string[]> = Promise.resolve([]);

            if (theCourse) {
                assignmentsPromise = getDirectories(theCourse.assignments.owner, theCourse.assignments.repository, theCourse.assignments.ref, theCourse.assignments.path);
            }

            webviewView.webview.onDidReceiveMessage(async (message) => {

                if (message.type === "openExplorer") {
                    let firstWorkspaceFolder: vscode.Uri | null = null;
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        firstWorkspaceFolder = workspaceFolders[0].uri;
                    }

                    if (firstWorkspaceFolder) {
                        vscode.commands.executeCommand('workbench.view.explorer'); // Open Explorer view
                        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(path.join(firstWorkspaceFolder.fsPath, message.assignment))); // Select folder
                    }
                }

                if (message.type === "pullAssignment") {
                    // TODO remove this duplicate code to get workspaceFolder
                    let firstWorkspaceFolder: vscode.Uri | null = null;
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        firstWorkspaceFolder = workspaceFolders[0].uri;
                    }

                    if (!firstWorkspaceFolder) {
                        vscode.window.showErrorMessage("cannot pull assignements because there is no open workspace folder");
                        return;
                    }

                    const localPath = path.join(firstWorkspaceFolder.fsPath, message.assignment);
                    const localPathExists = await folderExists(firstWorkspaceFolder, message.assignment);


                    if (localPathExists) {
                        vscode.window.showErrorMessage(`cannot pull ${message.assignment} because it already exists locally`);
                        return;
                    }

                    await fetchAndSaveRepoDirectory({
                        course: theCourse,
                        basePath: path.join(theCourse.assignments.path, message.assignment),
                        owner: theCourse.assignments.owner,
                        repo: theCourse.assignments.repository,
                        dirPath: path.join(theCourse.assignments.path, message.assignment),
                        ref: theCourse.assignments.ref,
                        localDir: localPath,
                    });

                    webviewView.webview.postMessage({ type: "viewReloaded" });
                    vscode.window.showInformationMessage(`pulled ${message.assignment} to your local workspace folder`);
                }

                if (message.command === 'connectToRemote') {
                    // vscode.commands.executeCommand("workbench.view.remote");
                    vscode.commands.executeCommand("workbench.action.remote.showMenu");
                }

                if (message.type === "requestState") {
                    savedCourseId = this._context.globalState.get<string>(SELECTED_COURSE_KEY, 'cs-503');

                    if (message.setCourseId) {
                        this._context.globalState.update(SELECTED_COURSE_KEY, message.setCourseId);
                        savedCourseId = message.setCourseId;
                        vscode.window.showInformationMessage("Drexel CCI: Set course id to " + message.setCourseId);
                    }

                    const binaryCheckData = await vscode.commands.executeCommand<BinaryCheckData>("drexelCci.getEnvironmentCheck");
                    const remoteName = vscode.env.remoteName || "Local";

                    let platform: string = os.platform();

                    let osError: string = '';
                    if (!isOsSupported(theCourse, platform)) {
                        osError = "'" + platform + "' not supported; valid: [" + theCourse.cli.supportedOs + "]";
                    }

                    if (binaryCheckData && !binaryCheckData.allOk) {
                        const installCommand = "sudo apt-get update && sudo apt-get install -y " + binaryCheckData.binaries.map(b => b.name).join(" ");

                        vscode.window.showWarningMessage(
                            `Missing binaries detected! Run in a terminal:\n\n\`${installCommand}\``,
                            "Copy Command"
                        ).then(selection => {
                            if (selection === "Copy Command") {
                                vscode.env.clipboard.writeText(installCommand);
                                vscode.window.showInformationMessage("Command copied to clipboard!");
                            }
                        });
                    }

                    // assignments
                    let localAssignements = [];
                    const assignmentDirs = await assignmentsPromise;
                    let firstWorkspaceFolder: vscode.Uri | null = null;
                    const workspaceFolders = vscode.workspace.workspaceFolders;
                    if (workspaceFolders && workspaceFolders.length > 0) {
                        firstWorkspaceFolder = workspaceFolders[0].uri;
                    }

                    let isGitRepo: boolean = false;

                    if (firstWorkspaceFolder) {
                        isGitRepo = await folderExists(firstWorkspaceFolder, ".git");

                        for (const d of assignmentDirs) {
                            const exists = await folderExists(firstWorkspaceFolder, d);
                            localAssignements.push({ existsLocal: exists, assignmentFolder: d });
                        };
                    }



                    webviewView.webview.postMessage({ type: "setState", binaryCheckData: binaryCheckData, remoteName: remoteName, courseId: savedCourseId, osError: osError, osName: platform, localAssignements: localAssignements, firstWorkspaceFolder: firstWorkspaceFolder, isGitRepo: isGitRepo });
                }
            });


            webviewView.webview.html = this.getHtml(courses, savedCourseId);
        } catch (error) {
            console.log(error);
            vscode.window.showErrorMessage(`extension failure: ${error}`);
        }
    }

    // private getCourses() {
    //     try {
    //         const rawData = fs.readFileSync(catalogPath, 'utf-8');
    //         const catalog = JSON.parse(rawData);
    //         return catalog.courses || [];
    //     } catch (error) {
    //         throw new Error(`Error reading catalog.json: ${error}`);
    //     }
    // }

    private getHtml(courses: { id: string; name: string }[], selectedCourseId: string): string {
        try {
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

            <div class="course-header">
                Course:
                <select id="courseDropdown" onchange="sendSelection()">
                    ${options}
                </select>
                <button id="refresh-button"><i class="codicon codicon-refresh"></i></button>
            </div>

      

            <details id="os-details" close>
                <summary>
                    <span class="summary-content">
                        <span class="summary-text">Operating System</span>
                        <span id="os_status" class="summary-text">&nbsp;</span>
                    </span>
                </summary>
                <div class="status-container">
                    <div class="status-header">Connection: <span id="connection-name" class="conn-name" >...</span></div>
                    <div class="status-header">Platform: <span id="platform-name" class="conn-name" >...</span></div>
                    <div id="connection-message">Loading...</div>
                </div>
            </details>

            <details id="binaries-details" close>
                <summary>
                    <span class="summary-content">
                        <span class="summary-text">Required Binaries</span>
                        <span id="env_status" class="summary-text">&nbsp;</span>
                    </span>
                </summary>
                <ul id="envList">Loading...</ul>
            </details>           

            <details id="assignment-details" open>
                <summary>
                    <span class="summary-content">
                        <span class="summary-text">Assignments</span>
                        <span  class="summary-text">&nbsp;</span>
                    </span>
                </summary>
                <ul id="assignement-list">Loading...</ul>
                <div id="assignments-status"></div>
            </details>    

            </body>
            </html>
        `;
        } catch (error) {
            throw error;
        }
    }
}

function getNonce() {
    try {
        let text = "";
        const possible =
            "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    } catch (error) {
        throw error;
    }
}

async function getTreeContents(owner: string, repo: string, branch: string, targetPath: string, recursive: boolean) {
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit(); // new Octokit({ auth: process.env.GITHUB_TOKEN });

    const { data: branchData } = await octokit.repos.getBranch({ owner, repo, branch });
    const treeSha = branchData.commit.commit.tree.sha;

    const params: {
        owner: string;
        repo: string;
        tree_sha: string;
        recursive?: string;
    } = {
        owner,
        repo,
        tree_sha: treeSha,
    };

    if (recursive) {
        params.recursive = "1";
    }


    const { data: treeData } = await octokit.git.getTree(params);
    return treeData.tree.filter(item => item.path !== undefined && item.path.startsWith(targetPath));
}

async function getDirectories(owner: string, repo: string, ref: string, path: string): Promise<string[]> {
    const { Octokit } = await import('@octokit/rest');
    const octokit = new Octokit();

    try {
        const { data } = await octokit.repos.getContent({
            owner,
            repo,
            path: path,
            ref: ref
        });

        // Ensure that the response is an array (i.e. a directory listing)
        if (!Array.isArray(data)) {
            throw new Error('The "assignments" path is not a directory.');
        }

        // Filter for directories and extract their names
        return data
            .filter(item => item.type === 'dir')
            .map(item => item.name);
    } catch (error) {
        throw error;
    }
}



async function fetchAndSaveRepoDirectory(params: RepoParams): Promise<void> {
    const fs = require('fs-extra');
    const { course, basePath, owner, repo, dirPath, ref, localDir, token } = params;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${ref}`;

    const headers: Record<string, string> = {};
    if (token) {
        headers["Authorization"] = `token ${token}`;
    }

    try {
        const response = await fetch(apiUrl, { headers });
        if (!response.ok) {
            throw new Error(`GitHub API request failed: ${response.status} ${response.statusText}`);
        }

        const items = await response.json();

        if (!Array.isArray(items)) {
            throw new Error(`Unexpected response format from GitHub API`);
        }

        let taskContent: any = "";
        let launchContent: any = "";

        for (const item of items) {
            const relativePath = path.relative(basePath, item.path);
            const itemPath = path.join(localDir, relativePath);

            if (item.type === "file") {

                // Fetch file content
                const fileResponse = await fetch(item.download_url, { headers });
                if (!fileResponse.ok) {
                    console.warn(`Failed to download ${item.path}`);
                    continue;
                }
                const fileContent = await fileResponse.text();

                // Ensure directory exists before writing
                await fs.ensureDir(path.dirname(itemPath));

                // Write file to local directory
                await fs.writeFile(itemPath, fileContent, "utf8");

                if (path.dirname(itemPath).endsWith(".debug")) {
                    if (item.name === "launch.json") {
                        const fileUri = vscode.Uri.file(itemPath);
                        try {
                            const fileData = await vscode.workspace.fs.readFile(fileUri);
                            const fileContent = Buffer.from(fileData).toString('utf-8');
                            // Parse JSON (if needed)
                            const jsonConfig = JSON.parse(fileContent);
                            launchContent = jsonConfig;
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to read ${fileUri.fsPath}: ${error}`);
                        }
                    } else if (item.name === "tasks.json") {
                        // Read tasks.json (similar approach)
                        const fileUri = vscode.Uri.file(itemPath);
                        try {
                            const fileData = await vscode.workspace.fs.readFile(fileUri);
                            const fileContent = Buffer.from(fileData).toString('utf-8');
                            // Parse JSON (if needed)
                            const jsonConfig = JSON.parse(fileContent);
                            taskContent = jsonConfig;
                        } catch (error) {
                            vscode.window.showErrorMessage(`Failed to read ${fileUri.fsPath}: ${error}`);
                        }
                    }
                }

            } else if (item.type === "dir") {
                // Recursively fetch directory
                await fetchAndSaveRepoDirectory({
                    course,
                    basePath,
                    owner,
                    repo,
                    dirPath: item.path,
                    ref,
                    localDir,
                    token,
                });
            }
        }

        if (taskContent || launchContent || course.extensions) {
            let firstWorkspaceFolder: vscode.Uri | null = null;
            const workspaceFolders = vscode.workspace.workspaceFolders;

            if (workspaceFolders && workspaceFolders.length > 0) {
                firstWorkspaceFolder = workspaceFolders[0].uri;
            }

            if (firstWorkspaceFolder) {
                if (taskContent) {
                    await mergeTaskConfigs(firstWorkspaceFolder, taskContent);
                }

                if (launchContent) {
                    await mergeLaunchConfigs(firstWorkspaceFolder, launchContent);
                }

                if (course.extensions) {
                    await mergeExtensionConfigs(firstWorkspaceFolder, course);
                }
            }
        }
    } catch (error) {
        throw error;
    }
}
