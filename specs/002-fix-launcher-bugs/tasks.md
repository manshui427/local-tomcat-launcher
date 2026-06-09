# Tasks: Fix Launcher Bugs

**Input**: Design documents from `/specs/002-fix-launcher-bugs/`

**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/

**Tests**: Not explicitly requested. Manual testing via VSCode Extension Development Host per quickstart.md.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `src/` at repository root
- Paths use the existing project structure per plan.md

---

## Phase 1: Setup (Shared Constants)

**Purpose**: Add shared constants that multiple user stories depend on

- [x] T001 Add `HOT_RELOAD_MONITORED_PATHS`, `HOT_RELOAD_ROOT_FILES`, `JAVA_CONFIG_SECTION`, `JAVA_JDT_LS_HOME_KEY`, `JAVA_HOME_DEPRECATED_KEY` constants to `src/constants.ts`

**Checkpoint**: Constants available for US2, US3, and US4 implementation

---

## Phase 2: User Story 1 - Output Channel Immediate Display (Priority: P1) 🎯 MVP

**Goal**: Output channel appears immediately when user clicks Start/Stop/Restart button, before any compilation or process operations begin

**Independent Test**: Click Start button with output channel closed — channel should appear within 1 second showing initial message, before Maven compilation output

### Implementation for User Story 1

- [x] T002 [US1] Add `outputChannelManager` parameter to `registerCommands()` function signature in `src/commands/registerCommands.ts` and add `this.outputChannel.show(true)` as first line inside try block for each of the three command handlers (start, stop, restart)
- [x] T003 [US1] Update `registerCommands()` call in `src/extension.ts` to pass `outputChannelManager` as argument

**Checkpoint**: User Story 1 complete — channel pops up immediately on any button click

---

## Phase 3: User Story 2 - Localhost Log Output to Channel (Priority: P1)

**Goal**: All Tomcat log files including `localhost.{date}.log` are watched and their content is output to the channel without line repetition, even when log files are created after watcher setup

**Independent Test**: Start Tomcat, trigger an application error that writes to `localhost.{date}.log`, verify the error appears in the output channel with `[log]` prefix and no repeated lines

### Implementation for User Story 2

- [x] T004 [US2] In `src/services/tomcatService.ts`: Change `logWatchers` type from `fs.FSWatcher[]` to `vscode.Disposable[]`, add `logFileOffsets: Map<string, number>` field, and add `import * as vscode from 'vscode'` (if not already imported)
- [x] T005 [US2] In `src/services/tomcatService.ts`: Replace the `watchTomcatLogs(base: string)` method — use `vscode.workspace.createFileSystemWatcher` with `new vscode.RelativePattern(vscode.Uri.file(logsDir), '*.log')` to create a single watcher; register `onDidCreate` (call `readNewLines(fp, true)`) and `onDidChange` (call `readNewLines(fp, false)`) handlers; push watcher to `this.logWatchers`; after watcher setup, read any pre-existing log files for today's date
- [x] T006 [US2] In `src/services/tomcatService.ts`: Replace `watchLogFile(fp: string)` method with `readNewLines(filePath: string, isNewFile: boolean): void` — use `fs.statSync` to get file size; compare with stored offset in `logFileOffsets`; if `isNewFile` or file was truncated (size < offset), reset offset to 0 and read from beginning; if size > offset, read from offset using `fs.createReadStream({ start: offset })`; output only new non-empty lines with `[log]` prefix; update `logFileOffsets` after reading
- [x] T007 [US2] In `src/services/tomcatService.ts`: Update `clearLogWatchers()` — change `w.close()` to `w.dispose()` for each watcher; also call `this.logFileOffsets.clear()` to reset byte tracking
- [x] T008 [US2] Remove unused `import * as fs from 'fs'` references that are no longer needed by the log watcher code (keep `fs` imports used by other methods in the file)

**Checkpoint**: User Story 2 complete — localhost log appears in channel without repetition, deferred file creation handled

---

## Phase 4: User Story 3 - Scoped Hot-Reload File Watching (Priority: P2)

**Goal**: Hot-reload file watcher only triggers for files under `src/main/java/`, `src/main/resources/`, `src/main/webapp/`, and root `pom.xml`; all other file saves are ignored

**Independent Test**: Save a file in `src/test/java/` — no hot-reload log message appears. Save a file in `src/main/java/` — hot-reload triggers correctly

### Implementation for User Story 3

