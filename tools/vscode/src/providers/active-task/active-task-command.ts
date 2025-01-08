import { Command } from "../../core/command";
import { toAbsolutePath } from "../../core/path";
import { aihiveEvalManager } from "../aihive/aihive-eval";
import { ActiveTaskManager } from "./active-task-provider";



export class RunActiveTaskCommand implements Command {
  constructor(private readonly manager_: ActiveTaskManager,
    private readonly aihiveMgr_: aihiveEvalManager
  ) { }
  async execute(): Promise<void> {
    const taskInfo = this.manager_.getActiveTaskInfo();
    if (taskInfo) {
      const docPath = toAbsolutePath(taskInfo.document.fsPath);
      await this.aihiveMgr_.startEval(docPath, taskInfo.activeTask?.name, false);
    }
  }

  private static readonly id = "aihive.runActiveTask";
  public readonly id = RunActiveTaskCommand.id;
}

export class DebugActiveTaskCommand implements Command {
  constructor(private readonly manager_: ActiveTaskManager,
    private readonly aihiveMgr_: aihiveEvalManager
  ) { }
  async execute(): Promise<void> {
    const taskInfo = this.manager_.getActiveTaskInfo();
    if (taskInfo) {
      const docPath = toAbsolutePath(taskInfo.document.fsPath);
      await this.aihiveMgr_.startEval(docPath, taskInfo.activeTask?.name, true);
    }
  }

  private static readonly id = "aihive.debugActiveTask";
  public readonly id = DebugActiveTaskCommand.id;
}

