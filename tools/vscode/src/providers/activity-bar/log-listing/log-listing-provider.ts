import * as vscode from 'vscode';

import { Command } from '../../../core/command';
import { LogTreeDataProvider } from './log-listing-data';

import { WorkspaceEnvManager } from "../../workspace/workspace-env-provider";
import { LogListing, LogNode } from './log-listing';
import { aihiveViewServer } from '../../aihive/aihive-view-server';
import { activeWorkspaceFolder } from '../../../core/workspace';
import { getRelativeUri, prettyUriPath } from '../../../core/uri';
import { aihiveLogsWatcher } from '../../aihive/aihive-logs-watcher';
import { selectLogDirectory } from './log-directory-selector';
import { Uri } from 'vscode';
import { hasMinimumaihiveVersion } from '../../../aihive/version';
import { kaihiveEvalLogFormatVersion } from '../../aihive/aihive-constants';


export async function activateLogListing(
  context: vscode.ExtensionContext,
  envManager: WorkspaceEnvManager,
  viewServer: aihiveViewServer,
  logsWatcher: aihiveLogsWatcher
): Promise<[Command[], vscode.Disposable[]]> {

  const kLogListingDir = "aihive.logListingDir";
  const disposables: vscode.Disposable[] = [];

  await vscode.commands.executeCommand(
    "setContext",
    "aihive.haveEvalLogFormat",
    hasMinimumaihiveVersion(kaihiveEvalLogFormatVersion)
  );


  // create tree data provider and tree
  const treeDataProvider = new LogTreeDataProvider(context, viewServer);
  disposables.push(treeDataProvider);
  const tree = vscode.window.createTreeView(LogTreeDataProvider.viewType, {
    treeDataProvider,
    showCollapseAll: false,
    canSelectMany: false,
  });

  // update the tree based on the current preferred log dir
  const updateTree = () => {
    // see what the active log dir is
    const preferredLogDir = context.workspaceState.get<string>(kLogListingDir);
    const logDir = preferredLogDir ? Uri.parse(preferredLogDir) : envManager.getDefaultLogDir();

    // set it
    treeDataProvider.setLogListing(new LogListing(context, logDir, viewServer));

    // show a workspace relative path if this is in the workspace,
    // otherwise show the protocol then the last two bits of the path
    const relativePath = getRelativeUri(activeWorkspaceFolder().uri, logDir);
    if (relativePath) {
      tree.description = `./${relativePath}`;
    } else {
      tree.description = prettyUriPath(logDir);
    }
  };

  // initial tree update
  updateTree();

  // update tree if the environment changes and we are tracking the workspace log dir
  disposables.push(envManager.onEnvironmentChanged(() => {
    if (context.workspaceState.get<string>(kLogListingDir) === undefined) {
      updateTree();
    }
  }));

  // Register select log dir command
  disposables.push(vscode.commands.registerCommand('aihive.logListing', async () => {
    const logLocation = await selectLogDirectory(context, envManager);
    if (logLocation !== undefined) {
      // store state ('null' means use workspace default so pass 'undefined' to clear for that)
      await context.workspaceState.update(
        kLogListingDir,
        logLocation === null
          ? undefined
          : logLocation.toString()
      );

      // trigger update
      updateTree();

      // reveal
      await revealLogListing();
    }
  }));

  // Register reveal command
  disposables.push(vscode.commands.registerCommand('aihive.logListingReveal', async (uri?: Uri) => {
    const treeLogUri = treeDataProvider.getLogListing()?.logDir();
    if (treeLogUri && uri && getRelativeUri(treeLogUri, uri) !== null) {
      const node = treeDataProvider.getLogListing()?.nodeForUri(uri);
      if (node) {
        await tree.reveal(node);
      }
    }
  }));

  // Register refresh command
  disposables.push(vscode.commands.registerCommand('aihive.logListingRefresh', () => {
    treeDataProvider.refresh();
  }));

  // Register Reveal in Explorer command
  disposables.push(vscode.commands.registerCommand('aihive.logListingRevealInExplorer', async (node: LogNode) => {
    const logUri = treeDataProvider.getLogListing()?.uriForNode(node);
    if (logUri) {
      await vscode.commands.executeCommand('revealInExplorer', logUri);
    }
  }));

  // Register Open in JSON Editor... command
  disposables.push(vscode.commands.registerCommand('aihive.logListingOpenInJSONEditor', async (node: LogNode) => {
    const logUri = treeDataProvider.getLogListing()?.uriForNode(node);
    if (logUri) {
      await vscode.commands.executeCommand('vscode.open', logUri, <vscode.TextDocumentShowOptions>{ preview: true });
    }
  }));

  // Register delete log file command
  disposables.push(vscode.commands.registerCommand('aihive.logListingDeleteLogFile', async (node: LogNode) => {
    const logUri = treeDataProvider.getLogListing()?.uriForNode(node);
    if (logUri) {
      const result = await vscode.window.showInformationMessage(
        'Delete Log File',
        {
          modal: true,
          detail: `Are you sure you want to delete the log file at ${prettyUriPath(logUri)}?`
        },
        { title: 'Delete', isCloseAffordance: false },
        { title: 'Cancel', isCloseAffordance: true }
      );

      if (result?.title === 'Delete') {
        await viewServer.evalLogDelete(logUri.toString());
        treeDataProvider.refresh();
      }

    }
  }));

  // Register copy path command
  disposables.push(vscode.commands.registerCommand('aihive.logListingCopyLogPath', async (node: LogNode) => {
    const logUri = treeDataProvider.getLogListing()?.uriForNode(node);
    if (logUri) {
      const path = prettyUriPath(logUri);
      await vscode.env.clipboard.writeText(path);
    }
  }));

  // Register copy editor command
  disposables.push(vscode.commands.registerCommand('aihive.logListingCopyEditorPath', async (node: LogNode) => {
    const logUri = treeDataProvider.getLogListing()?.uriForNode(node);
    if (logUri) {
      
    }
  }));

  // refresh when a log in our directory changes
  disposables.push(logsWatcher.onaihiveLogCreated((e) => {
    const treeLogDir = treeDataProvider.getLogListing()?.logDir();
    if (treeLogDir && getRelativeUri(treeLogDir, e.log)) {
      treeDataProvider.refresh();
    }
  }));

  // refresh on change visiblity
  disposables.push(tree.onDidChangeVisibility(e => {
    if (e.visible) {
      treeDataProvider.refresh();
    }
  }));

  return [[], disposables];
}

export async function revealLogListing() {
  await vscode.commands.executeCommand('workbench.action.focusSideBar');
  await vscode.commands.executeCommand(`workbench.view.extension.aihive-activity-bar`);
}