- [x] T009 [US3] In `src/services/hotReloadService.ts`: Add path scope validation at the beginning of `handleFileSave()` — compute `relativePath` as `path.relative(workspacePath, filePath)`; check if `relativePath` equals any `HOT_RELOAD_ROOT_FILES` entry (`pom.xml`); check if `relativePath` starts with any `HOT_RELOAD_MONITORED_PATHS` entry followed by `/` or `\`; if neither condition matches, return early with no action; import the new constants from `../constants`

**Checkpoint**: User Story 3 complete — only monitored directories and root pom.xml trigger hot-reload

---

## Phase 5: User Story 4 - Correct JRE_HOME from redhat.java (Priority: P1)

**Goal**: Tomcat uses the same JDK that redhat.java uses for compilation, by setting `JRE_HOME` in the Tomcat process environment

**Independent Test**: Start Tomcat with system `JAVA_HOME` pointing to a different JDK than redhat.java's config — verify `[JRE_HOME] <path>` in output channel matches redhat.java's JDK, not the system default

### Implementation for User Story 4

- [x] T010 [US4] In `src/utils/configUtils.ts`: Add `static getJavaHome(): string | undefined` method — read `vscode.workspace.getConfiguration(JAVA_CONFIG_SECTION).get<string>(JAVA_JDT_LS_HOME_KEY)` first; if empty/undefined, read deprecated `java.home` key via `getConfiguration(JAVA_CONFIG_SECTION).get<string>(JAVA_HOME_DEPRECATED_KEY)`; if still empty, fall back to `process.env.JAVA_HOME`; if still empty, fall back to `process.env.JRE_HOME`; import constants from `../constants`
- [x] T011 [US4] In `src/services/tomcatService.ts`: In `startTomcatProcess()`, after constructing the `env` object, add `JRE_HOME` — call `ConfigUtils.getJavaHome()`; if result is non-empty string, set `env.JRE_HOME = javaHome` and log `[JRE_HOME] ${javaHome}`; if result is empty/undefined, log `[警告] 未找到Java运行时配置，使用系统默认JRE_HOME/JAVA_HOME`; import `ConfigUtils` if not already imported

**Checkpoint**: User Story 4 complete — Tomcat starts with redhat.java's configured JDK

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Verification, cleanup, and edge case handling across all stories

- [x] T012 [P] Verify TypeScript compilation succeeds with `npm run compile` — ensure no type errors in all modified files (`constants.ts`, `registerCommands.ts`, `extension.ts`, `tomcatService.ts`, `hotReloadService.ts`, `configUtils.ts`)
- [x] T013 [P] Verify `npm run compile` produces no errors and the extension activates correctly in VSCode Extension Development Host
- [x] T014 Remove `import * as vscode from 'vscode'` from `tomcatService.ts` if it was already imported via the existing code (avoid duplicate imports)
- [ ] T015 Run manual test sequence from `specs/002-fix-launcher-bugs/quickstart.md` to validate all four bug fixes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **US1 (Phase 2)**: No dependency on Phase 1 (doesn't use new constants)
- **US2 (Phase 3)**: No dependency on Phase 1 or US1 (log watcher change is self-contained in `tomcatService.ts`)
- **US3 (Phase 4)**: Depends on Phase 1 (needs `HOT_RELOAD_MONITORED_PATHS` and `HOT_RELOAD_ROOT_FILES` constants)
- **US4 (Phase 5)**: Depends on Phase 1 (needs `JAVA_CONFIG_SECTION`, `JAVA_JDT_LS_HOME_KEY`, `JAVA_HOME_DEPRECATED_KEY` constants)
- **Polish (Phase 6)**: Depends on all user stories being complete

### User Story Dependencies

- **US1 (P1)**: Independent — can start immediately, only modifies `registerCommands.ts` and `extension.ts`
- **US2 (P1)**: Independent — can start immediately, only modifies `tomcatService.ts`
- **US3 (P2)**: Depends on T001 (constants) — then independent
- **US4 (P1)**: Depends on T001 (constants) — then independent

### Parallel Opportunities

- T001 must complete before T009 and T010
- US1 (T002, T003) can proceed in parallel with US2 (T004–T008)
- US3 (T009) can proceed in parallel with US4 (T010, T011) after T001 completes
- T012, T013, T014 can run in parallel during polish phase

---

## Parallel Example: User Story 2 + User Story 4

```bash
# After T001 completes, these can run simultaneously:
# Developer A (US2 - tomcatService.ts log watcher rewrite):
Task: "T004 Change logWatchers type and add logFileOffsets Map in src/services/tomcatService.ts"
Task: "T005 Replace watchTomcatLogs() with FileSystemWatcher in src/services/tomcatService.ts"
Task: "T006 Replace watchLogFile() with readNewLines() in src/services/tomcatService.ts"
Task: "T007 Update clearLogWatchers() in src/services/tomcatService.ts"
Task: "T008 Clean up unused fs imports in src/services/tomcatService.ts"

# Developer B (US4 - JDK path resolution):
Task: "T010 Add getJavaHome() method in src/utils/configUtils.ts"
Task: "T011 Add JRE_HOME env var in src/services/tomcatService.ts startTomcatProcess()"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (constants)
2. Complete Phase 2: User Story 1 (channel immediate display)
3. **STOP and VALIDATE**: Click Start button — verify channel pops up immediately
4. Deploy/demo if ready

### Incremental Delivery

1. Setup constants (Phase 1) → Foundation ready
2. Add US1 (Phase 2) → Channel shows immediately (MVP!)
3. Add US2 (Phase 3) → Localhost logs appear correctly
4. Add US3 (Phase 4) → Hot-reload scope limited
5. Add US4 (Phase 5) → JRE_HOME uses redhat.java's JDK
6. Polish (Phase 6) → Full validation

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- US2 modifies `tomcatService.ts` most heavily (log watcher rewrite) — be careful not to conflict with US4 which also touches `tomcatService.ts`; implement US2 first then US4
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence