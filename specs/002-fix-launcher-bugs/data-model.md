# Data Model: Fix Launcher Bugs

**Branch**: `002-fix-launcher-bugs` | **Date**: 2026-06-09

## Entity Changes

This feature modifies existing entities; no new persistent data structures are introduced. Changes are in-memory state only.

### Modified Entities

#### 1. OutputChannelManager (unchanged entity, new usage pattern)

No schema changes. The `show(preserveFocus?: boolean)` method already exists. The change is in **where** it is called — moved from inside `TomcatService` to the command handlers in `registerCommands.ts`.

---

#### 2. Log Watcher State (TomcatService)

**Current fields:**

| Field | Type | Purpose |
|-------|------|---------|
| `logWatchers` | `fs.FSWatcher[]` | Holds native file watchers for catalina/localhost logs |

**Modified to:**

| Field | Type | Purpose |
|-------|------|---------|
| `logWatchers` | `vscode.Disposable[]` | Holds VSCode file system watchers |
| `logFileOffsets` | `Map<string, number>` | Byte offset per log file for incremental reading |

**Rationale**: `vscode.workspace.createFileSystemWatcher` returns `vscode.Disposable` (not `fs.FSWatcher`), and byte-offset tracking prevents line repetition.

**State transitions for `logFileOffsets`:**

| Event | Before | After |
|-------|--------|-------|
| File created (onDidCreate) | No entry | `offset = 0`, then updated to file size after reading |
| File changed (onDidChange) | Current offset | Offset updated to `currentOffset + bytesRead` |
| File truncated (size < offset) | Old offset | Reset to `0`, re-read from start |
| Tomcat stopped (clearLogWatchers) | All entries | Map cleared |

---

#### 3. Hot-Reload Path Scope (HotReloadService)

No schema changes to `HotReloadService`. The change is a path validation check at the beginning of `handleFileSave()`.

**New constant:**

| Constant | Type | Value |
|----------|------|-------|
| `HOT_RELOAD_MONITORED_PATHS` | `string[]` | `['src/main/java', 'src/main/resources', 'src/main/webapp']` |
| `HOT_RELOAD_ROOT_FILES` | `string[]` | `['pom.xml']` |

**Filtering logic:**

```
Given a saved file path (relative to workspace):
1. If path equals a ROOT_FILES entry → process (HOT_SWAP or DEPENDENCY_UPDATE)
2. If path starts with any MONITORED_PATHS entry + '/' → process with appropriate strategy
3. Otherwise → return early, no action
```

---

#### 4. JDK Path Resolution (new utility in ConfigUtils)

**New method:**

| Method | Return Type | Description |
|--------|-------------|-------------|
| `ConfigUtils.getJavaHome()` | `string \| undefined` | Reads `java.jdt.ls.java.home` from VSCode config; falls back to `java.home` (deprecated); falls back to `process.env.JAVA_HOME` or `process.env.JRE_HOME` |

**Configuration key resolution order:**

| Priority | VSCode Config Key | Section | Key | Status |
|----------|-------------------|---------|-----|--------|
| 1st | `java.jdt.ls.java.home` | `java` | `jdt.ls.java.home` | Current |
| 2nd | `java.home` | `java` | `home` | Deprecated fallback |
| 3rd | System env | N/A | `process.env.JAVA_HOME` | System fallback |
| 4th | System env | N/A | `process.env.JRE_HOME` | System fallback |

**New constant:**

| Constant | Type | Value |
|----------|------|-------|
| `JAVA_JDT_LS_HOME_CONFIG` | `string` | `'java'` (section name) |
| `JAVA_JDT_LS_HOME_KEY` | `string` | `'jdt.ls.java.home'` |
| `JAVA_HOME_CONFIG_KEY` | `string` | `'home'` (deprecated key) |

---

#### 5. Tomcat Process Environment (TomcatService.startTomcatProcess)

**Current env vars set:**

| Key | Value |
|-----|-------|
| `CATALINA_HOME` | tomcatHome |
| `CATALINA_BASE` | catalinaBase |
| `JPDA_ADDRESS` | debugPort |
| `JPDA_TRANSPORT` | `'dt_socket'` |
| `JAVA_OPTS` | vmOptions (if set) |

**New env vars added:**

| Key | Value | Source |
|-----|-------|--------|
| `JRE_HOME` | Result of `ConfigUtils.getJavaHome()` | redhat.java config or system fallback |

**Validation**: If `getJavaHome()` returns a path, log it to the output channel. If it returns `undefined`, log a warning and let Tomcat's `setclasspath.bat` use whatever system `JRE_HOME`/`JAVA_HOME` is available.

## Relationship Diagram

```text
registerCommands.ts
  │─ calls outputChannel.show(true) ──► OutputChannelManager.show()
  │─ calls tomcatService.start() ──► TomcatService.start()
  │                                    │─ calls ConfigUtils.getJavaHome() ──► VSCode config 'java.jdt.ls.java.home'
  │                                    │─ sets JRE_HOME in process env
  │                                    │─ creates FileSystemWatcher for logs ──► vscode.workspace.createFileSystemWatcher()
  │                                    │─ tracks byte offsets ──► logFileOffsets Map

hotReloadService.ts
  │─ handleFileSave(document)
      │─ checks path against HOT_RELOAD_MONITORED_PATHS
      │─ if matches → identifyFileType() → strategy dispatch
      │─ if not matches → return early
```