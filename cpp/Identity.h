#pragma once
#include <string>
#if defined(__APPLE__)
#include <TargetConditionals.h>
#endif
namespace expoquickjs {
inline std::string identity() {
 std::string value="quickjs-2025-09-13|sha256:6f1f322aea3bb3a90858db85c9fe717013fde4df7dfcafe2f57e78f5bb4b4a0c|expo-quickjs-channel-1|";
#if defined(__ANDROID__)
 value+="android";
#elif defined(__APPLE__) && TARGET_OS_SIMULATOR
 value+="ios-simulator";
#elif defined(__APPLE__) && TARGET_OS_IPHONE
 value+="ios";
#elif defined(__APPLE__)
 value+="macos";
#elif defined(__linux__)
 value+="linux";
#else
 value+="unknown-os";
#endif
#if defined(__aarch64__) || defined(__arm64__)
 value+="|arm64";
#elif defined(__x86_64__)
 value+="|x86_64";
#elif defined(__arm__)
 value+="|arm32";
#else
 value+="|unknown-arch";
#endif
 value+="|pointer:"+std::to_string(sizeof(void*)*8)+"|abi:1|compiler:";
#if defined(__clang__)
 value+=__clang_version__;
#elif defined(__GNUC__)
 value+=__VERSION__;
#else
 value+="unknown";
#endif
 return value;
}
}
