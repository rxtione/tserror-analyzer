// analyzer.js - TypeScript Error Analyzer Core Logic

// Feedback API URL - Replace with your Google Apps Script URL
var FEEDBACK_API_URL = 'https://script.google.com/macros/s/AKfycbwErW17RCWI02ApYuxXDq4r0OFi6w0VF865JItQannIXRFgmD7lbiiR0BnbTkE68wmgfg/exec';  // Set your Google Apps Script URL here

// Feedback submission
var lastFailedError = '';

function submitFeedback() {
    if (!FEEDBACK_API_URL) {
        alert(t('feedbackNotConfigured'));
        return;
    }

    if (!lastFailedError) {
        alert(t('noErrorToReport'));
        return;
    }

    var btn = document.getElementById('feedbackBtn');
    var originalText = btn.innerHTML;
    btn.innerHTML = '<svg class="spinner" width="14" height="14" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" fill="none" stroke-dasharray="30 70"/></svg> ' + t('submitting');
    btn.disabled = true;

    // Encode data for URL (limit length to avoid URL too long errors)
    var errorData = encodeURIComponent(lastFailedError.substring(0, 1500));
    var langData = encodeURIComponent(currentLang);
    var uaData = encodeURIComponent(navigator.userAgent.substring(0, 150));

    var url = FEEDBACK_API_URL + '?errorMessage=' + errorData + '&language=' + langData + '&userAgent=' + uaData;

    // Use Image beacon - most reliable, no CORS/Mixed Content issues
    var img = new Image();
    img.onload = img.onerror = function() {
        // Request was sent (both load and error mean server received it)
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg> ' + t('feedbackSent');
        btn.classList.add('success');
        setTimeout(function() {
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.classList.remove('success');
        }, 3000);
    };
    img.src = url;
}

// Hero section control
function scrollToAnalyzer() {
    var container = document.getElementById('mainContainer');
    container.scrollIntoView({ behavior: 'smooth' });
}

function collapseHero() {
    var hero = document.getElementById('heroSection');
    var header = document.getElementById('headerCompact');
    hero.classList.add('collapsed');
    header.classList.add('visible');
}

