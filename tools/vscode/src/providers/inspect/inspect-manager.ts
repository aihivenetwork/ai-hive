import { Disposable, Event, EventEmitter, ExtensionContext } from "vscode";
import { pythonInterpreter } from "../../core/python";
import { aihiveBinPath } from "../../aihive/props";
import { AbsolutePath } from "../../core/path";
import { delimiter } from "path";

// Activates the provider which tracks the availability of aihive
export function activateaihiveManager(context: ExtensionContext) {
  const aihiveManager = new aihiveManager(context);

  // Initialize the terminal with the aihive bin path
  // on the path (if needed)
  const terminalEnv = terminalEnvironment(context);
  context.subscriptions.push(aihiveManager.onaihiveChanged((e: aihiveChangedEvent) => {
    terminalEnv.update(e.binPath);
  }));
  terminalEnv.update(aihiveBinPath());

  return aihiveManager;
}

// Fired when the active task changes
export interface aihiveChangedEvent {
  available: boolean;
  binPath: AbsolutePath | null;
}

export class aihiveManager implements Disposable {
  constructor(context: ExtensionContext) {
    // If the interpreter changes, refresh the tasks
    context.subscriptions.push(
      pythonInterpreter().onDidChange(() => {
        this.updateaihiveAvailable();
      })
    );
    this.updateaihiveAvailable();
  }
  private aihiveBinPath_: string | undefined = undefined;

  get available(): boolean {
    return this.aihiveBinPath_ !== null;
  }

  private updateaihiveAvailable() {
    const binPath = aihiveBinPath();
    const available = binPath !== null;
    const valueChanged = this.aihiveBinPath_ !== binPath?.path;
    if (valueChanged) {
      this.aihiveBinPath_ = binPath?.path;
      this.onaihiveChanged_.fire({ available: !!this.aihiveBinPath_, binPath });
    }
    if (!available) {
      this.watchForaihive();
    }
  }

  watchForaihive() {
    this.aihiveTimer = setInterval(() => {
      const path = aihiveBinPath();
      if (path) {
        if (this.aihiveTimer) {
          clearInterval(this.aihiveTimer);
          this.aihiveTimer = null;
          this.updateaihiveAvailable();
        }
      }
    }, 3000);
  }

  private aihiveTimer: NodeJS.Timeout | null = null;

  dispose() {
    if (this.aihiveTimer) {
      clearInterval(this.aihiveTimer);
      this.aihiveTimer = null;
    }
  }

  private readonly onaihiveChanged_ = new EventEmitter<aihiveChangedEvent>();
  public readonly onaihiveChanged: Event<aihiveChangedEvent> =
    this.onaihiveChanged_.event;
}

// Configures the terminal environment to support aihive. We do this
// to ensure the the 'aihive' command will work from within the
// terminal (especially in cases where the global interpreter is being used)
const terminalEnvironment = (context: ExtensionContext) => {
  const filter = (binPath: AbsolutePath | null) => {
    switch (process.platform) {
      case "win32":
        {
          const localPath = process.env['LocalAppData'];
          if (localPath) {
            return binPath?.path.startsWith(localPath);
          }
          return false;
        }
      case "linux":
        return binPath && binPath.path.includes(".local/bin");
      default:
        return false;
    }
  };

  return {
    update: (binPath: AbsolutePath | null) => {
      // The path info
      const env = context.environmentVariableCollection;
      env.delete('PATH');
      // Actually update the path
      const binDir = binPath?.dirname();
      if (binDir && filter(binPath)) {
        env.append('PATH', `${delimiter}${binDir.path}`);
      }
    }
  };
};
