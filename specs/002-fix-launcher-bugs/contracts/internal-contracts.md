# Internal Contracts: Fix Launcher Bugs

**Branch**: `002-fix-launcher-bugs` | **Date**: 2026-06-09

## Overview

This is a VSCode extension with no external API surface. All contracts are internal module interfaces. This document describes the contract changes for the four bug fixes.

---

## Contract 1: OutputChannelManager → Command Handlers

**Before**: `OutputChannelManager.show()` is called inside `TomcatService.startTomcatProcess()` (after compilation).

**After**: `OutputChannelManager.show(true)` is called at the beginning of each command handler in `registerCommands.ts`, before any async operations.

### Interface (unchanged)

```typescript
// src/ui/outputChannel.ts — no changes to this interface
class OutputChannelManager {
  show(preserveFocus?: boolean): void;
  // ... other methods unchanged
}
```

### New Callers

| Command | Module | Call Location |
|---------|--------|---------------|
| `local-tomcat-launcher.start` | `registerCommands.ts` | First line inside try block, before `tomcatService.start()` |
| `local-tomcat-launcher.stop` | `registerCommands.ts` | First line inside try block, before `tomcatService.stop()` |
| `local-tomcat-launcher.restart` | `registerCommands.ts` | First line inside try block, before `tomcatService.restart()` |

---

## Contract 2: Log Watcher (TomcatService)

**Before**: Uses `fs.watch()` on individual file paths with `readFileSync().slice(-5)` for content.

**After**: Uses `vscode.workspace.createFileSystemWatcher` with `RelativePattern` on logs directory, plus byte-offset incremental reading.

### Changed Methods

| Method | Before | After |
|--------|--------|-------|
| `watchTomcatLogs(base)` | Creates `fs.FSWatcher` per log file; skips non-existent files | Creates single `vscode.FileSystemWatcher` with glob `*.log`; handles file creation events |
| `watchLogFile(fp)` | `fs.watch(fp, callback)` with `readFileSync().slice(-5)` | Removed — replaced by `readNewLines(fp, isNewFile)` using byte-offset tracking |
| `clearLogWatchers()` | `w.close()` per watcher | `w.dispose()` per watcher; also clears `logFileOffsets` Map |

### New Method

```typescript
/**
 * 读取日志文件的新增行（基于字节偏移量增量读取，避免重复输出）
 * @param filePath 日志文件绝对路径
 * @param isNewFile 是否为新创建的文件（重置偏移量为0）
 */
private readNewLines(filePath: string, isNewFile: boolean): void
```

### New Fields

| Field | Type | Purpose |
|-------|------|---------|
| `logWatchers` | `vscode.Disposable[]` | Changed from `fs.FSWatcher[]` |
| `logFileOffsets` | `Map<string, number>` | Byte offset per file for incremental reading |

---

## Contract 3: Hot-Reload Path Filtering (HotReloadService)

**Before**: `handleFileSave()` processes all saved documents without path scope checking.

**After**: `handleFileSave()` validates the file path against a whitelist of monitored directories before processing.

### New Constants

```typescript
// src/constants.ts
/** 热更新监听的目录前缀（相对于workspace根目录） */
const HOT_RELOAD_MONITORED_PATHS: readonly string[] = [
  'src/main/java',
  'src/main/resources',
  'src/main/webapp',
];

/** 热更新监听的根目录文件名 */
const HOT_RELOAD_ROOT_FILES: readonly string[] = ['pom.xml'];
```

### Modified Method Signature (unchanged, but new early return)

```typescript
// src/services/hotReloadService.ts
private async handleFileSave(document: vscode.TextDocument): Promise<void>
// New behavior: returns early if file path doesn't match HOT_RELOAD_MONITORED_PATHS or HOT_RELOAD_ROOT_FILES
```

---

## Contract 4: JDK Path Resolution (ConfigUtils)

**Before**: No JDK path resolution — Tomcat inherits system `JRE_HOME`/`JAVA_HOME`.

**After**: `ConfigUtils.getJavaHome()` resolves JDK path from redhat.java configuration with system fallback.

### New Method

```typescript
// src/utils/configUtils.ts
/**
 * 获取Java运行时路径，优先使用redhat.java配置的JDK路径
 * 查找顺序: java.jdt.ls.java.home → java.home → system JAVA_HOME → system JRE_HOME
 * @returns JDK/JRE路径字符串，未找到返回undefined
 */
static getJavaHome(): string | undefined
```

### Modified Method

```typescript
// src/services/tomcatService.ts → startTomcatProcess
// 新增: 从redhat.java配置获取JRE_HOME并设置到env中
const javaHome = ConfigUtils.getJavaHome();
if (javaHome) {
  env.JRE_HOME = javaHome;
  this.outputChannel.appendLine(`[JRE_HOME] ${javaHome}`);
} else {
  this.outputChannel.appendLine('[警告] 未找到Java运行时配置，使用系统默认JRE_HOME/JAVA_HOME');
}
```

### New Constants

```typescript
// src/constants.ts
/** redhat.java JDK路径配置键 */
export const JAVA_CONFIG_SECTION = 'java';
export const JAVA_JDT_LS_HOME_KEY = 'jdt.ls.java.home';
export const JAVA_HOME_DEPRECATED_KEY = 'home';
```