function expandHero() {
    var hero = document.getElementById('heroSection');
    var header = document.getElementById('headerCompact');
    hero.classList.remove('collapsed');
    header.classList.remove('visible');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function analyzeError() {
    var input = document.getElementById('errorInput').value.trim();
    if (!input) {
        alert(t('alertEmpty'));
        return;
    }

    // Collapse hero section on analysis
    collapseHero();

    var result = parseTypeScriptError(input);
    displayResult(result);
    document.getElementById('bottomAd').style.display = 'flex';

    // Scroll to results
    setTimeout(function() {
        document.getElementById('resultSection').scrollIntoView({ behavior: 'smooth' });
    }, 100);
}

function parseTypeScriptError(errorText) {
    var result = {
        problems: [],
        isArrayObjectMismatch: false,
        originalError: errorText,
        errorCode: null,
        errorCodes: []
    };

    var errorCodeMatches = errorText.match(/TS\d{4}/g);
    if (errorCodeMatches) {
        result.errorCodes = [...new Set(errorCodeMatches)];
        result.errorCode = result.errorCodes[0];
    }

    if (errorText.includes('length, pop, push, concat')) {
        result.isArrayObjectMismatch = true;
    }

    var lines = errorText.split('\n');
    var currentPath = [];
    var problems = [];

    for (var i = 0; i < lines.length; i++) {
        var line = lines[i];
        var trimmed = line.trim();

        var propMatch = trimmed.match(/Types of property ['"]([^'"]+)['"] are incompatible/);
        if (propMatch) {
            currentPath.push(propMatch[1]);
        }

        var typeMatch = trimmed.match(/Type ['"]([^'"]+)['"] is not assignable to type ['"]([^'"]+)['"]/);
        if (typeMatch) {
            var sourceType = typeMatch[1];
            var targetType = typeMatch[2];

            var problem = {
                path: currentPath.slice(),
                sourceType: sourceType,
                targetType: targetType,
                isArrayMismatch: false,
                isGeneric: false,
                isUnion: false,
                isLiteral: false
            };

            if (sourceType.includes('<') || targetType.includes('<')) {
                problem.isGeneric = true;
            }
            if (sourceType.includes(' | ') || targetType.includes(' | ')) {
                problem.isUnion = true;
            }
            // Detect literal types (string, number, boolean, template literals)
            if (/^["'].*["']$/.test(sourceType) || /^["'].*["']$/.test(targetType) ||
                /^\d+$/.test(sourceType) || /^\d+$/.test(targetType) ||
                sourceType === 'true' || sourceType === 'false' ||
                targetType === 'true' || targetType === 'false' ||
                /^`.*`$/.test(sourceType) || /^`.*`$/.test(targetType) ||
                /\$\{/.test(sourceType) || /\$\{/.test(targetType)) {
                problem.isLiteral = true;
            }

            // Detect readonly/as const arrays
            if (/^readonly\s*\[/.test(sourceType) || /^readonly\s*\[/.test(targetType)) {
                problem.isReadonlyArray = true;
                problem.isLiteral = true;
            }

            var arrayMismatches = findArrayMismatchesInTypes(sourceType, targetType);
            if (arrayMismatches.length > 0) {
                arrayMismatches.forEach(function(mismatch) {
                    problems.push({
                        path: currentPath.concat([mismatch.propName]),
                        sourceType: mismatch.sourceType,
                        targetType: mismatch.targetType,
                        isArrayMismatch: true
                    });
                });
            } else {
                problem.isArrayMismatch = targetType.includes('[]') && !sourceType.includes('[]');
                problems.push(problem);
            }
        }

        var missingMatch = trimmed.match(/is missing the following properties[^:]*: ([^.]+)/);
        if (missingMatch) {
            var props = missingMatch[1].split(',').map(function(p) { return p.trim(); });
            problems.push({
                path: currentPath.slice(),
                type: 'missing',
                missingProps: props
            });
        }

        var notExistMatch = trimmed.match(/Property ['"]([^'"]+)['"] does not exist on type ['"]([^'"]+)['"]/);
        if (notExistMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'notExist',
                propName: notExistMatch[1],
                onType: notExistMatch[2]
            });
        }

        var cannotFindNameMatch = trimmed.match(/Cannot find name ['"]([^'"]+)['"]/);
        if (cannotFindNameMatch) {
            problems.push({
                path: [],
                type: 'cannotFindName',
                name: cannotFindNameMatch[1]
            });
        }

        var cannotFindModuleMatch = trimmed.match(/Cannot find module ['"]([^'"]+)['"]/);
        if (cannotFindModuleMatch) {
            problems.push({
                path: [],
                type: 'cannotFindModule',
                moduleName: cannotFindModuleMatch[1]
            });
        }

        var didYouMeanMatch = trimmed.match(/Did you mean ['"]([^'"]+)['"]\?/);
        if (didYouMeanMatch && problems.length > 0) {
            var lastProblem = problems[problems.length - 1];
            lastProblem.suggestion = didYouMeanMatch[1];
        }

        var noOverloadMatch = trimmed.match(/No overload matches this call/);
        if (noOverloadMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'noOverload'
            });
        }

        var implicitAnyMatch = trimmed.match(/Parameter ['"]([^'"]+)['"] implicitly has an ['"]any['"] type/);
        if (implicitAnyMatch) {
            problems.push({
                path: [],
                type: 'implicitAny',
                paramName: implicitAnyMatch[1]
            });
        }

        var argMatch = trimmed.match(/Argument of type ['"]([^'"]+)['"] is not assignable to parameter of type ['"]([^'"]+)['"]/);
        if (argMatch && !typeMatch) {
            problems.push({
                path: currentPath.slice(),
                sourceType: argMatch[1],
                targetType: argMatch[2],
                isArgument: true,
                isArrayMismatch: argMatch[2].includes('[]') && !argMatch[1].includes('[]')
            });
        }

        // TS2571: Object is of type 'unknown'
        var unknownMatch = trimmed.match(/Object is of type ['"]unknown['"]/);
        if (unknownMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'unknownType'
            });
        }

        // TS2532: Object is possibly 'undefined'
        var possiblyUndefinedMatch = trimmed.match(/Object is possibly ['"]undefined['"]/);
        if (possiblyUndefinedMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'possiblyUndefined'
            });
        }

        // TS2531: Object is possibly 'null'
        var possiblyNullMatch = trimmed.match(/Object is possibly ['"]null['"]/);
        if (possiblyNullMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'possiblyNull'
            });
        }

        // TS2533: Object is possibly 'null' or 'undefined'
        var possiblyNullOrUndefinedMatch = trimmed.match(/Object is possibly ['"]null['"] or ['"]undefined['"]/);
        if (possiblyNullOrUndefinedMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'possiblyNullOrUndefined'
            });
        }

        // TS2554: Expected X arguments, but got Y
        var argCountMatch = trimmed.match(/Expected (\d+)(?:-(\d+))? arguments?, but got (\d+)/);
        if (argCountMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'argumentCount',
                expectedMin: parseInt(argCountMatch[1]),
                expectedMax: argCountMatch[2] ? parseInt(argCountMatch[2]) : parseInt(argCountMatch[1]),
                got: parseInt(argCountMatch[3])
            });
        }

        // TS2339: Property 'X' does not exist on type 'Y' (different from notExist - captures more context)
        var propNotExistMatch = trimmed.match(/Property ['"]([^'"]+)['"] does not exist on type ['"]([^'"]+)['"]/);
        if (propNotExistMatch && !notExistMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'propertyNotExist',
                propName: propNotExistMatch[1],
                onType: propNotExistMatch[2]
            });
        }

        // TS2349: This expression is not callable
        var notCallableMatch = trimmed.match(/This expression is not callable/);
        if (notCallableMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'notCallable'
            });
        }

        // TS2351: This expression is not constructable
        var notConstructableMatch = trimmed.match(/This expression is not constructable/);
        if (notConstructableMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'notConstructable'
            });
        }

        // TS2355: A function whose declared type is neither 'void' nor 'any' must return a value
        var mustReturnMatch = trimmed.match(/A function whose declared type is neither ['"]void['"] nor ['"]any['"] must return a value/);
        if (mustReturnMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'mustReturn'
            });
        }

        // TS2365: Operator 'X' cannot be applied to types 'Y' and 'Z'
        var operatorMatch = trimmed.match(/Operator ['"]([^'"]+)['"] cannot be applied to types ['"]([^'"]+)['"] and ['"]([^'"]+)['"]/);
        if (operatorMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'operatorError',
                operator: operatorMatch[1],
                leftType: operatorMatch[2],
                rightType: operatorMatch[3]
            });
        }

        // TS2344: Type 'X' does not satisfy the constraint 'Y'
        var constraintMatch = trimmed.match(/Type ['"]([^'"]+)['"] does not satisfy the constraint ['"]([^'"]+)['"]/);
        if (constraintMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'constraintError',
                sourceType: constraintMatch[1],
                constraint: constraintMatch[2]
            });
        }

        // TS2352: Conversion of type 'X' to type 'Y' may be a mistake
        var conversionMistakeMatch = trimmed.match(/Conversion of type ['"]([^'"]+)['"] to type ['"]([^'"]+)['"] may be a mistake/);
        if (conversionMistakeMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'conversionMistake',
                sourceType: conversionMistakeMatch[1],
                targetType: conversionMistakeMatch[2]
            });
        }

        // TS2416: Property 'X' in type 'Y' is not assignable to the same property in base type 'Z'
        var basePropertyMatch = trimmed.match(/Property ['"]([^'"]+)['"] in type ['"]([^'"]+)['"] is not assignable to the same property in base type ['"]([^'"]+)['"]/);
        if (basePropertyMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'basePropertyMismatch',
                propName: basePropertyMatch[1],
                childType: basePropertyMatch[2],
                baseType: basePropertyMatch[3]
            });
        }

        // TS2740: Type 'X' is missing the following properties from type 'Y': a, b, c
        var missingPropsFromMatch = trimmed.match(/Type ['"]([^'"]+)['"] is missing the following properties from type ['"]([^'"]+)['"]:\s*(.+)/);
        if (missingPropsFromMatch && !missingMatch) {
            var propsList = missingPropsFromMatch[3].split(',').map(function(p) {
                return p.trim().replace(/^and\s+/, '');
            }).filter(function(p) { return p && !p.includes(' more'); });
            problems.push({
                path: currentPath.slice(),
                type: 'missingPropsFrom',
                sourceType: missingPropsFromMatch[1],
                targetType: missingPropsFromMatch[2],
                missingProps: propsList
            });
        }

        // TS2367: This comparison appears to be unintentional
        var unintentionalCompareMatch = trimmed.match(/This (?:condition|comparison) will always return ['"]([^'"]+)['"]|This comparison appears to be unintentional/);
        if (unintentionalCompareMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'unintentionalComparison',
                result: unintentionalCompareMatch[1] || 'false'
            });
        }

        // TS2454: Variable 'X' is used before being assigned
        var usedBeforeAssignedMatch = trimmed.match(/Variable ['"]([^'"]+)['"] is used before being assigned/);
        if (usedBeforeAssignedMatch) {
            problems.push({
                path: [],
                type: 'usedBeforeAssigned',
                varName: usedBeforeAssignedMatch[1]
            });
        }

        // TS2564: Property 'X' has no initializer and is not definitely assigned
        var noInitializerMatch = trimmed.match(/Property ['"]([^'"]+)['"] has no initializer and is not definitely assigned/);
        if (noInitializerMatch) {
            problems.push({
                path: [],
                type: 'noInitializer',
                propName: noInitializerMatch[1]
            });
        }

        // TS2322 with 'undefined' is not assignable
        var undefinedAssignMatch = trimmed.match(/Type ['"]undefined['"] is not assignable to type ['"]([^'"]+)['"]/);
        if (undefinedAssignMatch && !typeMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'undefinedNotAssignable',
                targetType: undefinedAssignMatch[1]
            });
        }

        // TS2322 with 'null' is not assignable
        var nullAssignMatch = trimmed.match(/Type ['"]null['"] is not assignable to type ['"]([^'"]+)['"]/);
        if (nullAssignMatch && !typeMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'nullNotAssignable',
                targetType: nullAssignMatch[1]
            });
        }

        // TS2314: Generic type 'X' requires Y type argument(s)
        var genericArgsMatch = trimmed.match(/Generic type ['"]([^'"]+)['"] requires (\d+) type argument\(s\)/);
        if (genericArgsMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'genericArgsRequired',
                genericType: genericArgsMatch[1],
                requiredCount: parseInt(genericArgsMatch[2])
            });
        }

        // TS2693: 'X' only refers to a type, but is being used as a value here
        var typeAsValueMatch = trimmed.match(/['"]([^'"]+)['"] only refers to a type, but is being used as a value here/);
        if (typeAsValueMatch) {
            problems.push({
                path: [],
                type: 'typeAsValue',
                typeName: typeAsValueMatch[1]
            });
        }

        // TS2749: 'X' refers to a value, but is being used as a type here
        var valueAsTypeMatch = trimmed.match(/['"]([^'"]+)['"] refers to a value, but is being used as a type here/);
        if (valueAsTypeMatch) {
            problems.push({
                path: [],
                type: 'valueAsType',
                valueName: valueAsTypeMatch[1]
            });
        }

        // TS1005: 'X' expected
        var syntaxExpectedMatch = trimmed.match(/['"]([^'"]+)['"] expected/);
        if (syntaxExpectedMatch) {
            problems.push({
                path: [],
                type: 'syntaxExpected',
                expected: syntaxExpectedMatch[1]
            });
        }

        // TS2430: Interface 'X' incorrectly extends interface 'Y'
        var interfaceExtendsMatch = trimmed.match(/Interface ['"]([^'"]+)['"] incorrectly extends interface ['"]([^'"]+)['"]/);
        if (interfaceExtendsMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'interfaceExtendError',
                childInterface: interfaceExtendsMatch[1],
                parentInterface: interfaceExtendsMatch[2]
            });
        }

        // TS2420: Class 'X' incorrectly implements interface 'Y'
        var classImplementsMatch = trimmed.match(/Class ['"]([^'"]+)['"] incorrectly implements interface ['"]([^'"]+)['"]/);
        if (classImplementsMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'classImplementError',
                className: classImplementsMatch[1],
                interfaceName: classImplementsMatch[2]
            });
        }

        // TS7053: Element implicitly has an 'any' type because expression of type 'X' can't be used to index type 'Y'
        var indexAccessMatch = trimmed.match(/Element implicitly has an ['"]any['"] type because expression of type ['"]([^'"]+)['"] can't be used to index type ['"]([^'"]+)['"]/);
        if (indexAccessMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'indexAccessError',
                indexType: indexAccessMatch[1],
                objectType: indexAccessMatch[2]
            });
        }

        // TS2538: Type 'X' cannot be used as an index type
        var indexTypeMatch = trimmed.match(/Type ['"]([^'"]+)['"] cannot be used as an index type/);
        if (indexTypeMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'invalidIndexType',
                indexType: indexTypeMatch[1]
            });
        }

        // TS2536: Type 'X' cannot be used to index type 'Y'
        var cannotIndexMatch = trimmed.match(/Type ['"]([^'"]+)['"] cannot be used to index type ['"]([^'"]+)['"]/);
        if (cannotIndexMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'cannotIndex',
                indexType: cannotIndexMatch[1],
                objectType: cannotIndexMatch[2]
            });
        }
    }

    result.problems = deduplicateProblems(problems);
    return result;
}

