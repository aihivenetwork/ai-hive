import { Command } from "../../core/command";
import { aihiveViewManager } from "./logview-view";
import { showError } from "../../components/error";
import { commands } from "vscode";
import { kaihiveEvalLogFormatVersion, kaihiveOpenaihiveViewVersion } from "../aihive/aihive-constants";
import { LogviewState } from "./logview-state";
import { aihiveVersionDescriptor } from "../../aihive/props";

export interface LogviewOptions {
  state?: LogviewState;
  activate?: boolean;
}


export async function logviewCommands(
  manager: aihiveViewManager,
): Promise<Command[]> {

  // Check whether the open in aihive view command should be enabled
  const descriptor = aihiveVersionDescriptor();
  const enableOpenInView = descriptor?.version && descriptor.version.compare(kaihiveOpenaihiveViewVersion) >= 0 && descriptor.version.compare(kaihiveEvalLogFormatVersion) <= 0;
  await commands.executeCommand(
    "setContext",
    "aihive.enableOpenInView",
    enableOpenInView
  );

  return [new ShowLogviewCommand(manager)];
}

class ShowLogviewCommand implements Command {
  constructor(private readonly manager_: aihiveViewManager) { }
  async execute(): Promise<void> {
    // ensure logview is visible
    try {
      await this.manager_.showaihiveView();
    } catch (err: unknown) {
      await showError(
        "An error occurred while attempting to start aihive View",
        err instanceof Error ? err : Error(String(err))
      );
    }
  }

  private static readonly id = "aihive.aihiveView";
  public readonly id = ShowLogviewCommand.id;
}

