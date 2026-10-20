require 'json'
package = JSON.parse(File.read(File.join(__dir__, 'package.json')))
Pod::Spec.new do |s|
  s.name = 'ExpoQuickJS'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = { :type => 'MIT', :file => 'LICENSE' }
  s.author = 'expo-quickjs contributors'
  s.homepage = 'https://www.npmjs.com/package/expo-quickjs'
  # Local development pod; no remote is fetched by consumers using node_modules.
  s.source = { :http => 'https://registry.npmjs.org/expo-quickjs/-/expo-quickjs-' + s.version.to_s + '.tgz' }
  s.platform = :ios, '16.4'
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = 'ios/**/*.{h,mm,swift}', 'cpp/**/*.{h,cpp}', 'vendor/quickjs-2025-09-13/{quickjs,dtoa,libregexp,libunicode,cutils}.c', 'vendor/quickjs-2025-09-13/*.h'
  s.public_header_files = 'ios/EQQRuntime.h'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'CLANG_CXX_LANGUAGE_STANDARD' => 'c++17', 'GCC_PREPROCESSOR_DEFINITIONS' => '$(inherited) _GNU_SOURCE CONFIG_VERSION=\\"2025-09-13\\"' }
end
