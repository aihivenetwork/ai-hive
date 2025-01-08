import { workspace } from "vscode";

// aihive Settings
export interface aihiveSettings {
  notifyEvalComplete: boolean;
}
export type aihiveLogViewStyle = "html" | "text";

// Settings namespace and constants
const kaihiveConfigSection = "aihive";
const kaihiveConfigNotifyEvalComplete = "notifyEvalComplete";

// Manages the settings for the aihive extension
export class aihiveSettingsManager {
  constructor(private readonly onChanged_: (() => void) | undefined) {
    workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(kaihiveConfigSection)) {
        // Configuration for has changed
        this.settings_ = undefined;
        if (this.onChanged_) {
          this.onChanged_();
        }
      }
    });
  }
  private settings_: aihiveSettings | undefined;

  // get the current settings values
  public getSettings(): aihiveSettings {
    if (!this.settings_) {
      this.settings_ = this.readSettings();
    }
    return this.settings_;
  }

  // write the notification pref
  public setNotifyEvalComplete(notify: boolean) {
    const configuration = workspace.getConfiguration(kaihiveConfigSection,);
    void configuration.update(kaihiveConfigNotifyEvalComplete, notify, true);
  }


  // Read settings values directly from VS.Code
  private readSettings() {
    const configuration = workspace.getConfiguration(kaihiveConfigSection);
    const notifyEvalComplete = configuration.get<boolean>(kaihiveConfigNotifyEvalComplete);
    return {
      notifyEvalComplete: notifyEvalComplete !== undefined ? notifyEvalComplete : true
    };
  }

}