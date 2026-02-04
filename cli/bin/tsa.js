#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { analyzeError } = require('../lib/analyzer');

// Get input from various sources
async function getInput() {
    const args = process.argv.slice(2);

    // If file argument provided
    if (args.length > 0 && !args[0].startsWith('-')) {
        const filePath = args[0];
        if (fs.existsSync(filePath)) {
            return fs.readFileSync(filePath, 'utf-8');
        } else {
            console.error(chalk.red(`Error: File not found: ${filePath}`));
            process.exit(1);
        }
    }

    // If piped input
    if (!process.stdin.isTTY) {
        return new Promise((resolve) => {
            let data = '';
            process.stdin.setEncoding('utf-8');
            process.stdin.on('data', chunk => data += chunk);
            process.stdin.on('end', () => resolve(data));
        });
    }

    // Try clipboard
    try {
        const clipboardy = require('clipboardy');
        const clipboardContent = clipboardy.readSync();
        if (clipboardContent && clipboardContent.includes('Type') || clipboardContent.includes('TS')) {
            return clipboardContent;
        }
    } catch (e) {
        // Clipboard not available
    }

    // Show help
    showHelp();
    process.exit(0);
}

function showHelp() {
    console.log(`
${chalk.cyan.bold('TypeScript Error Analyzer')} - Understand TS errors instantly

${chalk.yellow('Usage:')}
  tsa                     Analyze error from clipboard
  tsa <file>              Analyze error from file
  tsc 2>&1 | tsa          Pipe tsc output directly

${chalk.yellow('Examples:')}
  ${chalk.gray('# Copy a TS error, then run:')}
  tsa

  ${chalk.gray('# Save error to file and analyze:')}
  tsa error.txt

  ${chalk.gray('# Pipe from TypeScript compiler:')}
  npx tsc --noEmit 2>&1 | tsa

${chalk.yellow('Options:')}
  -h, --help              Show this help
  -v, --version           Show version
  -w, --web               Open web version

${chalk.blue('Web:')} https://tserror-analyzer.me
${chalk.blue('GitHub:')} https://github.com/your-username/ts-error-analyzer
`);
}

function showVersion() {
    const pkg = require('../package.json');
    console.log(`ts-error-analyzer v${pkg.version}`);
}

// Main
async function main() {
    const args = process.argv.slice(2);

    if (args.includes('-h') || args.includes('--help')) {
        showHelp();
        return;
    }

    if (args.includes('-v') || args.includes('--version')) {
        showVersion();
        return;
    }

    if (args.includes('-w') || args.includes('--web')) {
        const { exec } = require('child_process');
        exec('start https://tserror-analyzer.me');
        console.log(chalk.green('Opening web version...'));
        return;
    }

    const input = await getInput();

    if (!input || input.trim().length === 0) {
        console.log(chalk.yellow('No input provided. Copy a TypeScript error and try again.'));
        showHelp();
        return;
    }

    console.log(chalk.cyan.bold('\n🔍 TypeScript Error Analyzer\n'));
    console.log(chalk.gray('─'.repeat(50)));

    const result = analyzeError(input);

    if (result) {
        displayResult(result);
    } else {
        console.log(chalk.yellow('\n⚠️  Could not parse this error.'));
        console.log(chalk.gray('Try the web version for more detailed analysis:'));
        console.log(chalk.blue('https://tserror-analyzer.me\n'));
    }
}

function displayResult(result) {
    const { errorType, errorCode, details } = result;

    // Error code and type
    if (errorCode) {
        console.log(chalk.red.bold(`\n❌ ${errorCode}: ${errorType}\n`));
    } else {
        console.log(chalk.red.bold(`\n❌ ${errorType}\n`));
    }

    // Details based on error type
    if (details.sourceType && details.targetType) {
        console.log(chalk.yellow('📍 Type Mismatch:'));
        console.log(chalk.white(`   Expected: ${chalk.green(details.targetType)}`));
        console.log(chalk.white(`   Got:      ${chalk.red(details.sourceType)}\n`));
    }

    if (details.missingProps && details.missingProps.length > 0) {
        console.log(chalk.yellow('📍 Missing Properties:'));
        details.missingProps.forEach(prop => {
            console.log(chalk.white(`   • ${chalk.cyan(prop)}`));
        });
        console.log();
    }

    if (details.property) {
        console.log(chalk.yellow('📍 Problem Property:'));
        console.log(chalk.white(`   • ${chalk.cyan(details.property)}\n`));
    }

    if (details.moduleName) {
        console.log(chalk.yellow('📍 Module Not Found:'));
        console.log(chalk.white(`   • ${chalk.cyan(details.moduleName)}\n`));
    }

    if (details.variableName) {
        console.log(chalk.yellow('📍 Undefined Variable:'));
        console.log(chalk.white(`   • ${chalk.cyan(details.variableName)}\n`));
    }

    // Suggestion
    if (details.suggestion) {
        console.log(chalk.green('💡 Suggestion:'));
        console.log(chalk.white(`   ${details.suggestion}\n`));
    }

    console.log(chalk.gray('─'.repeat(50)));
    console.log(chalk.gray('For detailed visual analysis, visit:'));
    console.log(chalk.blue('https://tserror-analyzer.me\n'));
}

main().catch(err => {
    console.error(chalk.red('Error:'), err.message);
    process.exit(1);
});
