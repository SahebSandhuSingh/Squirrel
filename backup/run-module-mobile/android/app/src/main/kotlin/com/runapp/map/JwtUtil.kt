package com.runapp.map

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.Base64

object JwtUtil {
    fun decodeSub(token: String): String? {
        try {
            val parts = token.split(".")
            if (parts.size != 3) return null
            val payload = String(Base64.getUrlDecoder().decode(parts[1]))
            val json = Json { ignoreUnknownKeys = true }
            val element = json.parseToJsonElement(payload)
            return element.jsonObject["sub"]?.jsonPrimitive?.content
        } catch (e: Exception) {
            return null
        }
    }
}