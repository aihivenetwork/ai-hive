import { ExtensionContext, TextDocumentShowOptions, Uri, commands } from "vscode";
import { kaihiveLogViewType } from "./logview/logview-editor";
import { hasMinimumaihiveVersion } from "../aihive/version";
import { kaihiveEvalLogFormatVersion } from "./aihive/aihive-constants";
import { aihiveViewManager } from "./logview/logview-view";
import { withEditorAssociation } from "../core/vscode/association";


export function activateOpenLog(
  context: ExtensionContext,
  viewManager: aihiveViewManager
) {

  context.subscriptions.push(commands.registerCommand('aihive.openLogViewer', async (uri: Uri) => {

    // function to open using defualt editor in preview mode
    const openLogViewer = async () => {
      await commands.executeCommand(
        'vscode.open',
        uri,
        <TextDocumentShowOptions>{ preview: true }
      );
    };

    if (hasMinimumaihiveVersion(kaihiveEvalLogFormatVersion)) {
      if (uri.path.endsWith(".eval")) {

        await openLogViewer();

      } else {

        await withEditorAssociation(
          {
            viewType: kaihiveLogViewType,
            filenamePattern: "{[0-9][0-9][0-9][0-9]}-{[0-9][0-9]}-{[0-9][0-9]}T{[0-9][0-9]}[:-]{[0-9][0-9]}[:-]{[0-9][0-9]}*{[A-Za-z0-9]{21}}*.json"
          },
          openLogViewer
        );

      }

      // notify the logs pane that we are doing this so that it can take a reveal action
      await commands.executeCommand('aihive.logListingReveal', uri);
    } else {
      await viewManager.showLogFile(uri, "activate");
    }

  }));

}