import { Uri } from "vscode";
import { Command } from "../../core/command";
import { aihiveEvalManager } from "./aihive-eval";
import { toAbsolutePath } from "../../core/path";
import { scheduleFocusActiveEditor } from "../../components/focus";

export function aihiveEvalCommands(manager: aihiveEvalManager): Command[] {
  return [new RunEvalCommand(manager), new DebugEvalCommand(manager)];
}

export class RunEvalCommand implements Command {
  constructor(private readonly manager_: aihiveEvalManager) { }
  async execute(documentUri: Uri, fnName: string): Promise<void> {
    const cwd = toAbsolutePath(documentUri.fsPath);

    const evalPromise = this.manager_.startEval(cwd, fnName, false);
    scheduleFocusActiveEditor();
    await evalPromise;
  }
  private static readonly id = "aihive.runTask";
  public readonly id = RunEvalCommand.id;
}

export class DebugEvalCommand implements Command {
  constructor(private readonly manager_: aihiveEvalManager) { }
  async execute(documentUri: Uri, fnName: string): Promise<void> {
    const cwd = toAbsolutePath(documentUri.fsPath);
    await this.manager_.startEval(cwd, fnName, true);
  }
  private static readonly id = "aihive.debugTask";
  public readonly id = DebugEvalCommand.id;
}

