import {readFileSync,existsSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const packed=JSON.parse(readFileSync('build/pack.json','utf8'))[0];
const paths=new Set(packed.files.map(f=>f.path));
for(const file of ['dist/index.js','dist/core.js','dist/index.d.ts','cpp/Execution.cpp','cpp/Identity.h','ios/ExpoQuickJSModule.swift','android/src/main/cpp/QuickJSJNI.cpp','vendor/quickjs-2025-09-13/LICENSE','vendor/quickjs-2025-09-13/quickjs.c','expo-module.config.json','ExpoQuickJS.podspec'])assert.ok(paths.has(file),file);
assert.equal(createHash('sha256').update(readFileSync('vendor/quickjs-2025-09-13.tar.xz')).digest('hex'),'6f1f322aea3bb3a90858db85c9fe717013fde4df7dfcafe2f57e78f5bb4b4a0c');
mkdirSync('build/packed-source',{recursive:true});execFileSync('tar',['-xf',packed.filename,'-C','build/packed-source']);
const cmake=process.env.CMAKE??'cmake';
execFileSync(cmake,['-S','build/packed-source/package','-B','build/packed-core'],{stdio:'inherit'});
execFileSync(cmake,['--build','build/packed-core','-j','4'],{stdio:'inherit'});
execFileSync(process.env.CTEST??'ctest',['--test-dir','build/packed-core','--output-on-failure'],{stdio:'inherit'});
if(existsSync('example/node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js')){
 const result=JSON.parse(execFileSync(process.execPath,['node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js','resolve','--platform','apple','--json'],{cwd:'example',encoding:'utf8'}));
 const module=result.modules.find(m=>m.packageName==='expo-quickjs');assert.ok(module?.modules.some(m=>m.class==='ExpoQuickJSModule'),'Expo module registry must contain native class');
}
console.log('Packed native source, license, checksum and available Expo autolinking checks passed');
