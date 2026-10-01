#!/usr/bin/env node
/**
 * HKD CLI Entry Point
 *
 * Commands:
 *   hkd init [name]      Initialize a new project
 *   hkd run [file]       Run an HKD project or source file
 *   hkd build [options]  Compile project modules incrementally
 *   hkd test [file]      Run discovered tests
 *   hkd fmt [file] [-w]  Format source code
 *   hkd lint [file]      Lint source code for issues
 *   hkd check [file]     Type-check without compiling
 *   hkd add <pkg>        Add a dependency (dir, .hkdpack, or version)
 *   hkd remove <pkg>     Remove a dependency
 *   hkd install          Install resolved dependencies
 *   hkd update           Update lockfile and dependencies
 *   hkd doc              Generate project documentation
 *   hkd version          Print version
 *   hkd help             Print help
 */
export declare const ExitCode: {
    readonly Success: 0;
    readonly RuntimeError: 1;
    readonly UsageError: 2;
    readonly ConfigError: 3;
    readonly BuildError: 4;
    readonly DeployError: 5;
};
export declare function applyLintFixes(source: string, issues: any[]): string;
export declare function printSubcommandHelp(cmd: string): void;
//# sourceMappingURL=main.d.ts.map