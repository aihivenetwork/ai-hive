import { ExtensionContext, window } from "vscode";
import { EnvConfigurationProvider } from "./env-config-provider";
import { activateTaskOutline } from "./task-outline-provider";
import { aihiveEvalManager } from "../aihive/aihive-eval";
import { ActiveTaskManager } from "../active-task/active-task-provider";
import { WorkspaceTaskManager } from "../workspace/workspace-task-provider";
import { WorkspaceEnvManager } from "../workspace/workspace-env-provider";
import { WorkspaceStateManager } from "../workspace/workspace-state-provider";
import { TaskConfigurationProvider } from "./task-config-provider";
import { aihiveManager } from "../aihive/aihive-manager";
import { DebugConfigTaskCommand, RunConfigTaskCommand } from "./task-config-commands";
import { aihiveViewManager } from "../logview/logview-view";
import { activateLogListing } from "./log-listing/log-listing-provider";
import { aihiveViewServer } from "../aihive/aihive-view-server";
import { aihiveLogsWatcher } from "../aihive/aihive-logs-watcher";

export async function activateActivityBar(
  aihiveManager: aihiveManager,
  aihiveEvalMgr: aihiveEvalManager,
  aihiveLogviewManager: aihiveViewManager,
  activeTaskManager: ActiveTaskManager,
  workspaceTaskMgr: WorkspaceTaskManager,
  workspaceStateMgr: WorkspaceStateManager,
  workspaceEnvMgr: WorkspaceEnvManager,
  aihiveViewServer: aihiveViewServer,
  logsWatcher: aihiveLogsWatcher,
  context: ExtensionContext
) {

  const [outlineCommands, treeDataProvider] = await activateTaskOutline(context, aihiveEvalMgr, workspaceTaskMgr, activeTaskManager, aihiveManager, aihiveLogviewManager);
  context.subscriptions.push(treeDataProvider);

  const [logsCommands, logsDispose] = await activateLogListing(context, workspaceEnvMgr, aihiveViewServer, logsWatcher);
  context.subscriptions.push(...logsDispose);

  const envProvider = new EnvConfigurationProvider(context.extensionUri, workspaceEnvMgr, workspaceStateMgr, aihiveManager);
  context.subscriptions.push(
    window.registerWebviewViewProvider(EnvConfigurationProvider.viewType, envProvider)
  );

  const taskConfigProvider = new TaskConfigurationProvider(context.extensionUri, workspaceStateMgr, activeTaskManager, aihiveManager);
  context.subscriptions.push(
    window.registerWebviewViewProvider(TaskConfigurationProvider.viewType, taskConfigProvider)
  );
  const taskConfigCommands = [
    new RunConfigTaskCommand(activeTaskManager, aihiveEvalMgr),
    new DebugConfigTaskCommand(activeTaskManager, aihiveEvalMgr),
  ];

  return [...outlineCommands, ...taskConfigCommands, ...logsCommands];
}

