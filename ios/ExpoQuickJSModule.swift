import ExpoModulesCore

public final class ExpoQuickJSModule: Module {
  private let controlQueue = DispatchQueue(label: "expo.quickjs.control", qos: .userInitiated, attributes: .concurrent)
  private lazy var runtime = EQQRuntime { [weak self] event in
    self?.sendEvent("onEvent", event)
  }

  public func definition() -> ModuleDefinition {
    Name("ExpoQuickJS")
    Events("onEvent")
    Constants(["identity": EQQRuntime.identity])
    OnCreate { _ = self.runtime }
    AsyncFunction("start") { (id: String, bootstrap: String, data: String, limits: String) in
      try self.runtime.start(id, bootstrap: bootstrap, data: data, limits: limits)
    }.runOnQueue(controlQueue)
    AsyncFunction("deliver") { (id: String, message: String) in
      try self.runtime.deliver(id, message: message)
    }.runOnQueue(controlQueue)
    AsyncFunction("stop") { (id: String) in
      try self.runtime.stop(id)
    }.runOnQueue(controlQueue)
    AsyncFunction("close") { try self.runtime.close() }.runOnQueue(controlQueue)
    OnDestroy {
      let runtime = self.runtime
      self.controlQueue.async { try? runtime.close() }
    }
  }
}
