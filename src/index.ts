import { requireNativeModule } from "expo-modules-core";
import {
  createQuickJS as createFacade,
  type NativeTransport,
  type ExecuteOptions,
} from "./core.js";
export * from "./core.js";
/** A module has two live workers in total, shared by all facades. */
export function createQuickJS(transport?: NativeTransport) {
  return createFacade(
    transport ?? requireNativeModule<NativeTransport>("ExpoQuickJS"),
  );
}
let shared: ReturnType<typeof createFacade> | undefined;
const instance = () => shared ?? (shared = createQuickJS());
export const execute = (code: string, options: ExecuteOptions) =>
  instance().execute(code, options);
export const cancel = (runId: string) => instance().cancel(runId);
export const close = () => instance().close();