function findArrayMismatchesInTypes(sourceType, targetType) {
    var mismatches = [];
    if (!sourceType.startsWith('{') || !targetType.startsWith('{')) {
        return mismatches;
    }

    var sourceProps = parseObjectProps(sourceType);
    var targetProps = parseObjectProps(targetType);

    Object.keys(sourceProps).forEach(function(propName) {
        if (targetProps[propName]) {
            var srcType = sourceProps[propName];
            var tgtType = targetProps[propName];
            if (tgtType.includes('[]') && !srcType.includes('[]')) {
                mismatches.push({
                    propName: propName,
                    sourceType: srcType,
                    targetType: tgtType
                });
            }
        }
    });

    return mismatches;
}

function parseObjectProps(typeStr) {
    var props = {};
    var inner = typeStr.trim();
    if (inner.startsWith('{')) inner = inner.slice(1);
    if (inner.endsWith('}')) inner = inner.slice(0, -1);

    var depth = 0;
    var current = '';
    var propName = '';
    var inPropName = true;

    for (var i = 0; i < inner.length; i++) {
        var char = inner[i];
        if (char === '{' || char === '[' || char === '(' || char === '<') depth++;
        else if (char === '}' || char === ']' || char === ')' || char === '>') depth--;

        if (depth === 0 && char === ':' && inPropName) {
            propName = current.trim().replace('?', '');
            current = '';
            inPropName = false;
        } else if (depth === 0 && char === ';') {
            if (propName) props[propName] = current.trim();
            current = '';
            propName = '';
            inPropName = true;
        } else {
            current += char;
        }
    }

    if (propName && current.trim()) {
        props[propName] = current.trim();
    }
    return props;
}

function deduplicateProblems(problems) {
    var seen = {};
    return problems.filter(function(p) {
        var key = p.path.join('.') + '|' + (p.type || 'type') + '|' + (p.sourceType || '') + '|' + (p.name || '') + '|' + (p.moduleName || '');
        if (seen[key]) return false;
        seen[key] = true;
        return true;
    });
}

// ========== NEW: Unified Type Comparison System ==========

/**
 * Parse a type string into a structured AST-like object
 */
function parseTypeToAST(typeStr) {
    typeStr = typeStr.trim();

    // Handle primitive types
    if (!typeStr.startsWith('{') && !typeStr.startsWith('(')) {
        return { type: 'primitive', value: typeStr };
    }

    // Handle object types
    if (typeStr.startsWith('{')) {
        return parseObjectToAST(typeStr);
    }

    return { type: 'primitive', value: typeStr };
}

function parseObjectToAST(typeStr) {
    var result = { type: 'object', properties: {} };
    var inner = typeStr.trim();

    if (inner.startsWith('{')) inner = inner.slice(1);
    if (inner.endsWith('}')) inner = inner.slice(0, -1);

    var depth = 0;
    var current = '';
    var propName = '';
    var propOptional = false;
    var inPropName = true;

    for (var i = 0; i < inner.length; i++) {
        var char = inner[i];

        if (char === '{' || char === '[' || char === '(' || char === '<') depth++;
        else if (char === '}' || char === ']' || char === ')' || char === '>') depth--;

        if (depth === 0 && char === ':' && inPropName) {
            var rawPropName = current.trim();
            propOptional = rawPropName.endsWith('?');
            propName = rawPropName.replace('?', '');
            current = '';
            inPropName = false;
        } else if (depth === 0 && char === ';') {
            if (propName) {
                result.properties[propName] = {
                    name: propName,
                    optional: propOptional,
                    valueType: current.trim()
                };
            }
            current = '';
            propName = '';
            propOptional = false;
            inPropName = true;
        } else {
            current += char;
        }
    }

    // Handle last property (no trailing semicolon)
    if (propName && current.trim()) {
        result.properties[propName] = {
            name: propName,
            optional: propOptional,
            valueType: current.trim()
        };
    }

    return result;
}

/**
 * Get all property names from both source and target (union of keys)
 */
function getAllPropertyNames(sourceAST, targetAST) {
    var names = {};

    if (sourceAST.type === 'object' && sourceAST.properties) {
        Object.keys(sourceAST.properties).forEach(function(k) { names[k] = true; });
    }
    if (targetAST.type === 'object' && targetAST.properties) {
        Object.keys(targetAST.properties).forEach(function(k) { names[k] = true; });
    }

    return Object.keys(names);
}

/**
 * Compare two types and identify differences
 */
function compareTypes(sourceType, targetType) {
    var differences = [];

    var sourceAST = parseTypeToAST(sourceType);
    var targetAST = parseTypeToAST(targetType);

    // Both are primitives - direct comparison
    if (sourceAST.type === 'primitive' && targetAST.type === 'primitive') {
        if (sourceAST.value !== targetAST.value) {
            differences.push({
                path: [],
                sourceValue: sourceAST.value,
                targetValue: targetAST.value
            });
        }
        return differences;
    }

    // Both are objects
    if (sourceAST.type === 'object' && targetAST.type === 'object') {
        var allProps = getAllPropertyNames(sourceAST, targetAST);

        allProps.forEach(function(propName) {
            var sourceProp = sourceAST.properties[propName];
            var targetProp = targetAST.properties[propName];

            if (!sourceProp && targetProp) {
                // Missing in source
                differences.push({
                    path: [propName],
                    type: 'missing_in_source',
                    targetValue: targetProp.valueType
                });
            } else if (sourceProp && !targetProp) {
                // Extra in source
                differences.push({
                    path: [propName],
                    type: 'extra_in_source',
                    sourceValue: sourceProp.valueType
                });
            } else if (sourceProp && targetProp) {
                // Compare values
                if (normalizeType(sourceProp.valueType) !== normalizeType(targetProp.valueType)) {
                    differences.push({
                        path: [propName],
                        type: 'value_mismatch',
                        sourceValue: sourceProp.valueType,
                        targetValue: targetProp.valueType
                    });
                }
            }
        });
    }

    // Type structure mismatch (object vs primitive)
    if (sourceAST.type !== targetAST.type) {
        differences.push({
            path: [],
            type: 'structure_mismatch',
            sourceValue: sourceType,
            targetValue: targetType
        });
    }

    return differences;
}

function normalizeType(type) {
    return type.replace(/\s+/g, ' ').trim();
}

/**
 * Render both types with aligned structure and highlighted differences
 */
function renderAlignedTypeComparison(sourceType, targetType) {
    var sourceAST = parseTypeToAST(sourceType);
    var targetAST = parseTypeToAST(targetType);
    var differences = compareTypes(sourceType, targetType);

    // Build a map of differences by property name
    var diffMap = {};
    differences.forEach(function(diff) {
        if (diff.path.length > 0) {
            diffMap[diff.path[0]] = diff;
        }
    });

    // Get all properties in order
    var allProps = getAllPropertyNames(sourceAST, targetAST);

    // If both are primitives
    if (sourceAST.type === 'primitive' && targetAST.type === 'primitive') {
        var sourceHtml = escapeHtml(sourceType);
        var targetHtml = escapeHtml(targetType);

        if (sourceType !== targetType) {
            sourceHtml = '<span class="diff-error">' + sourceHtml + '</span>';
            targetHtml = '<span class="diff-correct">' + targetHtml + '</span>';
        }

        return {
            sourceHtml: sourceHtml,
            targetHtml: targetHtml
        };
    }

    // Build aligned output for objects
    var sourceLines = ['{'];
    var targetLines = ['{'];

    allProps.forEach(function(propName, idx) {
        var sourceProp = sourceAST.properties ? sourceAST.properties[propName] : null;
        var targetProp = targetAST.properties ? targetAST.properties[propName] : null;
        var diff = diffMap[propName];
        var isLast = idx === allProps.length - 1;
        var semicolon = isLast ? '' : ';';

        // Source side
        if (sourceProp) {
            var sourceOptional = sourceProp.optional ? '?' : '';
            var sourceValue = sourceProp.valueType;
            var sourceLine = '  ' + propName + sourceOptional + ': ';

            if (diff && (diff.type === 'value_mismatch' || diff.type === 'extra_in_source')) {
                sourceLine += '<span class="diff-error">' + escapeHtml(sourceValue) + '</span>';
            } else {
                sourceLine += escapeHtml(sourceValue);
            }
            sourceLine += semicolon;
            sourceLines.push(sourceLine);
        } else {
            // Property missing in source - show placeholder
            var targetOptional = targetProp.optional ? '?' : '';
            var placeholderLine = '  <span class="diff-missing">' + propName + targetOptional + ': (missing)</span>' + semicolon;
            sourceLines.push(placeholderLine);
        }

        // Target side
        if (targetProp) {
            var targetOptional2 = targetProp.optional ? '?' : '';
            var targetValue = targetProp.valueType;
            var targetLine = '  ' + propName + targetOptional2 + ': ';

            if (diff && diff.type === 'value_mismatch') {
                targetLine += '<span class="diff-correct">' + escapeHtml(targetValue) + '</span>';
            } else if (diff && diff.type === 'missing_in_source') {
                targetLine += '<span class="diff-correct">' + escapeHtml(targetValue) + '</span>';
            } else {
                targetLine += escapeHtml(targetValue);
            }
            targetLine += semicolon;
            targetLines.push(targetLine);
        } else {
            // Property missing in target - show placeholder (extra property)
            var sourceOptional2 = sourceProp.optional ? '?' : '';
            var placeholderLine2 = '  <span class="diff-extra">' + propName + sourceOptional2 + ': (extra)</span>' + semicolon;
            targetLines.push(placeholderLine2);
        }
    });

    sourceLines.push('}');
    targetLines.push('}');

    return {
        sourceHtml: sourceLines.join('\n'),
        targetHtml: targetLines.join('\n')
    };
}

// ========== END: Unified Type Comparison System ==========

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getTypeSummary(type) {
    if (type.includes('[]')) return t('array');
    if (type.startsWith('{')) return t('object');
    if (type === 'string') return t('string');
    if (type === 'number') return t('number');
    if (type === 'boolean') return t('boolean');
    return type;
}

