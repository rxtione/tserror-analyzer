// analyzer.js - TypeScript Error Analyzer Core Logic

function analyzeError() {
    var input = document.getElementById('errorInput').value.trim();
    if (!input) {
        alert(t('alertEmpty'));
        return;
    }
    var result = parseTypeScriptError(input);
    displayResult(result);
    document.getElementById('bottomAd').style.display = 'flex';
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
            if (/^["'].*["']$/.test(sourceType) || /^["'].*["']$/.test(targetType) ||
                /^\d+$/.test(sourceType) || /^\d+$/.test(targetType)) {
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
    if (problem.isGeneric) return 'generic';
    if (problem.isUnion) return 'union';
    return '';
}

function getProblemTitle(problem, result) {
    if (problem.type === 'missing') return t('missingProp');
    if (problem.type === 'notExist') return t('missingProp');
    if (problem.type === 'cannotFindName') return t('notFoundError');
    if (problem.type === 'cannotFindModule') return t('moduleError');
    if (problem.type === 'noOverload') return t('overloadError');
    if (problem.type === 'implicitAny') return t('implicitAnyError');
    if (problem.isGeneric) return t('genericError');
    if (problem.isUnion) return t('unionError');
    if (problem.isLiteral) return t('literalError');
    if (problem.isArrayMismatch || result.isArrayObjectMismatch) return t('arrayMismatch');
    return t('typeMismatch');
}

function displayResult(result) {
    var html = '';

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
        } else {
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
