const vscode = acquireVsCodeApi();
const okSymbol = "✅";
const failSymbol = "❌";
const localMsg = '<div class="status-warn">You are running locally; this is probably not what you want - connect to a remote using the blue icon in the lower-left corner.</div>';
const remoteMsg = '<div class="status-success">You are running in a remote environement.</div>';

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
            binaryCheckData: message.binaryCheckData
        };

        if (message.remoteName && message.remoteName !== "Local") {
            state = { ...state, connMessage: remoteMsg };
        } else {
            state = { ...state, connMessage: localMsg };
        }

        vscode.setState(state);
        const savedState = vscode.getState();
        updateFromState(savedState);
    }
});

function updateFromState(savedState) {
    updateConnectionInfo(savedState);
    updateBinaryData(savedState);
    updateSelectedCourse(savedState);
}

function updateSelectedCourse(savedState) {
    if (savedState && savedState.courseId) {
        document.getElementById('courseDropdown').value = savedState.courseId;
    }
}

function updateConnectionInfo(savedState) {
    if (savedState && savedState.remoteName) {
        document.getElementById("connection-name").textContent = savedState.remoteName;
    }
    if (savedState && savedState.connMessage) {
        document.getElementById("connection").innerHTML = savedState.connMessage;
    }
}

function updateBinaryData(savedState) {
    if (savedState && savedState.binaryCheckData) {
        const list = document.getElementById("envList");
        const status = document.getElementById("env_status");

        list.innerHTML = "";
        status.textContent = "";
        let isOk = true;

        savedState.binaryCheckData.forEach(item => {
            const li = document.createElement("li");
            li.innerHTML = '<span class="binary-name">' + item.name + '</span><span>' + item.status + '</span>';
            list.appendChild(li);
            if (item.status === failSymbol) {
                isOk = false;
            }
        });

        status.textContent = isOk ? okSymbol : failSymbol;
    }
}


function sendSelection() {
    const courseId = document.getElementById('courseDropdown').value;
    vscode.postMessage({ type: 'requestState', setCourseId: courseId });
}
