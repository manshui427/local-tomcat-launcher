# Implementation Plan: Fix Launcher Bugs

**Branch**: `002-fix-launcher-bugs` | **Date**: 2026-06-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-fix-launcher-bugs/spec.md`

## Summary

Fix four bugs in the local-tomcat-launcher VSCode extension: (1) output channel not showing immediately on button click, (2) localhost log not correctly output to channel, (3) hot-reload file watcher too broad, and (4) JRE_HOME using wrong JDK instead of redhat.java's configured JDK. The approach involves modifying `registerCommands.ts` to call `outputChannel.show()` early, fixing the log watcher in `tomcatService.ts` to handle deferred file creation and avoid repeated lines, adding path filtering in `hotReloadService.ts`, and retrieving the JDK path from `java.jdt.ls.javaHome` config in `tomcatService.ts`.

## Technical Context

**Language/Version**: TypeScript 6.0.3 (strict mode), targeting ES2020 / CommonJS

**Primary Dependencies**: VSCode Extension API (engine ^1.85.0), redhat.java extension (>=1.51.0), Node.js (child_process.spawn, fs, path)

**Storage**: File system — CATALINA_BASE directory in globalStorage, Tomcat log files, Maven target/ directory

**Testing**: No formal test framework configured; manual testing via VSCode Extension Development Host

**Target Platform**: Windows desktop (VSCode extension, uses `taskkill`, `cmd /c catalina.bat`, PowerShell commands)

**Project Type**: VSCode extension (desktop plugin)

**Performance Goals**: Output channel visible within 1s of button click; log lines appear in channel within 2s of file write; no unnecessary hot-reload triggers

**Constraints**: Windows-only; depends on redhat.java extension; Maven project layout assumed

**Scale/Scope**: Single-user local development tool; one Tomcat instance per workspace

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. 官方推荐优先 | PASS | All fixes use standard VSCode Extension API patterns (`OutputChannel.show()`, `workspace.getConfiguration()`, `onDidSaveTextDocument` filtering) |
| II. 清晰注释 | PASS | All new/modified code will include Chinese comments per existing convention |
| III. 最佳实践 | PASS | Strict TypeScript, proper async/await, correct error handling |
| IV. 简洁设计 | PASS | Minimal targeted fixes — no over-engineering, no new abstractions unless necessary |
| V. 可维护代码 | PASS | Changes follow existing command→service→util layer structure; each fix is localized to the responsible module |

**Gate Result**: PASS — all principles satisfied. No violations to justify.

## Project Structure

### Documentation (this feature)

```text
specs/002-fix-launcher-bugs/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── checklists/
    └── requirements.md  # Spec quality checklist
```

### Source Code (repository root)

```text
src/
├── extension.ts              # Extension entry point — add JDK path resolution on activate
├── constants.ts              # Add HOT_RELOAD_WATCH_PATTERNS constant; add JAVA_HOME_CONFIG_KEY
├── commands/
│   └── registerCommands.ts   # Show output channel immediately on each command
├── services/
│   ├── tomcatService.ts      # Fix log watcher (deferred creation, no repeat); set JRE_HOME env var
│   ├── hotReloadService.ts   # Add path scope filtering for monitored directories
│   ├── mavenService.ts       # (unchanged)
│   └── deployService.ts      # (unchanged)
├── ui/
│   ├── outputChannel.ts      # (unchanged — already has show() method)
│   ├── statusBar.ts          # (unchanged)
│   └── titleBarButtons.ts    # (unchanged)
└── utils/
    ├── configUtils.ts        # Add getJavaHome() utility method
    ├── fileUtils.ts          # (unchanged)
    ├── portUtils.ts          # (unchanged)
    └── processUtils.ts       # (unchanged)
```

**Structure Decision**: Single project — existing structure maintained. Changes are localized to 5 files (`registerCommands.ts`, `tomcatService.ts`, `hotReloadService.ts`, `constants.ts`, `configUtils.ts`) with no new modules or abstractions needed.

## Complexity Tracking

> No constitution violations. Table left empty.