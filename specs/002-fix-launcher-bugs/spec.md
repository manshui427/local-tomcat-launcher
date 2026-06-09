# Feature Specification: Fix Launcher Bugs

**Feature Branch**: `002-fix-launcher-bugs`

**Created**: 2026-06-09

**Status**: Draft

**Input**: 修复bug: 点击按钮之后channel应该立马弹出来; 日志localhost没有正确输出到channel; 资源的热更新监听需要范围 只监听 src/java src/resources src/webapp 和 pom.xml; JRE_HOME指定错误 需要使用redhat.java使用的jdk

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Output Channel Immediate Display (Priority: P1)

When a user clicks the Start/Stop/Restart button in the title bar or status bar, the output channel panel should immediately appear in the VSCode panel area, before any compilation or other operations begin. Currently, the channel only appears after compilation finishes and the Tomcat process starts launching, leaving the user with no visual feedback during the potentially lengthy Maven compilation phase.

**Why this priority**: Without immediate channel display, users have no feedback after clicking the button and may think the action failed, especially during long compilations. This is the most impactful UX bug.

**Independent Test**: Click the Start button and verify the output channel panel is visible within 1 second, before any compilation output appears.

**Acceptance Scenarios**:

1. **Given** the Tomcat is not running, **When** the user clicks the Start button, **Then** the output channel panel appears immediately (within 1 second) showing the initial start message, before compilation begins
2. **Given** the output channel is not visible, **When** the user clicks the Stop button, **Then** the output channel panel appears immediately showing the stop message
3. **Given** the Tomcat is running, **When** the user clicks the Restart button, **Then** the output channel panel appears immediately showing restart progress

---

### User Story 2 - Localhost Log Output to Channel (Priority: P1)

When Tomcat is running, the `localhost.{date}.log` file content should be correctly captured and displayed in the output channel. Currently, this log file is not being watched or its content is not correctly output to the channel, meaning users miss important application error messages and stack traces that are written to the localhost log.

**Why this priority**: Missing localhost log output means developers cannot see application errors in real-time, which is a critical debugging capability.

**Independent Test**: Start Tomcat, trigger an application error that writes to `localhost.{date}.log`, and verify the error content appears in the output channel with proper `[log]` prefix.

**Acceptance Scenarios**:

1. **Given** Tomcat is running with an application deployed, **When** an application error is written to `localhost.{date}.log`, **Then** the error content appears in the output channel with a `[log]` prefix
2. **Given** Tomcat is starting, **When** the localhost log file does not yet exist at the time watchers are set up, **Then** the watcher still gets created and captures content once the file appears
3. **Given** Tomcat is running with log watchers active, **When** log content is appended to `localhost.{date}.log`, **Then** only new lines (not previously displayed lines) are shown in the output channel

---

### User Story 3 - Scoped Hot-Reload File Watching (Priority: P2)

The hot-reload file watcher should only respond to file saves within specific project directories (`src/main/java`, `src/main/resources`, `src/main/webapp`) and the root `pom.xml` file. Saves to files outside these directories (e.g., test files, IDE configuration files, `.git` changes, `target/` outputs) should be ignored entirely to avoid unnecessary compilation triggers and resource sync operations.

**Why this priority**: Unscoped watching wastes system resources and may cause incorrect sync operations, but does not block core functionality as severely as the other bugs.

**Independent Test**: Save a file in `src/test/java/` and verify no hot-reload action is triggered. Save a file in `src/main/java/` and verify the hot-reload triggers correctly.

**Acceptance Scenarios**:

1. **Given** a Java project is open, **When** a file under `src/main/java/` is saved, **Then** the hot-reload Java incremental compile strategy is triggered
2. **Given** a Java project is open, **When** a file under `src/main/resources/` is saved, **Then** the hot-reload direct sync strategy is triggered and the file is copied to the deploy directory
3. **Given** a Java project is open, **When** a file under `src/main/webapp/` is saved, **Then** the hot-reload direct sync strategy is triggered
4. **Given** a Java project is open, **When** the root `pom.xml` is saved, **Then** the hot-reload dependency update strategy is triggered
5. **Given** a Java project is open, **When** a file under `src/test/`, `target/`, `.settings/`, `.idea/`, or any other non-monitored path is saved, **Then** no hot-reload action is triggered
6. **Given** a Java project is open, **When** a file in the workspace root (other than `pom.xml`) is saved, **Then** no hot-reload action is triggered

---

### User Story 4 - Correct JRE_HOME from redhat.java (Priority: P1)

When Tomcat starts, it should use the same JDK that the redhat.java extension uses, by setting `JRE_HOME` (or `JAVA_HOME`) in the Tomcat process environment to the JDK path provided by the redhat.java extension. Currently, the extension passes through the system environment's `JRE_HOME`/`JAVA_HOME`, which may differ from the JDK that redhat.java uses for compilation, leading to JDK version mismatches that cause Tomcat startup failures or runtime errors.

**Why this priority**: Using the wrong JDK can cause Tomcat startup failures, class version mismatches, and runtime errors that are difficult to diagnose. This is a critical correctness bug.

**Independent Test**: Start Tomcat with a system `JAVA_HOME` pointing to a different JDK version than redhat.java uses, and verify Tomcat starts with the redhat.java JDK.

**Acceptance Scenarios**:

1. **Given** the redhat.java extension is installed and activated, **When** Tomcat starts, **Then** the `JRE_HOME` environment variable in the Tomcat process is set to the JDK path used by redhat.java (specifically its `javaHome` configuration)
2. **Given** the system `JAVA_HOME` points to JDK 8, **When** redhat.java is configured to use JDK 17, **Then** Tomcat starts with JDK 17 (the redhat.java JDK)
3. **Given** the redhat.java JDK path cannot be determined, **When** Tomcat starts, **Then** the system falls back to the system `JAVA_HOME` and logs a warning message to the output channel

---

### Edge Cases

- What happens when the output channel is already visible when the user clicks Start?
- What happens when `localhost.{date}.log` is created after `catalina.{date}.log` (delayed file creation)?
- What happens when the log file is rotated or recreated while Tomcat is running?
- What happens when a saved file path contains both a monitored and non-monitored prefix (e.g., `src/main/java/com/example/Test.java` when only `src/test/` should be excluded)?
- What happens when `redhat.java` extension's `javaHome` setting returns an empty string or undefined?
- What happens when the redhat.java-provided JDK path does not exist on disk?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The output channel MUST be shown immediately (within 1 second) when the user clicks any action button (Start/Stop/Restart), before any other operations begin
- **FR-002**: The output channel display MUST preserve editor focus (not steal focus away from the active editor)
- **FR-003**: The `localhost.{date}.log` file MUST be watched and its content MUST be output to the channel with a `[log]` prefix, even if the file does not exist at the time watcher setup begins
- **FR-004**: The log watcher MUST NOT repeat lines that have already been displayed in the output channel (only display new content)
- **FR-005**: The hot-reload file watcher MUST only trigger for files saved within `src/main/java/`, `src/main/resources/`, `src/main/webapp/`, or the root `pom.xml` file
- **FR-006**: The hot-reload file watcher MUST ignore saves to files outside the monitored paths (e.g., `src/test/`, `target/`, IDE config files, `.git/` files)
- **FR-007**: When Tomcat starts, the `JRE_HOME` environment variable MUST be set to the JDK path provided by the redhat.java extension's `javaHome` configuration
- **FR-008**: If the redhat.java JDK path cannot be determined, the system MUST fall back to the system `JAVA_HOME` with a warning logged to the output channel
- **FR-009**: The log watcher for `localhost.{date}.log` MUST handle the case where the file is created after the watcher is set up (deferred file creation)

### Key Entities

- **Output Channel**: The VSCode output panel that displays Tomcat logs, compilation output, and status messages
- **Log File Watcher**: File system watcher that monitors Tomcat log files (`catalina.{date}.log`, `localhost.{date}.log`) for new content
- **Hot-Reload File Watcher**: VSCode document save listener that triggers appropriate recompile/resync actions based on saved file type and location
- **JDK Path**: The Java runtime path obtained from the redhat.java extension's configuration, used to set `JRE_HOME` for the Tomcat process environment

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Clicking any action button results in the output channel becoming visible within 1 second, regardless of compilation duration
- **SC-002**: Application errors written to `localhost.{date}.log` appear in the output channel within 2 seconds of being written to the log file
- **SC-003**: Saving a file outside the monitored directories (`src/main/java`, `src/main/resources`, `src/main/webapp`, root `pom.xml`) produces zero hot-reload log messages in the output channel
- **SC-004**: Tomcat starts using the same JDK version that redhat.java uses for compilation, verifiable by checking the Tomcat startup log output for the correct Java version
- **SC-005**: No previously displayed log lines are repeated when new log content is appended to watched log files

## Assumptions

- The redhat.java extension provides its configured JDK path through the `java.home` VSCode configuration setting (`java.jdt.ls.javaHome` or the extension's API)
- The `localhost.{date}.log` file uses the same date format as `catalina.{date}.log` (already confirmed: `YYYY-MM-DD`)
- The project follows the standard Maven directory layout (`src/main/java`, `src/main/resources`, `src/main/webapp`)
- Only one workspace folder is relevant for the hot-reload scope (already the current behavior)
- The output channel `show(true)` method (with `preserveFocus=true`) is the correct UX for displaying output without stealing focus
- The JDK path should be retrieved from the VSCode configuration setting `java.jdt.ls.javaHome` (the standard redhat.java setting). If that setting is empty/undefined, fall back to the system `JAVA_HOME` per FR-008.

## Clarifications

### Session 2026-06-09

- Clarification review completed. No critical ambiguities required formal Q&A. The JDK path source (Assumption item 1) was resolved by confirming `java.jdt.ls.javaHome` as the standard approach, which has been promoted from Assumption to a definitive note.