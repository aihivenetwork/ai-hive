import { ExtensionContext, MessageItem, window } from "vscode";

import { CommandManager } from "./core/command";
import { activateCodeLens } from "./providers/codelens/codelens-provider";
import { activateLogview } from "./providers/logview/logview";
import { logviewTerminalLinkProvider } from "./providers/logview/logview-link-provider";
import { aihiveSettingsManager } from "./providers/settings/aihive-settings";
import { initializeGlobalSettings } from "./providers/settings/user-settings";
import { activateEvalManager } from "./providers/aihive/aihive-eval";
import { activateActivityBar } from "./providers/activity-bar/activity-bar-provider";
import { activateActiveTaskProvider } from "./providers/active-task/active-task-provider";
import { activateWorkspaceTaskProvider } from "./providers/workspace/workspace-task-provider";
import {
  activateWorkspaceState,
} from "./providers/workspace/workspace-state-provider";
import { initializeWorkspace } from "./providers/workspace/workspace-init";
import { activateWorkspaceEnv } from "./providers/workspace/workspace-env-provider";
import { initPythonInterpreter } from "./core/python";
import { initaihiveProps } from "./aihive";
import { activateaihiveManager } from "./providers/aihive/aihive-manager";
import { checkActiveWorkspaceFolder } from "./core/workspace";
import { aihiveBinPath, aihiveVersionDescriptor } from "./aihive/props";
import { extensionHost } from "./hooks";
import { activateStatusBar } from "./providers/statusbar";
import { aihiveViewServer } from "./providers/aihive/aihive-view-server";
import { aihiveLogsWatcher } from "./providers/aihive/aihive-logs-watcher";
import { activateLogNotify } from "./providers/lognotify";
import { activateOpenLog } from "./providers/openlog";
import { activateProtocolHandler } from "./providers/protocol-handler";
import { activateaihiveCommands } from "./providers/aihive/aihive-commands";

const kaihiveMinimumVersion = "0.3.8";

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: ExtensionContext) {
  // we don't activate anything if there is no workspace
  if (!checkActiveWorkspaceFolder()) {
    return;
  }

  // Get the host
  const host = extensionHost();

  const commandManager = new CommandManager();

  // init python interpreter
  context.subscriptions.push(await initPythonInterpreter());

  // init aihive props
  context.subscriptions.push(initaihiveProps());

  // Initialize global settings
  await initializeGlobalSettings();

  // Warn the user if they don't have a recent enough version
  void checkaihiveVersion();

  // Activate the workspacestate manager
  const [stateCommands, stateManager] = activateWorkspaceState(context);

  // For now, create an output channel for env changes
  const workspaceActivationResult = activateWorkspaceEnv();
  const [envComands, workspaceEnvManager] = workspaceActivationResult;
  context.subscriptions.push(workspaceEnvManager);

  // Initial the workspace
  await initializeWorkspace(stateManager);

  // Initialize the protocol handler
  activateProtocolHandler(context);

  // aihive Manager watches for changes to aihive binary
  const aihiveManager = activateaihiveManager(context);
  context.subscriptions.push(aihiveManager);

  // Eval Manager
  const [aihiveEvalCommands, aihiveEvalMgr] = await activateEvalManager(
    stateManager,
    context
  );

  // Activate commands interface
  activateaihiveCommands(stateManager, context);

  // Activate a watcher which aihives the active document and determines
  // the active task (if any)
  const [taskCommands, activeTaskManager] = activateActiveTaskProvider(
    aihiveEvalMgr,
    context
  );

  // Active the workspace manager to watch for tasks
  const workspaceTaskMgr = activateWorkspaceTaskProvider(
    aihiveManager,
    context
  );

  // Read the extension configuration
  const settingsMgr = new aihiveSettingsManager(() => { });

  // initialiaze view server
  const server = new aihiveViewServer(context, aihiveManager);

  // initialise logs watcher
  const logsWatcher = new aihiveLogsWatcher(stateManager);

  // Activate the log view
  const [logViewCommands, logviewWebviewManager] = await activateLogview(
    aihiveManager,
    server,
    workspaceEnvManager,
    logsWatcher,
    context,
    host
  );
  const aihiveLogviewManager = logviewWebviewManager;

  // initilisze open log
  activateOpenLog(context, logviewWebviewManager);

  // Activate the Activity Bar
  const taskBarCommands = await activateActivityBar(
    aihiveManager,
    aihiveEvalMgr,
    aihiveLogviewManager,
    activeTaskManager,
    workspaceTaskMgr,
    stateManager,
    workspaceEnvManager,
    server,
    logsWatcher,
    context
  );

  // Register the log view link provider
  window.registerTerminalLinkProvider(
    logviewTerminalLinkProvider()
  );

  // Activate Code Lens
  activateCodeLens(context);

  // Activate Status Bar
  activateStatusBar(context, aihiveManager);

  // Activate Log Notification
  activateLogNotify(context, logsWatcher, settingsMgr, aihiveLogviewManager);

  // Activate commands
  [
    ...logViewCommands,
    ...aihiveEvalCommands,
    ...taskBarCommands,
    ...stateCommands,
    ...envComands,
    ...taskCommands,
  ].forEach((cmd) => commandManager.register(cmd));
  context.subscriptions.push(commandManager);

  // refresh the active task state
  await activeTaskManager.refresh();
}


const checkaihiveVersion = async () => {
  if (aihiveBinPath()) {
    const descriptor = aihiveVersionDescriptor();
    if (descriptor && descriptor.version.compare(kaihiveMinimumVersion) === -1) {
      const close: MessageItem = { title: "Close" };
      await window.showInformationMessage<MessageItem>(
        "The VS Code extension requires a newer version of aihive. Please update " +
        "with pip install --upgrade aihive-ai",
        close
      );
    }
  }
};