function getProblemClass(problem) {
    if (problem.type === 'cannotFindModule') return 'module';
    if (problem.type === 'cannotFindName') return 'notfound';
    if (problem.type === 'noOverload') return 'generic';
    if (problem.type === 'possiblyUndefined' || problem.type === 'possiblyNull' || problem.type === 'possiblyNullOrUndefined') return 'nullable';
    if (problem.type === 'unknownType') return 'unknown';
    if (problem.type === 'argumentCount') return 'argument';
    if (problem.type === 'notCallable' || problem.type === 'notConstructable') return 'callable';
    if (problem.type === 'operatorError') return 'operator';
    if (problem.type === 'constraintError') return 'constraint';
    if (problem.type === 'interfaceExtendError' || problem.type === 'classImplementError') return 'inheritance';
    if (problem.type === 'indexAccessError' || problem.type === 'invalidIndexType' || problem.type === 'cannotIndex') return 'index';
    if (problem.isLiteral) return 'literal';
    if (problem.isGeneric) return 'generic';
    if (problem.isUnion) return 'union';
    return '';
}

function getProblemTitle(problem, result) {
    if (problem.type === 'missing') return t('missingProp');
    if (problem.type === 'notExist' || problem.type === 'propertyNotExist') return t('missingProp');
    if (problem.type === 'cannotFindName') return t('notFoundError');
    if (problem.type === 'cannotFindModule') return t('moduleError');
    if (problem.type === 'noOverload') return t('overloadError');
    if (problem.type === 'implicitAny') return t('implicitAnyError');
    if (problem.type === 'unknownType') return t('unknownTypeError');
    if (problem.type === 'possiblyUndefined') return t('possiblyUndefinedError');
    if (problem.type === 'possiblyNull') return t('possiblyNullError');
    if (problem.type === 'possiblyNullOrUndefined') return t('possiblyNullOrUndefinedError');
    if (problem.type === 'argumentCount') return t('argumentCountError');
    if (problem.type === 'notCallable') return t('notCallableError');
    if (problem.type === 'notConstructable') return t('notConstructableError');
    if (problem.type === 'mustReturn') return t('mustReturnError');
    if (problem.type === 'operatorError') return t('operatorError');
    if (problem.type === 'constraintError') return t('constraintError');
    if (problem.type === 'conversionMistake') return t('conversionMistakeError');
    if (problem.type === 'basePropertyMismatch') return t('basePropertyError');
    if (problem.type === 'missingPropsFrom') return t('missingProp');
    if (problem.type === 'unintentionalComparison') return t('unintentionalComparisonError');
    if (problem.type === 'usedBeforeAssigned') return t('usedBeforeAssignedError');
    if (problem.type === 'noInitializer') return t('noInitializerError');
    if (problem.type === 'undefinedNotAssignable') return t('undefinedNotAssignableError');
    if (problem.type === 'nullNotAssignable') return t('nullNotAssignableError');
    if (problem.type === 'genericArgsRequired') return t('genericArgsError');
    if (problem.type === 'typeAsValue') return t('typeAsValueError');
    if (problem.type === 'valueAsType') return t('valueAsTypeError');
    if (problem.type === 'syntaxExpected') return t('syntaxError');
    if (problem.type === 'interfaceExtendError') return t('interfaceExtendError');
    if (problem.type === 'classImplementError') return t('classImplementError');
    if (problem.type === 'indexAccessError' || problem.type === 'invalidIndexType' || problem.type === 'cannotIndex') return t('indexError');
    if (problem.isGeneric) return t('genericError');
    if (problem.isUnion) return t('unionError');
    if (problem.isLiteral) return t('literalError');
    if (problem.isArrayMismatch || result.isArrayObjectMismatch) return t('arrayMismatch');
    return t('typeMismatch');
}

