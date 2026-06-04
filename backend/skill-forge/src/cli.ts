#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { initSkill } from "./commands/init.js";
import { buildSkill, type Target } from "./commands/build.js";
import { deploySkill } from "./commands/deploy.js";
import { loadAndValidate } from "./commands/validate.js";
import { importSkill, type ImportSource } from "./commands/import.js";
import { scanAndPackage } from "./commands/package.js";
import { migrateSkill, type MigrateTarget } from "./commands/migrate.js";

const program = new Command();

program
  .name("skill-forge")
  .description("Unified skill authoring tool for Cursor, Codex and Windsurf")
  .version("1.0.0");

program
  .command("init <name>")
  .description("Initialize a new unified skill project")
  .option("-o, --output <dir>", "Output directory")
  .action(async (name: string, opts: { output?: string }) => {
    try {
      const result = await initSkill({ name, outputDir: opts.output });
      console.log(chalk.green(`Skill "${result.name}" created at ${result.dir}`));
    } catch (e) {
      console.error(chalk.red(`Error: ${(e as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("build")
  .description("Build skill for target platform(s)")
  .requiredOption("-t, --target <target>", "Target platform: cursor, codex, windsurf, or all")
  .option("-c, --config <path>", "Path to skill.config.yaml")
  .option("-o, --output <dir>", "Output directory")
  .action(async (opts: { target: string; config?: string; output?: string }) => {
    try {
      const results = await buildSkill({
        target: opts.target as Target,
        configPath: opts.config,
        outputDir: opts.output,
      });
      for (const r of results) {
        console.log(chalk.green(`Built for ${r.target}: ${r.outputDir}`));
        console.log(`  Files: ${r.files.join(", ")}`);
      }
    } catch (e) {
      console.error(chalk.red(`Error: ${(e as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("deploy")
  .description("Deploy skill to target platform(s)")
  .requiredOption("-t, --target <target>", "Target platform: cursor, codex, windsurf, or all")
  .option("-c, --config <path>", "Path to skill.config.yaml")
  .action(async (opts: { target: string; config?: string }) => {
    try {
      const results = await deploySkill({
        target: opts.target as Target,
        configPath: opts.config,
      });
      for (const r of results) {
        console.log(chalk.green(`Deployed to ${r.target}: ${r.path}`));
      }
    } catch (e) {
      console.error(chalk.red(`Error: ${(e as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("validate")
  .description("Validate the unified skill config")
  .option("-c, --config <path>", "Path to skill.config.yaml")
  .action(async (opts: { config?: string }) => {
    const result = await loadAndValidate(opts.config);
    if (result.valid) {
      console.log(chalk.green("Config is valid"));
    } else {
      console.error(chalk.red("Validation errors:"));
      for (const err of result.errors) {
        console.error(chalk.red(`  - ${err}`));
      }
      process.exit(1);
    }
  });

program
  .command("import")
  .description("Import an existing Cursor/Codex skill as unified config")
  .requiredOption("-f, --from <source>", "Source platform: cursor or codex")
  .requiredOption("-p, --path <path>", "Path to existing skill directory")
  .option("-o, --output <dir>", "Output directory for skill.config.yaml")
  .action(
    async (opts: { from: string; path: string; output?: string }) => {
      try {
        const result = await importSkill({
          from: opts.from as ImportSource,
          path: opts.path,
          outputDir: opts.output,
        });
        console.log(chalk.green(`Imported to ${result.configPath}`));
      } catch (e) {
        console.error(chalk.red(`Error: ${(e as Error).message}`));
        process.exit(1);
      }
    }
  );

program
  .command("scan <dir>")
  .description("Scan a directory for skills and produce unified packages")
  .action(async (dir: string) => {
    try {
      const results = await scanAndPackage(dir);
      if (results.length === 0) {
        console.log(chalk.yellow("No skills found in " + dir));
        return;
      }
      for (const pkg of results) {
        console.log(
          chalk.green(`  ${pkg.id}`) +
            chalk.gray(` [${pkg.origin}/${pkg.originConfidence}]`) +
            chalk.gray(` — ${pkg.config.description?.slice(0, 60) ?? ""}`)
        );
      }
      console.log(chalk.cyan(`\nTotal: ${results.length} skill(s) packaged`));
    } catch (e) {
      console.error(chalk.red(`Error: ${(e as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("migrate")
  .description("Migrate a skill to target platform through unified package")
  .requiredOption("-p, --path <path>", "Path to skill directory")
  .requiredOption(
    "-t, --target <target>",
    "Target platform: cursor, codex or windsurf"
  )
  .option("-o, --output <dir>", "Custom output directory")
  .action(
    async (opts: { path: string; target: string; output?: string }) => {
      try {
        const result = await migrateSkill({
          sourcePath: opts.path,
          targetPlatform: opts.target as MigrateTarget,
          outputDir: opts.output,
        });
        if (result.adapted) {
          console.log(
            chalk.green(
              `Migrated ${result.id}: ${result.origin} → ${result.targetPlatform}`
            )
          );
          console.log(`  Output: ${result.targetDir}`);
        } else {
          console.log(
            chalk.yellow(
              `${result.id}: already ${result.origin}, no migration needed`
            )
          );
        }
      } catch (e) {
        console.error(chalk.red(`Error: ${(e as Error).message}`));
        process.exit(1);
      }
    }
  );

program.parse();