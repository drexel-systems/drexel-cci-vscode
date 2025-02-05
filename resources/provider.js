const vscode = acquireVsCodeApi();
const okSymbol = "✅";
const failSymbol = "❌";
const greenCircle = '🟢';
const localMsg = '<div class="status-warn">You are running locally; this is probably not what you want - click here to connect: <a href="#" onclick="connectToRemote()">Connect to Remote Host</a>.</div>';
const remoteMsg = '<div class="status-success">You are running in a remote environement.</div>';

function sendError(error) {
    vscode.postMessage({ type: 'onError', error: error });
}

try {
    window.addEventListener("DOMContentLoaded", () => {
        vscode.postMessage({ type: 'requestState' });
    });

    // dont need to do this; opt for DOMContentLoaded instead
    // vscode.postMessage({ type: "requestState" });

    document.getElementById("refresh-button").addEventListener("click", (event) => {
        // Prevents the summary from toggling
        event.stopPropagation();

        const list = document.getElementById("envList");
        list.innerHTML = "Loading...";
        vscode.postMessage({ type: 'requestState' });
    });

    window.addEventListener("message", (event) => {
        const message = event.data;

        if (message.type === "viewReloaded") {
            vscode.postMessage({ type: "requestState" });
        }

        if (message.type === "setState") {
            let state = {
                courseId: message.courseId,
                remoteName: message.remoteName,
                osName: message.osName,
                localAssignements: message.localAssignements,
                binaryCheckData: message.binaryCheckData,
                osError: message.osError,
                firstWorkspaceFolder: message.firstWorkspaceFolder,
            };

            // if (message.remoteName && message.remoteName !== "Local") {
            //     state = { ...state, connMessage: remoteMsg };
            // } else {
            //     state = { ...state, connMessage: localMsg };
            // }

            vscode.setState(state);
            const savedState = vscode.getState();
            updateFromState(savedState);
        }
    });
} catch (error) {
    sendError(error);
}


function updateFromState(savedState) {
    try {
        updateConnectionInfo(savedState);
        updateBinaryData(savedState);
        updateSelectedCourse(savedState);
        updateAssignementData(savedState);
    } catch (error) {
        throw error;
    }
}

function pullAssignement(id, name) {
    try {
        const b = document.getElementById(id);
        b.style.display = "none";

        const sp = document.createElement("span");
        sp.className = "loading-span";
        b.parentNode.appendChild(sp);
    } catch (error) {
        throw error;
    }

    vscode.postMessage({ type: "pullAssignment", assignment: name });
}

function openExplorer(id, name) {
    vscode.postMessage({ type: "openExplorer", assignment: name });
}


function stringToId(str) {
    try {
        return str
            .toLowerCase()           // Convert to lowercase
            .trim()                  // Trim leading/trailing spaces
            .replace(/[^a-z0-9]+/g, "-") // Replace non-alphanumeric characters with "-"
            .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
    } catch (error) {
        throw error;
    }
}

function updateAssignementData(savedState) {
    try {
        if (savedState && savedState.localAssignements) {
            const list = document.getElementById("assignement-list");
            const status = document.getElementById("assignments-status");

            list.innerHTML = "";
            status.textContent = "";

            if (savedState && !savedState.firstWorkspaceFolder) {
                status.innerHTML = '<div class="status-error">no workspace folder opened; please open a folder to pull assignements</div>';
                return;
            }

            if (savedState && !savedState.isGitRepo) {
                status.innerHTML = '<div class="status-error">the current workspace is not a git repo; open a git repo locally before pulling assignements</div>';
                return;
            }

            savedState.localAssignements.forEach(item => {
                const li = document.createElement("li");
                const sp = document.createElement("span");
                sp.className = "binary-name";
                sp.textContent = item.assignmentFolder;
                li.appendChild(sp);

                if (item.existsLocal) {
                    const button = document.createElement("button");
                    button.textContent = "open in explorer";
                    button.classList.add("link-button", "open-explorer-button");

                    button.id = stringToId(item.assignmentFolder);
                    button.onclick = () => openExplorer(button.id, item.assignmentFolder);
                    li.appendChild(button);

                    const sp = document.createElement("span");
                    sp.textContent = greenCircle;
                    li.appendChild(sp);
                } else {
                    const button = document.createElement("button");
                    button.textContent = "pull";
                    button.id = stringToId(item.assignmentFolder);
                    button.onclick = () => pullAssignement(button.id, item.assignmentFolder);
                    li.appendChild(button);
                }

                list.appendChild(li);
            });
        }
    } catch (error) {
        throw error;
    }
}

function updateSelectedCourse(savedState) {
    try {
        if (savedState && savedState.courseId) {
            document.getElementById('courseDropdown').value = savedState.courseId;
        }
    } catch (error) {
        throw error;
    }
}

function updateConnectionInfo(savedState) {
    try {
        const status = document.getElementById("os_status");

        if (savedState && savedState.remoteName) {
            document.getElementById("connection-name").textContent = savedState.remoteName;
        }

        if (savedState && savedState.osName) {
            document.getElementById("platform-name").textContent = savedState.osName;
        }

        if (savedState && savedState.osError) {
            status.textContent = failSymbol;
            let theHtml = '<div class="status-error">' + savedState.osError + '</div>';
            if (savedState && savedState.remoteName && savedState.remoteName === "Local") {
                theHtml = theHtml + '<div class="status-warn">You are running locally; if you need to use a remote environement, click here: <a href="#" onclick="connectToRemote()">Connect to Remote Host</a>.</div>';
            }
            document.getElementById("connection-message").innerHTML = theHtml;
            document.getElementById("os-details").open = true;
        } else {
            document.getElementById("connection-message").innerHTML = "";
            status.textContent = okSymbol;
        }

    } catch (error) {
        throw error;
    }
}

function updateBinaryData(savedState) {
    try {
        if (savedState && savedState.binaryCheckData) {
            const list = document.getElementById("envList");
            const status = document.getElementById("env_status");

            list.innerHTML = "";
            status.textContent = "";
            let isOk = true;

            savedState.binaryCheckData.binaries.forEach(item => {
                const li = document.createElement("li");
                li.innerHTML = '<span class="binary-name">' + item.name + '</span><span>' + item.status + '</span>';
                list.appendChild(li);
                if (item.status === failSymbol) {
                    isOk = false;
                }
            });

            status.textContent = isOk ? okSymbol : failSymbol;

            if (!isOk) {
                document.getElementById("binaries-details").open = true;
            }
            // else {
            //     document.getElementById("binaries-details").open = false;
            // }
        }
    } catch (error) {
        throw error;
    }
}

function sendSelection() {
    try {
        const courseId = document.getElementById('courseDropdown').value;
    } catch (error) {
        throw error;
    }
    vscode.postMessage({ type: 'requestState', setCourseId: courseId });
}

function connectToRemote() {
    vscode.postMessage({ command: 'connectToRemote' });
}