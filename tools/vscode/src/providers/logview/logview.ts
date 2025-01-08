import { ExtensionContext } from "vscode";

import { Command } from "../../core/command";
import { logviewCommands } from "./commands";
import { aihiveViewWebviewManager } from "./logview-view";
import { aihiveViewManager } from "./logview-view";
import { aihiveManager } from "../aihive/aihive-manager";
import { WorkspaceEnvManager } from "../workspace/workspace-env-provider";
import { ExtensionHost } from "../../hooks";
import { aihiveViewServer } from "../aihive/aihive-view-server";
import { activateLogviewEditor } from "./logview-editor";
import { aihiveLogsWatcher } from "../aihive/aihive-logs-watcher";

export async function activateLogview(
  aihiveManager: aihiveManager,
  server: aihiveViewServer,
  envMgr: WorkspaceEnvManager,
  logsWatcher: aihiveLogsWatcher,
  context: ExtensionContext,
  host: ExtensionHost
): Promise<[Command[], aihiveViewManager]> {

  // activate the log viewer editor
  activateLogviewEditor(context, server);

  // initilize manager
  const logviewWebManager = new aihiveViewWebviewManager(
    aihiveManager,
    server,
    context,
    host
  );
  const logviewManager = new aihiveViewManager(
    context,
    logviewWebManager,
    envMgr,
    logsWatcher
  );

  // logview commands
  return [await logviewCommands(logviewManager), logviewManager];
}
