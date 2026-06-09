# Quickstart: Fix Launcher Bugs

**Branch**: `002-fix-launcher-bugs` | **Date**: 2026-06-09

## Prerequisites

- Node.js 18+ (matching VSCode Extension Host runtime)
- VSCode 1.85.0+
- redhat.java extension >= 1.51.0
- A Maven Java WAR project with `pom.xml` in workspace root

## Build & Run

```bash
# Install dependencies
npm install

# Compile TypeScript
npm run compile

# Watch mode for development
npm run watch

# Package as VSIX
npm run package
```

## Testing the Bug Fixes

### Bug 1: Output Channel Immediate Display

1. Open a Maven WAR project in VSCode
2. Close the output panel if it's visible
3. Click the Start (▶) button in the title bar
4. **Verify**: The output channel panel appears immediately (within 1 second) showing `=== 启动Tomcat ===`, before compilation output appears
5. Repeat for Stop (■) and Restart (↻) buttons

### Bug 2: Localhost Log Output

1. Start Tomcat with a deployed WAR that has intentional errors (e.g., a servlet that throws an exception)
2. **Verify**: The `localhost.{date}.log` content appears in the output channel with `[log]` prefix
3. Stop and restart Tomcat, watching for `localhost.{date}.log` creation after startup
4. **Verify**: Log lines are not repeated — each line appears only once

### Bug 3: Scoped Hot-Reload

1. Start Tomcat with a running application
2. Edit and save a file under `src/main/java/`
3. **Verify**: Hot-reload triggers (log message appears with `[热加载]` prefix)
4. Edit and save a file under `src/test/java/`
5. **Verify**: No hot-reload action (no log message)
6. Edit and save `pom.xml` in workspace root
7. **Verify**: Dependency update triggers (log message appears)
8. Edit and save a file in `.vscode/` or `.git/` directory
9. **Verify**: No hot-reload action

### Bug 4: Correct JRE_HOME

1. Set your system `JAVA_HOME` to a different JDK version than what redhat.java uses
2. In VSCode settings, configure `java.jdt.ls.java.home` to point to the desired JDK (e.g., JDK 17)
3. Start Tomcat
4. **Verify**: The output channel shows `[JRE_HOME] <path-to-jdk17>`, not the system `JAVA_HOME`
5. Remove the `java.jdt.ls.java.home` setting
6. Start Tomcat again
7. **Verify**: A warning message appears and Tomcat uses the system `JAVA_HOME`

## Debug

Press F5 in VSCode to launch the Extension Development Host with the local-tomcat-launcher loaded. Set breakpoints in:

- `registerCommands.ts` — for Bug 1 (channel display)
- `tomcatService.ts` → `watchTomcatLogs()` / `readNewLines()` — for Bug 2 (log watching)
- `hotReloadService.ts` → `handleFileSave()` — for Bug 3 (path filtering)
- `configUtils.ts` → `getJavaHome()` / `tomcatService.ts` → `startTomcatProcess()` — for Bug 4 (JRE_HOME)