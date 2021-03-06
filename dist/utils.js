"use strict";
var path = require('path');
var fs = require('fs');
var objectAssign = require('object-assign');
var constants = require('./constants');
function registerWebpackErrors(existingErrors, errorsToPush) {
    Array.prototype.splice.apply(existingErrors, [0, 0].concat(errorsToPush));
}
exports.registerWebpackErrors = registerWebpackErrors;
function hasOwnProperty(obj, property) {
    return Object.prototype.hasOwnProperty.call(obj, property);
}
exports.hasOwnProperty = hasOwnProperty;
/**
 * Take TypeScript errors, parse them and format to webpack errors
 * Optionally adds a file name
 */
function formatErrors(diagnostics, loaderOptions, compiler, merge) {
    return diagnostics
        .filter(function (diagnostic) { return loaderOptions.ignoreDiagnostics.indexOf(diagnostic.code) === -1; })
        .map(function (diagnostic) {
        var errorCategory = compiler.DiagnosticCategory[diagnostic.category].toLowerCase();
        var errorCategoryAndCode = errorCategory + ' TS' + diagnostic.code + ': ';
        var messageText = errorCategoryAndCode + compiler.flattenDiagnosticMessageText(diagnostic.messageText, constants.EOL);
        var error;
        if (diagnostic.file) {
            var lineChar = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
            var errorMessage = "" + '('.white + (lineChar.line + 1).toString().cyan + "," + (lineChar.character + 1).toString().cyan + "): " + messageText.red;
            if (loaderOptions.visualStudioErrorFormat) {
                errorMessage = path.normalize(diagnostic.file.fileName).red + errorMessage;
            }
            error = makeError({
                message: errorMessage,
                rawMessage: messageText,
                location: { line: lineChar.line + 1, character: lineChar.character + 1 }
            });
        }
        else {
            error = makeError({ rawMessage: messageText });
        }
        return objectAssign(error, merge);
    });
}
exports.formatErrors = formatErrors;
function readFile(fileName) {
    fileName = path.normalize(fileName);
    try {
        return fs.readFileSync(fileName, { encoding: 'utf8' });
    }
    catch (e) {
        return undefined;
    }
}
exports.readFile = readFile;
function makeError(_a) {
    var rawMessage = _a.rawMessage, message = _a.message, location = _a.location, file = _a.file;
    var error = {
        rawMessage: rawMessage,
        message: message || "" + rawMessage.red,
        loaderSource: 'ts-loader'
    };
    return objectAssign(error, { location: location, file: file });
}
exports.makeError = makeError;
function appendTsSuffixIfMatch(patterns, path) {
    if (patterns.length > 0) {
        for (var _i = 0, patterns_1 = patterns; _i < patterns_1.length; _i++) {
            var regexp = patterns_1[_i];
            if (regexp.test(path)) {
                return path + '.ts';
            }
        }
    }
    return path;
}
exports.appendTsSuffixIfMatch = appendTsSuffixIfMatch;
/**
 * Recursively collect all possible dependants of passed file
 */
function collectAllDependants(reverseDependencyGraph, fileName, collected) {
    if (collected === void 0) { collected = {}; }
    var result = {};
    result[fileName] = true;
    collected[fileName] = true;
    if (reverseDependencyGraph[fileName]) {
        Object.keys(reverseDependencyGraph[fileName]).forEach(function (dependantFileName) {
            if (!collected[dependantFileName]) {
                collectAllDependants(reverseDependencyGraph, dependantFileName, collected)
                    .forEach(function (fName) { return result[fName] = true; });
            }
        });
    }
    return Object.keys(result);
}
exports.collectAllDependants = collectAllDependants;
/**
 * Recursively collect all possible dependencies of passed file
 */
function collectAllDependencies(dependencyGraph, filePath, collected) {
    if (collected === void 0) { collected = {}; }
    var result = {};
    result[filePath] = true;
    collected[filePath] = true;
    var directDependencies = dependencyGraph[filePath];
    if (directDependencies) {
        directDependencies.forEach(function (dependencyFilePath) {
            if (!collected[dependencyFilePath]) {
                collectAllDependencies(dependencyGraph, dependencyFilePath, collected)
                    .forEach(function (fPath) { return result[fPath] = true; });
            }
        });
    }
    return Object.keys(result);
}
exports.collectAllDependencies = collectAllDependencies;