function displayResult(result) {
    var html = '';
    var input = document.getElementById('errorInput').value.trim();

    // Check if no problems found - show feedback option
    if (result.problems.length === 0) {
        lastFailedError = input;
        html += '<div class="feedback-box">';
        html += '<div class="feedback-icon">';
        html += '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>';
        html += '</div>';
        html += '<div class="feedback-title">' + t('noProblemsFound') + '</div>';
        html += '<p class="feedback-desc">' + t('feedbackDesc') + '</p>';
        if (FEEDBACK_API_URL) {
            html += '<button id="feedbackBtn" class="feedback-btn" onclick="submitFeedback()">';
            html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4 20-7z"/></svg> ';
            html += t('submitFeedback');
            html += '</button>';
        }
        html += '</div>';

        document.getElementById('resultContent').innerHTML = html;
        document.getElementById('resultSection').className = 'result-section card active';
        return;
    }

    // Clear last failed error since we found problems
    lastFailedError = '';

    if (result.isArrayObjectMismatch) {
        html += '<div class="warning-box">';
        html += '<span class="warning-icon">⚠️</span>';
        html += '<span class="warning-text">' + t('arrayObjectMismatch') + '</span>';
        html += '</div>';
    }

    html += '<div class="summary-box">';
    html += '<div class="summary-title">🔍 ' + t('foundProblems') + ': ' + result.problems.length;
    if (result.errorCodes && result.errorCodes.length > 0) {
        result.errorCodes.forEach(function(code) {
            html += '<span class="error-code">' + code + '</span>';
        });
    }
    html += '</div>';

    result.problems.forEach(function(problem, idx) {
        var problemClass = getProblemClass(problem);
        html += '<div class="problem-card ' + problemClass + '">';
        html += '<div class="problem-header">';
        html += '<span class="problem-number">' + (idx + 1) + '</span>';
        html += '<span class="problem-title">' + getProblemTitle(problem, result) + '</span>';
        html += '</div>';

        if (problem.type === 'missing') {
            if (problem.path.length > 0) {
                html += '<div class="problem-path">' + problem.path.join(' → ') + '</div>';
            }
            html += '<div class="type-box wrong">' + t('requiredProps') + ': ' + problem.missingProps.join(', ') + '</div>';
        } else if (problem.type === 'notExist') {
            html += '<div class="type-box wrong">Property "' + problem.propName + '" does not exist on type "' + problem.onType + '"';
            if (problem.suggestion) {
                html += '<br><br>' + t('didYouMean') + ' <span class="diff-correct">' + problem.suggestion + '</span>';
            }
            html += '</div>';
        } else if (problem.type === 'cannotFindName') {
            html += '<div class="type-box wrong">Cannot find name "' + problem.name + '"';
            if (problem.suggestion) {
                html += '<br><br>' + t('didYouMean') + ' <span class="diff-correct">' + problem.suggestion + '</span>';
            }
            html += '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('checkName') + '</p>';
            html += '<div class="solution-code">';
            html += '<span class="comment">// ' + t('wrongCode').replace('// ', '') + '</span>\n';
            html += problem.name + '\n\n';
            html += '<span class="comment">// Check if:</span>\n';
            html += '- Import is missing\n';
            html += '- Variable is declared\n';
            html += '- Typo in name';
            html += '</div></div>';
        } else if (problem.type === 'cannotFindModule') {
            html += '<div class="type-box wrong">Cannot find module "' + problem.moduleName + '"</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('installModule') + '</p>';
            html += '<div class="solution-code">';
            html += '<span class="keyword">npm</span> install ' + problem.moduleName + '\n';
            html += '<span class="comment">// or</span>\n';
            html += '<span class="keyword">npm</span> install @types/' + problem.moduleName;
            html += '</div></div>';
        } else if (problem.type === 'noOverload') {
            html += '<div class="type-box wrong">No overload matches this call. Check function arguments.</div>';
        } else if (problem.type === 'implicitAny') {
            html += '<div class="type-box wrong">Parameter "' + problem.paramName + '" implicitly has an "any" type</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">' + t('wrongCode') + '</span>\n';
            html += 'function fn(' + problem.paramName + ') { ... }\n\n';
            html += '<span class="comment">' + t('correctCode') + '</span>\n';
            html += 'function fn(' + problem.paramName + '<span class="keyword">: string</span>) { ... }';
            html += '</div></div>';
        } else if (problem.type === 'unknownType') {
            html += '<div class="type-box wrong">' + t('unknownTypeDesc') + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">' + t('wrongCode') + '</span>\n';
            html += 'const value: unknown = getData();\nvalue.someMethod(); <span class="comment">// Error!</span>\n\n';
            html += '<span class="comment">' + t('correctCode') + '</span>\n';
            html += '<span class="keyword">if</span> (<span class="keyword">typeof</span> value === "string") {\n  value.toUpperCase(); <span class="comment">// OK</span>\n}';
            html += '</div></div>';
        } else if (problem.type === 'possiblyUndefined') {
            html += '<div class="type-box wrong">' + t('possiblyUndefinedDesc') + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">// Option 1: Optional chaining</span>\nobj?.property\n\n';
            html += '<span class="comment">// Option 2: Nullish check</span>\n<span class="keyword">if</span> (obj !== undefined) { obj.property }\n\n';
            html += '<span class="comment">// Option 3: Non-null assertion (use carefully)</span>\nobj!.property';
            html += '</div></div>';
        } else if (problem.type === 'possiblyNull') {
            html += '<div class="type-box wrong">' + t('possiblyNullDesc') + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">// Option 1: Optional chaining</span>\nobj?.property\n\n';
            html += '<span class="comment">// Option 2: Null check</span>\n<span class="keyword">if</span> (obj !== null) { obj.property }\n\n';
            html += '<span class="comment">// Option 3: Nullish coalescing</span>\nconst value = obj ?? defaultValue;';
            html += '</div></div>';
        } else if (problem.type === 'possiblyNullOrUndefined') {
            html += '<div class="type-box wrong">' + t('possiblyNullOrUndefinedDesc') + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">// Option 1: Optional chaining</span>\nobj?.property\n\n';
            html += '<span class="comment">// Option 2: Nullish check</span>\n<span class="keyword">if</span> (obj != null) { obj.property }\n\n';
            html += '<span class="comment">// Option 3: Nullish coalescing</span>\nconst value = obj ?? defaultValue;';
            html += '</div></div>';
        } else if (problem.type === 'argumentCount') {
            html += '<div class="type-box wrong">' + t('expectedArgs') + ': ' + problem.expectedMin + (problem.expectedMax !== problem.expectedMin ? '-' + problem.expectedMax : '') + ', ' + t('gotArgs') + ': ' + problem.got + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('argumentCountSolution') + '</p>';
            html += '</div>';
        } else if (problem.type === 'notCallable') {
            html += '<div class="type-box wrong">' + t('notCallableDesc') + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('notCallableSolution') + '</p>';
            html += '</div>';
        } else if (problem.type === 'notConstructable') {
            html += '<div class="type-box wrong">' + t('notConstructableDesc') + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('notConstructableSolution') + '</p>';
            html += '</div>';
        } else if (problem.type === 'mustReturn') {
            html += '<div class="type-box wrong">' + t('mustReturnDesc') + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">' + t('wrongCode') + '</span>\n';
            html += '<span class="keyword">function</span> getValue(): string {\n  <span class="comment">// no return!</span>\n}\n\n';
            html += '<span class="comment">' + t('correctCode') + '</span>\n';
            html += '<span class="keyword">function</span> getValue(): string {\n  <span class="keyword">return</span> "value";\n}';
            html += '</div></div>';
        } else if (problem.type === 'operatorError') {
            html += '<div class="type-box wrong">' + t('operatorErrorDesc').replace('{op}', problem.operator).replace('{left}', problem.leftType).replace('{right}', problem.rightType) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('operatorSolution') + '</p>';
            html += '</div>';
        } else if (problem.type === 'constraintError') {
            html += '<div class="type-box wrong">' + t('constraintErrorDesc').replace('{type}', problem.sourceType).replace('{constraint}', problem.constraint) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('constraintSolution') + '</p>';
            html += '</div>';
        } else if (problem.type === 'conversionMistake') {
            html += '<div class="type-box wrong">' + t('conversionMistakeDesc').replace('{from}', problem.sourceType).replace('{to}', problem.targetType) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">// ' + t('useAsUnknown') + '</span>\n';
            html += 'const result = value <span class="keyword">as unknown as</span> TargetType;';
            html += '</div></div>';
        } else if (problem.type === 'basePropertyMismatch') {
            html += '<div class="type-box wrong">' + t('basePropertyDesc').replace('{prop}', problem.propName).replace('{child}', problem.childType).replace('{base}', problem.baseType) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('basePropertySolution') + '</p>';
            html += '</div>';
        } else if (problem.type === 'missingPropsFrom') {
            html += '<div class="type-box wrong">' + t('missingPropsFromDesc').replace('{source}', problem.sourceType).replace('{target}', problem.targetType) + '<br><br>' + t('requiredProps') + ': ' + problem.missingProps.join(', ') + '</div>';
        } else if (problem.type === 'unintentionalComparison') {
            html += '<div class="type-box wrong">' + t('unintentionalComparisonDesc').replace('{result}', problem.result) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('unintentionalComparisonSolution') + '</p>';
            html += '</div>';
        } else if (problem.type === 'usedBeforeAssigned') {
            html += '<div class="type-box wrong">' + t('usedBeforeAssignedDesc').replace('{var}', problem.varName) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">' + t('wrongCode') + '</span>\n';
            html += '<span class="keyword">let</span> ' + problem.varName + ';\nconsole.log(' + problem.varName + '); <span class="comment">// Error!</span>\n\n';
            html += '<span class="comment">' + t('correctCode') + '</span>\n';
            html += '<span class="keyword">let</span> ' + problem.varName + ' = initialValue;\nconsole.log(' + problem.varName + ');';
            html += '</div></div>';
        } else if (problem.type === 'noInitializer') {
            html += '<div class="type-box wrong">' + t('noInitializerDesc').replace('{prop}', problem.propName) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">// Option 1: Initialize in declaration</span>\n';
            html += problem.propName + ': string = "";\n\n';
            html += '<span class="comment">// Option 2: Initialize in constructor</span>\n';
            html += '<span class="keyword">constructor</span>() { this.' + problem.propName + ' = ""; }\n\n';
            html += '<span class="comment">// Option 3: Use definite assignment assertion</span>\n';
            html += problem.propName + '!: string;';
            html += '</div></div>';
        } else if (problem.type === 'undefinedNotAssignable' || problem.type === 'nullNotAssignable') {
            var nullOrUndefined = problem.type === 'undefinedNotAssignable' ? 'undefined' : 'null';
            html += '<div class="type-box wrong">' + t('nullishNotAssignableDesc').replace('{nullish}', nullOrUndefined).replace('{target}', problem.targetType) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">// Option 1: Provide a value</span>\nconst value: ' + problem.targetType + ' = actualValue;\n\n';
            html += '<span class="comment">// Option 2: Make optional</span>\nconst value: ' + problem.targetType + ' | ' + nullOrUndefined + ' = ' + nullOrUndefined + ';\n\n';
            html += '<span class="comment">// Option 3: Use nullish coalescing</span>\nconst value = possiblyNull ?? defaultValue;';
            html += '</div></div>';
        } else if (problem.type === 'genericArgsRequired') {
            html += '<div class="type-box wrong">' + t('genericArgsDesc').replace('{type}', problem.genericType).replace('{count}', problem.requiredCount) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">' + t('wrongCode') + '</span>\n';
            html += 'const arr: Array; <span class="comment">// Missing type argument</span>\n\n';
            html += '<span class="comment">' + t('correctCode') + '</span>\n';
            html += 'const arr: Array<span class="keyword">&lt;string&gt;</span>;';
            html += '</div></div>';
        } else if (problem.type === 'typeAsValue') {
            html += '<div class="type-box wrong">' + t('typeAsValueDesc').replace('{name}', problem.typeName) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">' + t('wrongCode') + '</span>\n';
            html += 'const x = ' + problem.typeName + '; <span class="comment">// Using type as value</span>\n\n';
            html += '<span class="comment">' + t('correctCode') + '</span>\n';
            html += '<span class="keyword">type</span> X = ' + problem.typeName + '; <span class="comment">// Use in type position</span>\n';
            html += 'const x: ' + problem.typeName + ' = { ... };';
            html += '</div></div>';
        } else if (problem.type === 'valueAsType') {
            html += '<div class="type-box wrong">' + t('valueAsTypeDesc').replace('{name}', problem.valueName) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">' + t('wrongCode') + '</span>\n';
            html += '<span class="keyword">const</span> myVar = "hello";\n<span class="keyword">type</span> X = myVar; <span class="comment">// Using value as type</span>\n\n';
            html += '<span class="comment">' + t('correctCode') + '</span>\n';
            html += '<span class="keyword">const</span> myVar = "hello";\n<span class="keyword">type</span> X = <span class="keyword">typeof</span> myVar; <span class="comment">// "string"</span>';
            html += '</div></div>';
        } else if (problem.type === 'syntaxExpected') {
            html += '<div class="type-box wrong">' + t('syntaxExpectedDesc').replace('{expected}', problem.expected) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('syntaxSolution').replace('{expected}', problem.expected) + '</p>';
            html += '</div>';
        } else if (problem.type === 'interfaceExtendError') {
            html += '<div class="type-box wrong">' + t('interfaceExtendDesc').replace('{child}', problem.childInterface).replace('{parent}', problem.parentInterface) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('interfaceExtendSolution') + '</p>';
            html += '</div>';
        } else if (problem.type === 'classImplementError') {
            html += '<div class="type-box wrong">' + t('classImplementDesc').replace('{class}', problem.className).replace('{interface}', problem.interfaceName) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('classImplementSolution') + '</p>';
            html += '</div>';
        } else if (problem.type === 'indexAccessError') {
            html += '<div class="type-box wrong">' + t('indexAccessDesc').replace('{indexType}', problem.indexType).replace('{objectType}', problem.objectType) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<div class="solution-code">';
            html += '<span class="comment">// Option 1: Add index signature</span>\n';
            html += '<span class="keyword">interface</span> MyType {\n  [key: string]: any;\n}\n\n';
            html += '<span class="comment">// Option 2: Use Record type</span>\n';
            html += '<span class="keyword">const</span> obj: Record&lt;string, ValueType&gt; = {};';
            html += '</div></div>';
        } else if (problem.type === 'invalidIndexType' || problem.type === 'cannotIndex') {
            var indexType = problem.indexType;
            var objectType = problem.objectType || 'object';
            html += '<div class="type-box wrong">' + t('invalidIndexDesc').replace('{indexType}', indexType).replace('{objectType}', objectType) + '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('invalidIndexSolution') + '</p>';
            html += '</div>';
        } else if (problem.type === 'propertyNotExist') {
            html += '<div class="type-box wrong">Property "' + problem.propName + '" does not exist on type "' + problem.onType + '"';
            if (problem.suggestion) {
                html += '<br><br>' + t('didYouMean') + ' <span class="diff-correct">' + problem.suggestion + '</span>';
            }
            html += '</div>';
            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            html += '<p class="solution-text">' + t('propertyNotExistSolution') + '</p>';
            html += '</div>';
        } else if (problem.isLiteral && problem.sourceType && problem.targetType) {
            // Literal type mismatch - special UI
            if (problem.path.length > 0) {
                html += '<div class="problem-path">' + problem.path.join(' → ') + '</div>';
            }

            var isStringLiteral = /^["']/.test(problem.sourceType) || /^["']/.test(problem.targetType);
            var isNumberLiteral = /^\d+$/.test(problem.sourceType) || /^\d+$/.test(problem.targetType);

            html += '<div class="type-box wrong">' + t('literalErrorDesc') + '</div>';

            html += '<div class="type-comparison">';

            html += '<div class="type-column">';
            html += '<div class="type-label wrong">❌ ' + t('providedType') + '</div>';
            html += '<div class="type-box wrong"><pre class="type-pre"><span class="diff-error">' + escapeHtml(problem.sourceType) + '</span></pre></div>';
            html += '</div>';

            html += '<div class="type-arrow">→</div>';

            html += '<div class="type-column">';
            html += '<div class="type-label correct">✅ ' + t('expectedType') + '</div>';
            html += '<div class="type-box correct"><pre class="type-pre"><span class="diff-correct">' + escapeHtml(problem.targetType) + '</span></pre></div>';
            html += '</div>';

            html += '</div>';

            html += '<div class="solution-box"><div class="solution-title">💡 ' + t('solution') + '</div>';
            if (isStringLiteral) {
                html += '<p class="solution-text">' + t('literalStringSolution') + '</p>';
            } else if (isNumberLiteral) {
                html += '<p class="solution-text">' + t('literalNumberSolution') + '</p>';
            }
            html += '<div class="solution-code">';
            html += '<span class="comment">' + t('wrongCode') + '</span>\n';
            if (isStringLiteral) {
                html += '<span class="keyword">const</span> role = "user"; <span class="comment">// type: string</span>\n';
                html += 'fn(role); <span class="comment">// Error: string ≠ "admin" | "user"</span>\n\n';
            } else {
                html += '<span class="keyword">const</span> value = 1; <span class="comment">// type: number</span>\n';
                html += 'fn(value); <span class="comment">// Error: number ≠ 1 | 2 | 3</span>\n\n';
            }
            html += '<span class="comment">' + t('correctCode') + '</span>\n';
            if (isStringLiteral) {
                html += '<span class="keyword">const</span> role = "user" <span class="keyword">as const</span>; <span class="comment">// type: "user"</span>\n';
                html += 'fn(role); <span class="comment">// OK!</span>\n\n';
                html += '<span class="comment">// ' + t('literalAsConstHint') + '</span>\n';
                html += '<span class="keyword">const</span> config = { role: "admin" } <span class="keyword">as const</span>;';
            } else {
                html += '<span class="keyword">const</span> value = 1 <span class="keyword">as const</span>; <span class="comment">// type: 1</span>\n';
                html += 'fn(value); <span class="comment">// OK!</span>';
            }
            html += '</div>';
            html += '<p class="solution-text" style="margin-top: 12px; font-size: 13px; color: #666;">💡 ' + t('literalWideningHint') + '</p>';
            html += '</div>';
        } else if (problem.sourceType && problem.targetType) {
            // Type comparison with aligned structure
            if (problem.path.length > 0) {
                html += '<div class="problem-path">' + problem.path.join(' → ') + '</div>';
            }

            var comparison = renderAlignedTypeComparison(problem.sourceType, problem.targetType);

            html += '<div class="type-comparison">';

            html += '<div class="type-column">';
            html += '<div class="type-label wrong">❌ ' + t('providedType') + ' (' + getTypeSummary(problem.sourceType) + ')</div>';
            html += '<div class="type-box wrong"><pre class="type-pre">' + comparison.sourceHtml + '</pre></div>';
            html += '</div>';

            html += '<div class="type-arrow">→</div>';

            html += '<div class="type-column">';
            html += '<div class="type-label correct">✅ ' + t('expectedType') + ' (' + getTypeSummary(problem.targetType) + ')</div>';
            html += '<div class="type-box correct"><pre class="type-pre">' + comparison.targetHtml + '</pre></div>';
            html += '</div>';

            html += '</div>';
        }

        html += '</div>';
    });

    html += '</div>';

    // Solution box for array problems
    var arrayProblems = result.problems.filter(function(p) { return p.isArrayMismatch; });
    if (result.isArrayObjectMismatch || arrayProblems.length > 0) {
        var propNames = arrayProblems.map(function(p) { return p.path[p.path.length - 1]; }).filter(Boolean);
        var uniquePropNames = propNames.filter(function(v, i, a) { return a.indexOf(v) === i; });
        if (uniquePropNames.length === 0) uniquePropNames.push('data');

        html += '<div class="solution-box">';
        html += '<div class="solution-title">💡 ' + t('solution') + '</div>';
        html += '<p class="solution-text">' + t('wrapArray') + '</p>';
        html += '<div class="solution-code">';
        html += '<span class="comment">' + t('wrongCode') + '</span>\n';
        html += uniquePropNames.map(function(name) { return name + ': { <span class="keyword">...</span> }'; }).join('\n');
        html += '\n\n<span class="comment">' + t('correctCode') + '</span>\n';
        html += uniquePropNames.map(function(name) { return name + ': [{ <span class="keyword">...</span> }]'; }).join('\n');
        html += '</div></div>';
    }

    // Error trace
    html += '<div class="error-trace">';
    html += '<div class="error-trace-header" onclick="toggleTrace()">';
    html += '<span>📜 ' + t('viewFullError') + '</span>';
    html += '<span id="traceArrow">▼</span>';
    html += '</div>';
    html += '<div class="error-trace-content" id="traceContent">';

    var lines = result.originalError.split('\n');
    lines.forEach(function(line) {
        var indent = (line.match(/^(\s*)/) || ['', ''])[1].length;
        var indentStr = '<span class="trace-indent">' + '│ '.repeat(Math.floor(indent / 2)) + '</span>';
        html += '<div class="trace-line">' + indentStr + escapeHtml(line.trim()) + '</div>';
    });

    html += '</div></div>';

    document.getElementById('resultContent').innerHTML = html;
    document.getElementById('resultSection').className = 'result-section card active';
}

function toggleTrace() {
    var content = document.getElementById('traceContent');
    var arrow = document.getElementById('traceArrow');
    if (content.classList.contains('open')) {
        content.classList.remove('open');
        arrow.textContent = '▼';
    } else {
        content.classList.add('open');
        arrow.textContent = '▲';
    }
}

function clearAll() {
    document.getElementById('errorInput').value = '';
    document.getElementById('resultSection').className = 'result-section card';
    document.getElementById('bottomAd').style.display = 'none';
}

function loadSample() {
    var sample = "Argument of type '{ generalInfo: { dsaleOutfirmName: string; bzpersonRegNo: string; }; bondProcure: { dsaleOutfirmNo: string; }[]; factoryEdit?: { deleteRequest: { dsaleOutfirmNo: string; }; insertRequest?: { dsaleOutfirmNo: string; } | undefined; } | undefined; }' is not assignable to parameter of type '{ generalInfo?: { dsaleOutfirmName: string; } | undefined; bondProcure?: { dsaleOutfirmNo: string; }[] | undefined; factoryEdit?: { insertRequest?: { dsaleOutfirmNo: string; }[] | undefined; deleteRequest?: { dsaleOutfirmNo: string; }[] | undefined; } | undefined; }'.\n  Types of property 'factoryEdit' are incompatible.\n    Type '{ deleteRequest: { dsaleOutfirmNo: string; }; insertRequest?: { dsaleOutfirmNo: string; } | undefined; }' is not assignable to type '{ insertRequest?: { dsaleOutfirmNo: string; }[] | undefined; deleteRequest?: { dsaleOutfirmNo: string; }[] | undefined; }'.\n      Types of property 'insertRequest' are incompatible.\n        Type '{ dsaleOutfirmNo: string; } | undefined' is not assignable to type '{ dsaleOutfirmNo: string; }[] | undefined'.\n          Type '{ dsaleOutfirmNo: string; }' is not assignable to type '{ dsaleOutfirmNo: string; }[]'.\n            Type '{ dsaleOutfirmNo: string; }' is missing the following properties from type '{ dsaleOutfirmNo: string; }[]': length, pop, push, concat, and 35 more.";
    document.getElementById('errorInput').value = sample;
}

function copyResult() {
    var el = document.getElementById('resultContent');
    if (navigator.clipboard) {
        navigator.clipboard.writeText(el.innerText).then(function() { alert(t('copied')); });
    }
}
