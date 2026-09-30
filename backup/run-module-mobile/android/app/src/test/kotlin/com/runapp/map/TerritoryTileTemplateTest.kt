package com.runapp.map

import com.runapp.sync.ApiClient
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TerritoryTileTemplateTest {

    @Test
    fun testR3_TileTemplateIsUnencoded() {
        val template = ApiClient.TERRITORY_TILE_URL_TEMPLATE
        
        // Assert it is exactly the unencoded string with {z}/{x}/{y}
        assertEquals("http://10.0.2.2:3000/v1/territories/tiles/{z}/{x}/{y}.mvt", template)
        
        // Assert it contains the literal unencoded tokens
        assertTrue("Template must contain literal '{z}'", template.contains("{z}"))
        assertTrue("Template must contain literal '{x}'", template.contains("{x}"))
        assertTrue("Template must contain literal '{y}'", template.contains("{y}"))
    }
}