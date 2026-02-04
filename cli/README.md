# ts-error-analyzer

CLI tool to analyze and explain TypeScript errors in human-readable format.

## Installation

```bash
npm install -g ts-error-analyzer
```

## Usage

```bash
# Analyze from clipboard (copy error first)
tsa

# Analyze from file
tsa error.txt

# Pipe from tsc
tsc 2>&1 | tsa
npx tsc --noEmit 2>&1 | tsa
```

## Example

```bash
$ echo "Type 'string' is not assignable to type 'number'" | tsa

🔍 TypeScript Error Analyzer

──────────────────────────────────────────────────

❌ TS2322: Type Mismatch

📍 Type Mismatch:
   Expected: number
   Got:      string

💡 Suggestion:
   Cannot assign 'string' to 'number'. Check if you need type conversion or update the type definition.

──────────────────────────────────────────────────
```

## Options

| Flag | Description |
|------|-------------|
| `-h, --help` | Show help |
| `-v, --version` | Show version |
| `-w, --web` | Open web version |

## Web Version

For detailed visual analysis with type diff highlighting, visit:
**https://tserror-analyzer.me**

## License

MIT
