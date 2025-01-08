import { Command } from "../../core/command";
import { toAbsolutePath } from "../../core/path";
import { aihiveEvalManager } from "../aihive/aihive-eval";
import { ActiveTaskManager } from "../active-task/active-task-provider";
import { scheduleReturnFocus } from "../../components/focus";

export class RunConfigTaskCommand implements Command {
  constructor(private readonly manager_: ActiveTaskManager,
    private readonly aihiveMgr_: aihiveEvalManager
  ) { }
  async execute(): Promise<void> {
    const taskInfo = this.manager_.getActiveTaskInfo();
    if (taskInfo) {
      const docPath = toAbsolutePath(taskInfo.document.fsPath);
      const evalPromise = this.aihiveMgr_.startEval(docPath, taskInfo.activeTask?.name, false);
      scheduleReturnFocus("aihive.task-configuration.focus");
      await evalPromise;
    }
  }

  private static readonly id = "aihive.runConfigTask";
  public readonly id = RunConfigTaskCommand.id;
}

export class DebugConfigTaskCommand implements Command {
  constructor(private readonly manager_: ActiveTaskManager,
    private readonly aihiveMgr_: aihiveEvalManager
  ) { }
  async execute(): Promise<void> {
    const taskInfo = this.manager_.getActiveTaskInfo();
    if (taskInfo) {
      const docPath = toAbsolutePath(taskInfo.document.fsPath);
      const evalPromise = this.aihiveMgr_.startEval(docPath, taskInfo.activeTask?.name, true);
      scheduleReturnFocus("aihive.task-configuratio.focus");
      await evalPromise;
    }
  }

  private static readonly id = "aihive.debugConfigTask";
  public readonly id = DebugConfigTaskCommand.id;
}
