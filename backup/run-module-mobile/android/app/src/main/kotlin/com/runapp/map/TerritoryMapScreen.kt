package com.runapp.map

import android.graphics.Color
import android.os.Bundle
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.runapp.BuildConfig
import com.runapp.sync.ApiClient
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.module.http.HttpRequestUtil
import org.maplibre.android.style.expressions.Expression
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory
import org.maplibre.android.style.sources.VectorSource
import okhttp3.OkHttpClient

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TerritoryMapScreen(apiClient: ApiClient) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val token = BuildConfig.DEV_JWT
    val myUserId = JwtUtil.decodeSub(token) ?: ""

    var isLoading by remember { mutableStateOf(true) }
    var bbox by remember { mutableStateOf<BoundingBox?>(null) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val repository = remember { TerritoryRepository(apiClient) }

    LaunchedEffect(Unit) {
        try {
            val response = withContext(Dispatchers.IO) { repository.fetchMyTerritories() }
            bbox = repository.computeBoundingBox(response.territories)
            isLoading = false
        } catch (e: Exception) {
            errorMessage = e.message
            isLoading = false
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(title = { Text("My Territory") })
        }
    ) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
            if (isLoading) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
            } else if (errorMessage != null) {
                Text(text = "Error: $errorMessage", modifier = Modifier.align(Alignment.Center))
            } else if (bbox == null) {
                Text(text = "You haven't claimed any territory yet.", modifier = Modifier.align(Alignment.Center))
            } else {
                MapLibreView(bbox!!, myUserId, token)
            }
        }
    }
}

@Composable
fun MapLibreView(bbox: BoundingBox, myUserId: String, token: String) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current

    val mapView = remember {
        MapLibre.getInstance(context)
        val client = OkHttpClient.Builder().addInterceptor(AuthTileInterceptor(token)).build()
        HttpRequestUtil.setOkHttpClient(client)

        MapView(context).apply {
            getMapAsync { map ->
                map.setStyle(Style.Builder().fromJson(
                    // Minimal style with background
                    """{ "version": 8, "sources": {}, "layers": [{"id": "background", "type": "background", "paint": {"background-color": "#f8f4f0"}}]} """
                )) { style ->
                    val tileSet = org.maplibre.android.style.sources.TileSet(
                        "2.2.0",
                        com.runapp.sync.ApiClient.TERRITORY_TILE_URL_TEMPLATE
                    )
                    val vectorSource = VectorSource("territories", tileSet)
                    style.addSource(vectorSource)

                    val fillLayer = FillLayer("territories-fill", "territories")
                    fillLayer.sourceLayer = "territories"
                    fillLayer.setProperties(
                        PropertyFactory.fillColor(
                            Expression.match(
                                Expression.get("owner_id"),
                                Expression.literal(myUserId),
                                Expression.literal("#4CAF50"),
                                Expression.literal("#F44336")
                            )
                        ),
                        PropertyFactory.fillOpacity(0.5f)
                    )
                    style.addLayer(fillLayer)

                    val lineLayer = LineLayer("territories-line", "territories")
                    lineLayer.sourceLayer = "territories"
                    lineLayer.setProperties(
                        PropertyFactory.lineColor(Color.BLACK),
                        PropertyFactory.lineWidth(1f)
                    )
                    style.addLayer(lineLayer)
                }

                val bounds = LatLngBounds.Builder()
                    .include(LatLng(bbox.minLat, bbox.minLng))
                    .include(LatLng(bbox.maxLat, bbox.maxLng))
                    .build()
                map.moveCamera(CameraUpdateFactory.newLatLngBounds(bounds, 50))
            }
        }
    }

    DisposableEffect(lifecycleOwner) {
        val observer = LifecycleEventObserver { _, event ->
            when (event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                Lifecycle.Event.ON_DESTROY -> mapView.onDestroy()
                else -> {}
            }
        }
        lifecycleOwner.lifecycle.addObserver(observer)
        onDispose {
            lifecycleOwner.lifecycle.removeObserver(observer)
            mapView.onDestroy()
        }
    }

    AndroidView(
        factory = { mapView },
        modifier = Modifier.fillMaxSize()
    )
}