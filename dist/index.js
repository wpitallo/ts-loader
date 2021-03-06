"use strict";
var path = require('path');
var loaderUtils = require('loader-utils');
var objectAssign = require('object-assign');
var arrify = require('arrify');
require('colors');
var instances = require('./instances');
var utils = require('./utils');
var webpackInstances = [];
var definitionFileRegex = /\.d\.ts$/;
function loader(contents) {
    this.cacheable && this.cacheable();
    var callback = this.async();
    var options = makeOptions(this);
    var rawFilePath = path.normalize(this.resourcePath);
    var filePath = utils.appendTsSuffixIfMatch(options.appendTsSuffixTo, rawFilePath);
    var _a = instances.ensureTypeScriptInstance(options, this), instance = _a.instance, error = _a.error;
    if (error) {
        callback(error);
        return;
    }
    var file = updateFileInCache(filePath, contents, instance);
    var _b = options.transpileOnly
        ? getTranspilationEmit(filePath, contents, instance, this)
        : getEmit(filePath, instance, this), outputText = _b.outputText, sourceMapText = _b.sourceMapText;
    if (outputText === null || outputText === undefined) {
        throw new Error("Typescript emitted no output for " + filePath);
    }
    var _c = makeSourceMap(sourceMapText, outputText, filePath, contents, this), sourceMap = _c.sourceMap, output = _c.output;
    // Make sure webpack is aware that even though the emitted JavaScript may be the same as
    // a previously cached version the TypeScript may be different and therefore should be
    // treated as new
    this._module.meta.tsLoaderFileVersion = file.version;
    callback(null, output, sourceMap);
}
function makeOptions(loader) {
    var queryOptions = loaderUtils.parseQuery(loader.query);
    var configFileOptions = loader.options.ts || {};
    var options = objectAssign({}, {
        silent: false,
        logLevel: 'INFO',
        logInfoToStdOut: false,
        instance: 'default',
        compiler: 'typescript',
        configFileName: 'tsconfig.json',
        transpileOnly: true,
        visualStudioErrorFormat: false,
        compilerOptions: {},
        appendTsSuffixTo: []
    }, configFileOptions, queryOptions);
    options.ignoreDiagnostics = arrify(options.ignoreDiagnostics).map(Number);
    options.logLevel = options.logLevel.toUpperCase();
    // differentiate the TypeScript instance based on the webpack instance
    var webpackIndex = webpackInstances.indexOf(loader._compiler);
    if (webpackIndex === -1) {
        webpackIndex = webpackInstances.push(loader._compiler) - 1;
    }
    options.instance = webpackIndex + '_' + options.instance;
    return options;
}
function updateFileInCache(filePath, contents, instance) {
    // Update file contents
    var file = instance.files[filePath];
    if (!file) {
        file = instance.files[filePath] = { version: 0 };
    }
    if (file.text !== contents) {
        file.version++;
        file.text = contents;
        instance.version++;
    }
    // push this file to modified files hash.
    if (!instance.modifiedFiles) {
        instance.modifiedFiles = {};
    }
    instance.modifiedFiles[filePath] = file;
    return file;
}
function getEmit(filePath, instance, loader) {
    // Emit Javascript
    var output = instance.languageService.getEmitOutput(filePath);
    // Make this file dependent on *all* definition files in the program
    loader.clearDependencies();
    loader.addDependency(filePath);
    var allDefinitionFiles = Object.keys(instance.files).filter(function (fp) { return definitionFileRegex.test(fp); });
    allDefinitionFiles.forEach(loader.addDependency.bind(loader));
    // Additionally make this file dependent on all imported files as well
    // as any deeper recursive dependencies
    var additionalDependencies = utils.collectAllDependencies(instance.dependencyGraph, filePath);
    if (additionalDependencies) {
        additionalDependencies.forEach(loader.addDependency.bind(loader));
    }
    loader._module.meta.tsLoaderDefinitionFileVersions = allDefinitionFiles
        .concat(additionalDependencies)
        .map(function (fp) { return fp + '@' + (instance.files[fp] || { version: '?' }).version; });
    var outputFile = output.outputFiles.filter(function (f) { return !!f.name.match(/\.js(x?)$/); }).pop();
    var outputText = (outputFile) ? outputFile.text : undefined;
    var sourceMapFile = output.outputFiles.filter(function (f) { return !!f.name.match(/\.js(x?)\.map$/); }).pop();
    var sourceMapText = (sourceMapFile) ? sourceMapFile.text : undefined;
    return { outputText: outputText, sourceMapText: sourceMapText };
}
function getTranspilationEmit(filePath, contents, instance, loader) {
    var fileName = path.basename(filePath);
    var transpileResult = instance.compiler.transpileModule(contents, {
        compilerOptions: instance.compilerOptions,
        reportDiagnostics: true,
        fileName: fileName
    });
    var outputText = transpileResult.outputText, sourceMapText = transpileResult.sourceMapText, diagnostics = transpileResult.diagnostics;
    utils.registerWebpackErrors(loader._module.errors, utils.formatErrors(diagnostics, instance.loaderOptions, instance.compiler, { module: loader._module }));
    return { outputText: outputText, sourceMapText: sourceMapText };
}
function makeSourceMap(sourceMapText, outputText, filePath, contents, loader) {
    if (!sourceMapText) {
        return { output: outputText, sourceMap: undefined };
    }
    var sourceMap = JSON.parse(sourceMapText);
    sourceMap.sources = [loaderUtils.getRemainingRequest(loader)];
    sourceMap.file = filePath;
    sourceMap.sourcesContent = [contents];
    return {
        output: outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, ''),
        sourceMap: sourceMap
    };
}
module.exports = loader;
