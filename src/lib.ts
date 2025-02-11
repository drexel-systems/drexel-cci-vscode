import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

async function ensureVscodeFolderExists(workspaceFolder: vscode.Uri): Promise<vscode.Uri> {
    const vscodeFolder = vscode.Uri.joinPath(workspaceFolder, '.vscode');

    try {
        await vscode.workspace.fs.stat(vscodeFolder);
    } catch {
        await vscode.workspace.fs.createDirectory(vscodeFolder);
    }

    return vscodeFolder;
}

async function readJsonFile(fileUri: vscode.Uri): Promise<any> {
    try {
        const data = await vscode.workspace.fs.readFile(fileUri);
        return JSON.parse(Buffer.from(data).toString());
    } catch {
        return null; // File does not exist or is unreadable
    }
}

async function writeJsonFile(fileUri: vscode.Uri, content: any): Promise<void> {
    const jsonString = JSON.stringify(content, null, 4);
    await vscode.workspace.fs.writeFile(fileUri, Buffer.from(jsonString));
}

function mergeConfigurations(existingConfigs: any[], newConfigs: any[], key: string): any[] {
    const configMap = new Map<string, any>();

    // Add existing configurations first
    existingConfigs.forEach(config => {
        if (config[key]) {
            configMap.set(config[key], config);
        }
    });

    // Overwrite with new configurations
    newConfigs.forEach(config => {
        if (config[key]) {
            configMap.set(config[key], config);
        }
    });

    return Array.from(configMap.values());
}

export async function mergeLaunchConfigs(workspaceFolder: vscode.Uri, newLaunchConfig: any): Promise<void> {
    try {
        const vscodeFolder = await ensureVscodeFolderExists(workspaceFolder);
        const launchFileUri = vscode.Uri.joinPath(vscodeFolder, 'launch.json');

        const existingLaunchConfig = await readJsonFile(launchFileUri) || { version: "0.2.0", configurations: [] };

        existingLaunchConfig.configurations = mergeConfigurations(
            existingLaunchConfig.configurations,
            newLaunchConfig.configurations || [],
            'name' // Ensure unique names
        );

        await writeJsonFile(launchFileUri, existingLaunchConfig);
    } catch (error) {
        throw new Error(`failed to merge launch configs: ${error}`);
    }
}

export async function mergeTaskConfigs(workspaceFolder: vscode.Uri, newTaskConfig: any): Promise<void> {
    try {
        const vscodeFolder = await ensureVscodeFolderExists(workspaceFolder);
        const tasksFileUri = vscode.Uri.joinPath(vscodeFolder, 'tasks.json');

        const existingTaskConfig = await readJsonFile(tasksFileUri) || { version: "2.0.0", tasks: [] };

        existingTaskConfig.tasks = mergeConfigurations(
            existingTaskConfig.tasks,
            newTaskConfig.tasks || [],
            'label' // Ensure unique task labels
        );

        await writeJsonFile(tasksFileUri, existingTaskConfig);
    } catch (error) {
        throw new Error(`failed to merge tasks configs: ${error}`);
    }

}

export async function folderExists(workspaceFolder: vscode.Uri, folderName: string): Promise<boolean> {
    const folderUri = vscode.Uri.joinPath(workspaceFolder, folderName); // Construct folder path

    try {
        const stat = await vscode.workspace.fs.stat(folderUri);
        return stat.type === vscode.FileType.Directory; // Ensure it's a directory
    } catch (error) {
        return false; // Folder does not exist
    }
}

export function getCourses2(catalogPath: string) {
    try {
        const rawData = fs.readFileSync(catalogPath, 'utf-8');
        const catalog = JSON.parse(rawData);
        return catalog.courses || [];
    } catch (error) {
        throw new Error(`Error reading catalog.json: ${error}`);
    }
}