
import { ExtensionContext, StatusBarAlignment, window } from "vscode";
import { aihiveManager } from "./aihive/aihive-manager";
import { aihiveVersion } from "../aihive";
import { aihiveBinPath } from "../aihive/props";


export function activateStatusBar(context: ExtensionContext, aihiveManager: aihiveManager) {
  const statusItem = window.createStatusBarItem(
    "aihive-ai.version",
    StatusBarAlignment.Right
  );

  // track changes to aihive
  const updateStatus = () => {
    statusItem.name = "aihive";
    const version = aihiveVersion();
    const versionSummary = version ? `${version.version.toString()}${version.isDeveloperBuild ? '.dev' : ''}` : "(not found)";
    statusItem.text = `aihive: ${versionSummary}`;
    statusItem.tooltip = `aihive: ${version?.raw}` + (version ? `\n${aihiveBinPath()?.path}` : "");
  };
  context.subscriptions.push(aihiveManager.onaihiveChanged(updateStatus));

  // reflect current state
  updateStatus();
  statusItem.show();
}
