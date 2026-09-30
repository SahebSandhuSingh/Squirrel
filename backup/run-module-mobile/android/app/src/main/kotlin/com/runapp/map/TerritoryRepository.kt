package com.runapp.map

import com.runapp.sync.ApiClient
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonPrimitive

@Serializable
data class TerritoryMineResponse(
    val territories: List<TerritoryEntry>,
    val truncated: Boolean = false
)

@Serializable
data class TerritoryEntry(
    val id: String,
    val area_m2: Double,
    val claimed_at: String,
    val expires_at: String? = null,
    val state: String,
    val geometry: JsonElement
)

data class BoundingBox(val minLng: Double, val minLat: Double, val maxLng: Double, val maxLat: Double)

class TerritoryRepository(private val apiClient: ApiClient) {
    private val json = Json { ignoreUnknownKeys = true }

    fun fetchMyTerritories(): TerritoryMineResponse {
        val responseString = apiClient.getTerritoriesMine() ?: return TerritoryMineResponse(emptyList())
        return json.decodeFromString(responseString)
    }

    fun computeBoundingBox(territories: List<TerritoryEntry>): BoundingBox? {
        if (territories.isEmpty()) return null

        var minLng = Double.MAX_VALUE
        var minLat = Double.MAX_VALUE
        var maxLng = -Double.MAX_VALUE
        var maxLat = -Double.MAX_VALUE
        var hasPoints = false

        for (territory in territories) {
            // geometry is a GeoJSON Polygon or MultiPolygon
            // We just need to recursively find all numbers in pairs.
            fun extractCoords(element: JsonElement) {
                if (element is JsonArray) {
                    // Check if it's a coordinate pair [lng, lat]
                    if (element.size == 2 && element[0].jsonPrimitive.isString.not() && element[1].jsonPrimitive.isString.not()) {
                        val lng = element[0].jsonPrimitive.content.toDoubleOrNull()
                        val lat = element[1].jsonPrimitive.content.toDoubleOrNull()
                        if (lng != null && lat != null) {
                            if (lng < minLng) minLng = lng
                            if (lng > maxLng) maxLng = lng
                            if (lat < minLat) minLat = lat
                            if (lat > maxLat) maxLat = lat
                            hasPoints = true
                        }
                    } else {
                        for (child in element) {
                            extractCoords(child)
                        }
                    }
                }
            }

            try {
                val geom = territory.geometry
                val coordinates = geom.let { 
                    if (it is kotlinx.serialization.json.JsonObject) it["coordinates"] else null 
                }
                if (coordinates != null) {
                    extractCoords(coordinates)
                }
            } catch (e: Exception) {
                // Ignore malformed geometry
            }
        }

        if (!hasPoints) return null
        return BoundingBox(minLng, minLat, maxLng, maxLat)
    }
}