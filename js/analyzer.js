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

    // Detect all error codes
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

        // Property incompatible
        var propMatch = trimmed.match(/Types of property ['"]([^'"]+)['"] are incompatible/);
        if (propMatch) {
            currentPath.push(propMatch[1]);
        }

        // Type assignment error
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

            // Detect generic types
            if (sourceType.includes('<') || targetType.includes('<')) {
                problem.isGeneric = true;
            }

            // Detect union types
            if (sourceType.includes(' | ') || targetType.includes(' | ')) {
                problem.isUnion = true;
            }

            // Detect literal types
            if (/^["'].*["']$/.test(sourceType) || /^["'].*["']$/.test(targetType) ||
                /^\d+$/.test(sourceType) || /^\d+$/.test(targetType)) {
                problem.isLiteral = true;
            }

            // Detect array mismatches
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

        // Missing properties
        var missingMatch = trimmed.match(/is missing the following properties[^:]*: ([^.]+)/);
        if (missingMatch) {
            var props = missingMatch[1].split(',').map(function(p) { return p.trim(); });
            problems.push({
                path: currentPath.slice(),
                type: 'missing',
                missingProps: props
            });
        }

        // Property does not exist
        var notExistMatch = trimmed.match(/Property ['"]([^'"]+)['"] does not exist on type ['"]([^'"]+)['"]/);
        if (notExistMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'notExist',
                propName: notExistMatch[1],
                onType: notExistMatch[2]
            });
        }

        // TS2304: Cannot find name
        var cannotFindNameMatch = trimmed.match(/Cannot find name ['"]([^'"]+)['"]/);
        if (cannotFindNameMatch) {
            problems.push({
                path: [],
                type: 'cannotFindName',
                name: cannotFindNameMatch[1]
            });
        }

        // TS2307: Cannot find module
        var cannotFindModuleMatch = trimmed.match(/Cannot find module ['"]([^'"]+)['"]/);
        if (cannotFindModuleMatch) {
            problems.push({
                path: [],
                type: 'cannotFindModule',
                moduleName: cannotFindModuleMatch[1]
            });
        }

        // TS2551: Did you mean (typo suggestion)
        var didYouMeanMatch = trimmed.match(/Did you mean ['"]([^'"]+)['"]\?/);
        if (didYouMeanMatch && problems.length > 0) {
            var lastProblem = problems[problems.length - 1];
            lastProblem.suggestion = didYouMeanMatch[1];
        }

        // TS2769: No overload matches
        var noOverloadMatch = trimmed.match(/No overload matches this call/);
        if (noOverloadMatch) {
            problems.push({
                path: currentPath.slice(),
                type: 'noOverload'
            });
        }

        // TS7006: Parameter implicitly has 'any' type
        var implicitAnyMatch = trimmed.match(/Parameter ['"]([^'"]+)['"] implicitly has an ['"]any['"] type/);
        if (implicitAnyMatch) {
            problems.push({
                path: [],
                type: 'implicitAny',
                paramName: implicitAnyMatch[1]
            });
        }

        // Argument type error
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

function formatType(type) {
    var result = '';
    var depth = 0;

    for (var i = 0; i < type.length; i++) {
        var char = type[i];
        var nextChar = type[i + 1];

        if (char === '{') {
            depth++;
            result += '{\n' + '  '.repeat(depth);
        } else if (char === '}') {
            depth--;
            result += '\n' + '  '.repeat(depth) + '}';
        } else if (char === ';' && depth > 0) {
            result += ';\n' + '  '.repeat(depth);
        } else if (char === '[' && nextChar === ']') {
            result += '[]';
            i++;
        } else if (char === ' ' && result.endsWith('\n' + '  '.repeat(depth))) {
            continue;
        } else {
            result += char;
        }
    }

    return result.replace(/\n\s*\n/g, '\n').replace(/\{\s+\}/g, '{}').replace(/\[\s+\]/g, '[]').trim();
}

function highlightTypeDiff(sourceType, targetType, isSource) {
    var type = isSource ? sourceType : targetType;
    var formatted = formatType(type);
    var sourceProps = parseObjectProps(sourceType);
    var targetProps = parseObjectProps(targetType);

    var arrayMismatchProps = [];
    Object.keys(targetProps).forEach(function(propName) {
        var srcType = sourceProps[propName] || '';
        var tgtType = targetProps[propName] || '';
        if (tgtType.includes('[]') && !srcType.includes('[]')) {
            arrayMismatchProps.push(propName);
        }
    });

    var html = escapeHtml(formatted);

    if (isSource) {
        arrayMismatchProps.forEach(function(propName) {
            var regex = new RegExp('(' + escapeRegex(propName) + '\\??:\\s*)([^;\\n]+)', 'g');
            html = html.replace(regex, function(match, prefix, value) {
                if (!value.includes('[]')) {
                    return prefix + '<span class="error-highlight">' + value + '</span>';
                }
                return match;
            });
        });

        if (targetType.endsWith('[]') && !sourceType.endsWith('[]')) {
            html = '<span class="error-highlight">' + html + '</span>';
        }
    } else {
        html = html.replace(/\[\]/g, '<span class="correct-highlight">[]</span>');
    }

    return html;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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
                html += '<br><br>' + t('didYouMean') + ' <span class="correct-highlight">' + problem.suggestion + '</span>';
            }
            html += '</div>';
        } else if (problem.type === 'cannotFindName') {
            html += '<div class="type-box wrong">Cannot find name "' + problem.name + '"';
            if (problem.suggestion) {
                html += '<br><br>' + t('didYouMean') + ' <span class="correct-highlight">' + problem.suggestion + '</span>';
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
            if (problem.path.length > 0) {
                html += '<div class="problem-path">' + problem.path.join(' → ') + '</div>';
            }

            html += '<div class="type-comparison">';

            html += '<div class="type-column">';
            html += '<div class="type-label wrong">❌ ' + t('providedType') + ' (' + getTypeSummary(problem.sourceType) + ')</div>';
            html += '<div class="type-box wrong">' + highlightTypeDiff(problem.sourceType, problem.targetType, true) + '</div>';
            html += '</div>';

            html += '<div class="type-arrow">→</div>';

            html += '<div class="type-column">';
            html += '<div class="type-label correct">✅ ' + t('expectedType') + ' (' + getTypeSummary(problem.targetType) + ')</div>';
            html += '<div class="type-box correct">' + highlightTypeDiff(problem.sourceType, problem.targetType, false) + '</div>';
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

function escapeHtml(text) {
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
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
