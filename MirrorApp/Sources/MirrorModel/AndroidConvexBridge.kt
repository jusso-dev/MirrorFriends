// ===========================================================================
// AndroidConvexBridge — hand-written Kotlin used by ConvexService on Android.
//
// Skip transpiles the Swift in this module to Kotlin; this file is plain Kotlin
// that is compiled into the same Android module and called from the `#if SKIP`
// branches of ConvexService.swift. It wraps the native Convex Android SDK
// (`dev.convex.android`) and exposes a tiny JSON-string API so nothing generic,
// Combine, or Flow has to cross the Swift/Kotlin boundary:
//
//   suspend fun query(name, argsJson) -> String   // result as JSON text
//   suspend fun mutation(name, argsJson) -> String
//   suspend fun action(name, argsJson) -> String
//   suspend fun login(token) -> Boolean
//   suspend fun logout()
//
// IMPORTANT (verify on a Mac when you first `skip build`):
//   1. `package` below must match the Kotlin package Skip generates for the
//      MirrorModel module (check the generated sources). If they differ, the
//      `#if SKIP` references to `AndroidConvexBridge` won't resolve.
//   2. The Android Context accessor (`ProcessInfo.processInfo.androidContext`)
//      is the SkipFoundation way to reach the app Context; adjust if your Skip
//      version exposes it differently.
//   3. Add the Gradle dependencies (see Sources/MirrorModel/Skip/skip.yml):
//        dev.convex:android-convexmobile, kotlinx-serialization-json,
//        kotlinx-coroutines-core.
// ===========================================================================
package mirrormodel

import android.content.Context
import dev.convex.android.AuthProvider
import dev.convex.android.ConvexClientWithAuth
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject

/**
 * Token-supplying AuthProvider. The auth "result" is the JWT string itself
 * (obtained from Convex Auth's `auth:signIn` action). No UI/redirect is needed,
 * so the Android `Context` argument is accepted but unused.
 */
class TokenAuthProvider : AuthProvider<String> {
    @Volatile
    var token: String? = null

    override suspend fun login(context: Context, onIdToken: (String?) -> Unit): Result<String> {
        val t = token ?: return Result.failure(IllegalStateException("Not authenticated"))
        onIdToken(t)
        return Result.success(t)
    }

    override suspend fun loginFromCache(onIdToken: (String?) -> Unit): Result<String> {
        val t = token ?: return Result.failure(IllegalStateException("Not authenticated"))
        onIdToken(t)
        return Result.success(t)
    }

    override suspend fun logout(context: Context): Result<Void?> {
        token = null
        return Result.success(null)
    }

    override fun extractIdToken(authResult: String): String = authResult
}

class AndroidConvexBridge(deploymentUrl: String) {
    private val authProvider = TokenAuthProvider()
    private val client = ConvexClientWithAuth(deploymentUrl, authProvider)
    private val json = Json { ignoreUnknownKeys = true }

    // The app Context, sourced via SkipFoundation. Used only to satisfy the
    // Convex login(context) signature (our token provider ignores it).
    private val appContext: Context
        get() = skip.foundation.ProcessInfo.processInfo.androidContext

    suspend fun login(token: String?): Boolean {
        authProvider.token = token
        if (token == null) return false
        val result = client.login(appContext)
        return result.isSuccess
    }

    suspend fun logout() {
        try {
            client.logout(appContext)
        } catch (_: Throwable) {
        }
        authProvider.token = null
    }

    suspend fun query(name: String, argsJson: String): String {
        val args = parseArgs(argsJson)
        // subscribe returns a Flow<Result<T>>; the first emission is the value.
        val result: Result<JsonElement> = client.subscribe<JsonElement>(name, args).first()
        return result.getOrThrow().toString()
    }

    suspend fun mutation(name: String, argsJson: String): String {
        val args = parseArgs(argsJson)
        val value: JsonElement = client.mutation<JsonElement>(name, args)
        return value.toString()
    }

    suspend fun action(name: String, argsJson: String): String {
        val args = parseArgs(argsJson)
        val value: JsonElement = client.action<JsonElement>(name, args)
        return value.toString()
    }

    // --- JSON <-> Convex arg conversion -------------------------------------

    private fun parseArgs(argsJson: String): Map<String, Any?> {
        val obj = json.parseToJsonElement(argsJson).jsonObject
        return obj.mapValues { (_, element) -> anyFromJson(element) }
    }

    private fun anyFromJson(element: JsonElement): Any? = when (element) {
        is JsonNull -> null
        is JsonPrimitive ->
            if (element.isString) element.content
            else element.booleanOrNull ?: element.doubleOrNull ?: element.content
        is JsonArray -> element.jsonArray.map { anyFromJson(it) }
        is JsonObject -> element.jsonObject.mapValues { (_, v) -> anyFromJson(v) }
    }
}
