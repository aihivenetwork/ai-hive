import { SemVer, coerce } from "semver";

import { log } from "../core/log";
import { pythonBinaryPath, pythonInterpreter } from "../core/python";
import { AbsolutePath, toAbsolutePath } from "../core/path";
import { Disposable } from "vscode";
import { runProcess } from "../core/process";
import { join } from "path";
import { userDataDir, userRuntimeDir } from "../core/appdirs";
import { kaihiveChangeEvalSignalVersion } from "../providers/aihive/aihive-constants";
import { existsSync } from "fs";

export const kPythonPackageName = "aihive";

export interface VersionDescriptor {
  raw: string;
  version: SemVer,
  isDeveloperBuild: boolean
}

// we cache the results of these functions so long as
// they (a) return success, and (b) the active python
// interpreter hasn't been changed
class aihivePropsCache implements Disposable {
  private readonly eventHandle_: Disposable;

  constructor(
    private binPath_: AbsolutePath | null,
    private version_: VersionDescriptor | null,
    private viewPath_: AbsolutePath | null
  ) {
    this.eventHandle_ = pythonInterpreter().onDidChange(() => {
      log.info("Resetting aihive props to null");
      this.binPath_ = null;
      this.version_ = null;
      this.viewPath_ = null;
    });
  }

  get binPath(): AbsolutePath | null {
    return this.binPath_;
  }

  setBinPath(binPath: AbsolutePath) {
    log.info(`aihive bin path: ${binPath.path}`);
    this.binPath_ = binPath;
  }

  get version(): VersionDescriptor | null {
    return this.version_;
  }

  setVersion(version: VersionDescriptor) {
    log.info(`aihive version: ${version.version.toString()}`);
    this.version_ = version;
  }

  get viewPath(): AbsolutePath | null {
    return this.viewPath_;
  }

  setViewPath(path: AbsolutePath) {
    log.info(`aihive view path: ${path.path}`);
    this.viewPath_ = path;
  }

  dispose() {
    this.eventHandle_.dispose();
  }
}

export function initaihiveProps(): Disposable {
  aihivePropsCache_ = new aihivePropsCache(null, null, null);
  return aihivePropsCache_;
}

let aihivePropsCache_: aihivePropsCache;

export function aihiveVersionDescriptor(): VersionDescriptor | null {
  if (aihivePropsCache_.version) {
    return aihivePropsCache_.version;
  } else {
    const aihiveBin = aihiveBinPath();
    if (aihiveBin) {
      try {
        const versionJson = runProcess(aihiveBin, [
          "info",
          "version",
          "--json",
        ]);
        const version = JSON.parse(versionJson) as {
          version: string;
          path: string;
        };

        const parsedVersion = coerce(version.version);
        if (parsedVersion) {
          const isDeveloperVersion = version.version.indexOf('.dev') > -1;
          const aihiveVersion = {
            raw: version.version,
            version: parsedVersion,
            isDeveloperBuild: isDeveloperVersion
          };
          aihivePropsCache_.setVersion(aihiveVersion);
          return aihiveVersion;
        } else {
          return null;
        }
      } catch (error) {
        log.error("Error attempting to read aihive version.");
        log.error(error instanceof Error ? error : String(error));
        return null;
      }
    } else {
      return null;
    }
  }
}

// path to aihive view www assets
export function aihiveViewPath(): AbsolutePath | null {
  if (aihivePropsCache_.viewPath) {
    return aihivePropsCache_.viewPath;
  } else {
    const aihiveBin = aihiveBinPath();
    if (aihiveBin) {
      try {
        const versionJson = runProcess(aihiveBin, [
          "info",
          "version",
          "--json",
        ]);
        const version = JSON.parse(versionJson) as {
          version: string;
          path: string;
        };
        let viewPath = toAbsolutePath(version.path)
          .child("_view")
          .child("www")
          .child("dist");

        if (!existsSync(viewPath.path)) {
          // The dist folder is only available on newer versions, this is for
          // backwards compatibility only
          viewPath = toAbsolutePath(version.path)
            .child("_view")
            .child("www");
        }
        aihivePropsCache_.setViewPath(viewPath);
        return viewPath;
      } catch (error) {
        log.error("Error attempting to read aihive view path.");
        log.error(error instanceof Error ? error : String(error));
        return null;
      }
    } else {
      return null;
    }
  }
}

export function aihiveBinPath(): AbsolutePath | null {
  if (aihivePropsCache_.binPath) {
    return aihivePropsCache_.binPath;
  } else {
    const interpreter = pythonInterpreter();
    if (interpreter.available) {
      try {
        const binPath = pythonBinaryPath(interpreter, aihiveFileName());
        if (binPath) {
          aihivePropsCache_.setBinPath(binPath);
        }
        return binPath;
      } catch (error) {
        log.error("Error attempting to read aihive version.");
        log.error(error instanceof Error ? error : String(error));
        return null;
      }
    } else {
      return null;
    }
  }
}

export function aihiveLastEvalPaths(): AbsolutePath[] {
  const descriptor = aihiveVersionDescriptor();
  const fileName =
    descriptor && descriptor.version.compare(kaihiveChangeEvalSignalVersion) < 0
      ? "last-eval"
      : "last-eval-result";

  return [userRuntimeDir(kPythonPackageName), userDataDir(kPythonPackageName)]
    .map(dir => join(dir, "view", fileName))
    .map(toAbsolutePath);
}

function aihiveFileName(): string {
  switch (process.platform) {
    case "darwin":
      return "aihive";
    case "win32":
      return "aihive.exe";
    case "linux":
    default:
      return "aihive";
  }
}