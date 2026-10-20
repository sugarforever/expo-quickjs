package expo.modules.quickjs

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.os.Handler
import android.os.Looper
import org.json.JSONObject

class ExpoQuickJSModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var handle: Long = 0
  private val lifetime = Any()
  companion object { init { System.loadLibrary("expo-quickjs-jni") } }
  private external fun nativeIdentity(): String
  private external fun nativeCreate(): Long
  private external fun nativeStart(handle: Long, id: String, bootstrap: String, data: String, limits: LongArray)
  private external fun nativeDeliver(handle: Long, id: String, callId: Long, message: String)
  private external fun nativeStop(handle: Long, id: String)
  private external fun nativeClose(handle: Long)
  private external fun nativeDestroy(handle: Long)
  // Called by JNI from worker. Only Expo's event API on main touches the JS dispatcher.
  fun onNativeEvent(id: String, type: String, status: String, json: String, error: String) {
    main.post { sendEvent("onEvent", mapOf("runId" to id, "type" to type, "status" to status, "json" to json, "error" to error)) }
  }
  private fun positiveInteger(value: Any): Long {
    require(value is Number)
    val n = value.toDouble()
    require(n.isFinite() && n >= 1 && n <= 9007199254740991.0 && n == kotlin.math.floor(n))
    return n.toLong()
  }
  private fun parseLimits(json: String): LongArray {
    val obj = JSONObject(json)
    return arrayOf("timeoutMs", "memoryBytes", "stackBytes", "outputBytes", "messageBytes", "maxHostCalls")
      .map { positiveInteger(obj.get(it)) }.toLongArray()
  }
  override fun definition() = ModuleDefinition {
    Name("ExpoQuickJS")
    Events("onEvent")
    Constants("identity" to nativeIdentity())
    OnCreate { synchronized(lifetime) { handle = nativeCreate() } }
    AsyncFunction("start") { id: String, bootstrap: String, data: String, limits: String ->
      synchronized(lifetime) { check(handle != 0L); nativeStart(handle, id, bootstrap, data, parseLimits(limits)) }
    }
    AsyncFunction("deliver") { id: String, message: String ->
      synchronized(lifetime) { check(handle != 0L); nativeDeliver(handle, id, positiveInteger(JSONObject(message).get("id")), message) }
    }
    AsyncFunction("stop") { id: String ->
      synchronized(lifetime) { if (handle != 0L) nativeStop(handle, id) }
    }
    AsyncFunction("close") {
      synchronized(lifetime) { if (handle != 0L) nativeClose(handle) }
    }
    OnDestroy {
      synchronized(lifetime) { if (handle != 0L) { nativeDestroy(handle); handle = 0 } }
    }
  }
}
