/**
 * TypeScript Error Analyzer - Core Logic
 * Parses and analyzes TypeScript error messages
 */

function analyzeError(input) {
    if (!input || typeof input !== 'string') {
        return null;
    }

    const text = input.trim();

    // Try each parser
    const parsers = [
        parseTypeMismatch,
        parseArgumentError,
        parseMissingProperty,
        parseModuleNotFound,
        parseCannotFindName,
        parseOverloadError,
        parsePossiblyNull,
        parsePossiblyUndefined,
        parseArgumentCount,
        parseNotCallable,
        parsePropertyNotExist,
        parseGenericError
    ];

    for (const parser of parsers) {
        const result = parser(text);
        if (result) {
            return result;
        }
    }

    return null;
}

// TS2322: Type 'X' is not assignable to type 'Y'
function parseTypeMismatch(text) {
    const match = text.match(/Type '(.+?)' is not assignable to type '(.+?)'/);
    if (match) {
        const sourceType = match[1];
        const targetType = match[2];

        // Check for nested type incompatibility
        const nestedMatch = text.match(/Types of property '(.+?)' are incompatible/);
        const property = nestedMatch ? nestedMatch[1] : null;

        return {
            errorType: 'Type Mismatch',
            errorCode: 'TS2322',
            details: {
                sourceType,
                targetType,
                property,
                suggestion: property
                    ? `Check the '${property}' property. Expected type '${targetType}' but got '${sourceType}'.`
                    : `Cannot assign '${sourceType}' to '${targetType}'. Check if you need type conversion or update the type definition.`
            }
        };
    }
    return null;
}

// TS2345: Argument of type 'X' is not assignable to parameter of type 'Y'
function parseArgumentError(text) {
    const match = text.match(/Argument of type '(.+?)' is not assignable to parameter of type '(.+?)'/);
    if (match) {
        return {
            errorType: 'Argument Type Error',
            errorCode: 'TS2345',
            details: {
                sourceType: match[1],
                targetType: match[2],
                suggestion: `The function expects '${match[2]}' but received '${match[1]}'. Check the argument type.`
            }
        };
    }
    return null;
}

// TS2741: Property 'X' is missing in type 'Y'
function parseMissingProperty(text) {
    const match = text.match(/Property '(.+?)' is missing in type '(.+?)' but required in type '(.+?)'/);
    if (match) {
        return {
            errorType: 'Missing Property',
            errorCode: 'TS2741',
            details: {
                missingProps: [match[1]],
                sourceType: match[2],
                targetType: match[3],
                suggestion: `Add the missing property '${match[1]}' to your object.`
            }
        };
    }
    return null;
}

// TS2307: Cannot find module 'X'
function parseModuleNotFound(text) {
    const match = text.match(/Cannot find module '(.+?)'/);
    if (match) {
        const moduleName = match[1];
        const isRelative = moduleName.startsWith('.') || moduleName.startsWith('/');

        return {
            errorType: 'Module Not Found',
            errorCode: 'TS2307',
            details: {
                moduleName,
                suggestion: isRelative
                    ? `Check the file path. Make sure '${moduleName}' exists.`
                    : `Install the package: npm install ${moduleName} (or npm install @types/${moduleName} for types)`
            }
        };
    }
    return null;
}

// TS2304: Cannot find name 'X'
function parseCannotFindName(text) {
    const match = text.match(/Cannot find name '(.+?)'/);
    if (match) {
        const varName = match[1];
        return {
            errorType: 'Undefined Variable',
            errorCode: 'TS2304',
            details: {
                variableName: varName,
                suggestion: `'${varName}' is not defined. Check for typos, missing imports, or declare the variable.`
            }
        };
    }
    return null;
}

// TS2769: No overload matches this call
function parseOverloadError(text) {
    if (text.includes('No overload matches this call')) {
        const overloadMatches = text.match(/Overload \d+ of \d+/g);
        const count = overloadMatches ? overloadMatches.length : 'multiple';

        return {
            errorType: 'No Matching Overload',
            errorCode: 'TS2769',
            details: {
                suggestion: `None of the ${count} function overloads match your arguments. Check the function signature and argument types.`
            }
        };
    }
    return null;
}

// TS2531: Object is possibly 'null'
function parsePossiblyNull(text) {
    if (text.includes("Object is possibly 'null'")) {
        return {
            errorType: 'Possibly Null',
            errorCode: 'TS2531',
            details: {
                suggestion: `Add a null check before accessing this object: if (obj !== null) { ... } or use optional chaining: obj?.property`
            }
        };
    }
    return null;
}

// TS2532: Object is possibly 'undefined'
function parsePossiblyUndefined(text) {
    if (text.includes("Object is possibly 'undefined'")) {
        return {
            errorType: 'Possibly Undefined',
            errorCode: 'TS2532',
            details: {
                suggestion: `Add an undefined check: if (obj !== undefined) { ... } or use optional chaining: obj?.property`
            }
        };
    }
    return null;
}

// TS2554: Expected X arguments, but got Y
function parseArgumentCount(text) {
    const match = text.match(/Expected (\d+) arguments?, but got (\d+)/);
    if (match) {
        return {
            errorType: 'Wrong Argument Count',
            errorCode: 'TS2554',
            details: {
                expected: match[1],
                got: match[2],
                suggestion: `Function expects ${match[1]} argument(s) but received ${match[2]}. Check the function signature.`
            }
        };
    }
    return null;
}

// TS2349: This expression is not callable
function parseNotCallable(text) {
    if (text.includes('This expression is not callable')) {
        return {
            errorType: 'Not Callable',
            errorCode: 'TS2349',
            details: {
                suggestion: `This value is not a function and cannot be called. Check if you're calling the right variable.`
            }
        };
    }
    return null;
}

// TS2339: Property 'X' does not exist on type 'Y'
function parsePropertyNotExist(text) {
    const match = text.match(/Property '(.+?)' does not exist on type '(.+?)'/);
    if (match) {
        return {
            errorType: 'Property Does Not Exist',
            errorCode: 'TS2339',
            details: {
                property: match[1],
                targetType: match[2],
                suggestion: `'${match[1]}' doesn't exist on type '${match[2]}'. Check for typos or add the property to the type definition.`
            }
        };
    }
    return null;
}

// Generic type errors
function parseGenericError(text) {
    const tsErrorMatch = text.match(/TS(\d+)/);
    if (tsErrorMatch) {
        return {
            errorType: 'TypeScript Error',
            errorCode: `TS${tsErrorMatch[1]}`,
            details: {
                suggestion: `Visit https://tserror-analyzer.me for detailed analysis of this error.`
            }
        };
    }
    return null;
}

module.exports = { analyzeError };
