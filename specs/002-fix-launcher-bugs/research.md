# Research: Fix Launcher Bugs

**Branch**: `002-fix-launcher-bugs` | **Date**: 2026-06-09

## Research Task 1: Output Channel Immediate Display

### Decision
Call `outputChannel.show(true)` at the beginning of each command handler (`start`, `stop`, `restart`), before any async operations.

### Rationale
- The current code only calls `show()` inside `startTomcatProcess()` (line 228 in `tomcatService.ts`), which runs after compilation
- Moving `show()` to the command registration in `registerCommands.ts` ensures the channel is visible immediately on button click
- Using `show(true)` (preserveFocus=true) keeps the editor focus intact per FR-002

### Alternatives Considered
- **Show channel inside `TomcatService.start()`**: Would couple the service to UI concerns, violating the command→service layering. Rejected per Constitution principle V (可维护代码).
- **Create a separate "reveal channel" command**: Over-engineering. Rejected per Constitution principle IV (简洁设计).

---

## Research Task 2: Localhost Log Output to Channel

### Decision
Replace `fs.watch()` on individual log files with `vscode.workspace.createFileSystemWatcher` using a `RelativePattern` on the logs directory, combined with byte-offset-based incremental reading to avoid line repetition.

### Rationale
- `fs.watch()` on a non-existent file throws `ENOENT` synchronously; the current code silently skips such files with `if (!fs.existsSync(fp)) return;` (line 274), which is why `localhost.{date}.log` is never watched — it typically doesn't exist when watchers are set up
- `vscode.workspace.createFileSystemWatcher` explicitly supports monitoring non-existent paths: "paths that do not exist in the file system will be monitored with a delay until created"
- It provides separate `onDidCreate`, `onDidChange`, `onDidDelete` events, eliminating the need to distinguish between file creation and modification
- The current `readFileSync().split('\n').slice(-5)` approach (line 278) always reads the last 5 lines, causing repeats on every change event. Byte-offset tracking (`Map<string, number>`) ensures only new lines are displayed

### Alternatives Considered
- **Watch parent directory with `fs.watch`**: Requires manual filename filtering, ambiguous `rename`/`change` events, OS-dependent behavior on Linux. Rejected due to platform inconsistency.
- **Poll with `fs.watchFile`**: Slower, more resource-intensive. Rejected because event-based watching is available.

---

## Research Task 3: Scoped Hot-Reload File Watching

### Decision
Add path prefix validation in `hotReloadService.ts` → `handleFileSave()` to only process files under `src/main/java/`, `src/main/resources/`, `src/main/webapp/`, or the root `pom.xml`. All other paths return early.

### Rationale
- The current `onDidSaveTextDocument` listener triggers for all file saves (line 23), with `identifyFileType()` only checking extension/filename, not path location
- Adding path scope checks in `handleFileSave()` is the simplest, most localized fix
- The monitored paths map directly to the spec requirements (FR-005, FR-006)

### Alternatives Considered
- **Use glob pattern in `createFileSystemWatcher` instead of `onDidSaveTextDocument`**: Would miss files opened but not in workspace. The current `onDidSaveTextDocument` approach correctly handles any open editor. Path filtering is sufficient.
- **Configurable monitored paths**: Over-engineering for a bug fix. Rejected per Constitution principle IV.

---

## Research Task 4: JRE_HOME from redhat.java

### Decision
Read the JDK path from `vscode.workspace.getConfiguration('java').get<string>('jdt.ls.java.home')` (note: the config key path is `java.jdt.ls.java.home` → section `java`, key `jdt.ls.java.home`). If not set or empty, fall back to system `JAVA_HOME`. Set `JRE_HOME` in the Tomcat process environment to this path.

### Rationale
- The redhat.java extension uses the configuration key `java.jdt.ls.java.home` (the newer setting; `java.home` is deprecated)
- The VSCode `getConfiguration('java').get('jdt.ls.java.home')` API correctly reads this dot-delimited key
- Setting `JRE_HOME` (not `JAVA_HOME`) in the process env is the correct approach because Tomcat's `setclasspath.bat` checks `JRE_HOME` first, then `JAVA_HOME`, and `JRE_HOME` takes priority
- If `java.jdt.ls.java.home` is undefined/empty, falling back to `process.env.JAVA_HOME` or `process.env.JRE_HOME` maintains backward compatibility

### Alternatives Considered
- **Use `java.home` (deprecated)`: Also read this as a secondary fallback for users who haven't migrated to the new setting. This provides maximum compatibility.
- **Read from `redhat.java` extension API directly**: The extension doesn't expose a public API for JDK path; it uses VSCode configuration. Reading from config is simpler and more reliable.
- **Set `JAVA_HOME` instead of `JRE_HOME`**: If `JAVA_HOME` is set, Tomcat's `setclasspath.bat` also checks for `bin/java.exe` presence. Setting `JRE_HOME` is cleaner since it's the primary path Tomcat checks and doesn't require the JDK's `bin/java.exe` validation.

---

## Implementation Summary

| Bug | Fix Location | Change Summary |
|-----|--------------|----------------|
| Channel not showing immediately | `registerCommands.ts` | Add `outputChannel.show(true)` at start of each command handler |
| Localhost log not output | `tomcatService.ts` | Replace `fs.watch` with `vscode.workspace.createFileSystemWatcher` + byte-offset reading |
| Hot-reload scope too broad | `hotReloadService.ts` | Add path prefix validation in `handleFileSave()` |
| Wrong JRE_HOME | `tomcatService.ts` + `configUtils.ts` | Read `java.jdt.ls.java.home` config and set `JRE_HOME` in process env |