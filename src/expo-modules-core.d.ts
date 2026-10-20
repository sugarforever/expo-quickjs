// Build-time declaration only; consumers use their installed Expo Modules types.
declare module "expo-modules-core" {
  export function requireNativeModule<T>(name: string): T;
}
