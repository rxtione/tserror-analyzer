<p align="center">
  <img src="https://tserror-analyzer.me/favicon.svg" width="80" height="80" alt="TypeScript Error Analyzer Logo">
</p>

<h1 align="center">TypeScript Error Analyzer</h1>

<p align="center">
  <strong>Stop staring at cryptic TypeScript errors. Get instant, human-readable explanations.</strong>
</p>

<p align="center">
  <a href="https://tserror-analyzer.me">Live Demo</a> •
  <a href="#features">Features</a> •
  <a href="#installation">CLI Install</a> •
  <a href="#supported-errors">Supported Errors</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/TypeScript-25%2B_errors-3178C6?style=flat-square&logo=typescript" alt="TypeScript Errors">
  <img src="https://img.shields.io/badge/Languages-4-green?style=flat-square" alt="Languages">
  <img src="https://img.shields.io/badge/Price-Free-brightgreen?style=flat-square" alt="Free">
  <img src="https://img.shields.io/npm/v/ts-error-analyzer?style=flat-square&color=red" alt="npm version">
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License">
</p>

---

## The Problem

Ever seen this?

```
Type '{ name: string; age: number; }' is not assignable to type '{ name: string; age: string; address: { city: string; zip: number; }; }'.
  Types of property 'age' are incompatible.
    Type 'number' is not assignable to type 'string'.
  Property 'address' is missing in type '{ name: string; age: number; }' but required in type '{ name: string; age: string; address: { city: string; zip: number; }; }'.
```

**What field is wrong? What's missing? What should I fix?** 🤯

## The Solution

Paste it into TypeScript Error Analyzer and get:

```
✅ Problem Found!

📍 Type Mismatch:
   • age: expected 'string' but got 'number'

📍 Missing Properties:
   • address.city (string)
   • address.zip (number)

💡 Quick Fix:
   Add the missing 'address' property and change 'age' from number to string.
```

---

## Features

- **25+ Error Types** - Covers most common TypeScript errors
- **Visual Diff** - Side-by-side type comparison with highlighting
- **Field-level Analysis** - Pinpoints exactly which field is wrong
- **Solution Suggestions** - Actionable fix recommendations
- **Multi-language** - Korean, English, Japanese, Chinese
- **100% Free** - No signup, no limits, no ads (almost)

---

## Installation

### Web (Recommended)

Just visit **[tserror-analyzer.me](https://tserror-analyzer.me)**

### CLI

```bash
npm install -g ts-error-analyzer
```

Then use it anywhere:

```bash
# Analyze from clipboard
tsa

# Analyze from file
tsa error.txt

# Pipe from tsc
tsc 2>&1 | tsa
```

---

## Supported Errors

| Error Code | Description |
|------------|-------------|
| TS2322 | Type 'X' is not assignable to type 'Y' |
| TS2345 | Argument of type 'X' is not assignable to parameter of type 'Y' |
| TS2304 | Cannot find name 'X' |
| TS2307 | Cannot find module 'X' |
| TS2741 | Property 'X' is missing in type 'Y' |
| TS2769 | No overload matches this call |
| TS2531 | Object is possibly 'null' |
| TS2532 | Object is possibly 'undefined' |
| TS2554 | Expected X arguments, but got Y |
| TS2339 | Property 'X' does not exist on type 'Y' |
| ... | And 15+ more! |

---

## Examples

### Missing Property

**Input:**
```
Property 'email' is missing in type '{ name: string; }' but required in type 'User'.
```

**Output:**
```
Missing property: email
Add 'email' to your object to match the User type.
```

### Type Mismatch

**Input:**
```
Type 'string' is not assignable to type 'number'.
```

**Output:**
```
Type mismatch: expected 'number' but got 'string'
Check if you need to convert the value or update the type definition.
```

---

## Tech Stack

- Pure HTML/CSS/JavaScript (No frameworks!)
- Zero dependencies
- Works offline (after first load)
- < 50KB total size

---

## Contributing

Contributions are welcome! Here's how you can help:

1. **Report bugs** - Found an error that doesn't parse correctly? Open an issue!
2. **Add error patterns** - Know a TypeScript error we don't support? PR welcome!
3. **Translations** - Help us support more languages

```bash
# Clone the repo
git clone https://github.com/your-username/ts-error-analyzer.git

# Open in browser
open index.html

# That's it! No build step needed.
```

---

## Roadmap

- [ ] VS Code Extension
- [ ] Browser Extension (paste from anywhere)
- [ ] API endpoint for programmatic access
- [ ] More languages (Spanish, German, French)
- [ ] Dark mode (coming soon!)

---

## License

MIT © TypeScript Error Analyzer

---

<p align="center">
  <strong>If this tool saved you time, give it a ⭐!</strong>
</p>

<p align="center">
  <a href="https://tserror-analyzer.me">🌐 Try it now</a> •
  <a href="https://github.com/your-username/ts-error-analyzer/issues">🐛 Report Bug</a> •
  <a href="https://twitter.com/intent/tweet?text=Check%20out%20TypeScript%20Error%20Analyzer!%20Finally%20understand%20those%20cryptic%20TS%20errors%20%F0%9F%8E%89&url=https://tserror-analyzer.me">🐦 Share on Twitter</a>
</p>
