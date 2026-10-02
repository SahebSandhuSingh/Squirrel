package com.runapp.core.filter

import com.runapp.core.GpsPoint

sealed interface FilterResult {
    data class Accepted(val point: GpsPoint) : FilterResult
    data class Rejected(val point: GpsPoint, val reason: RejectionReason) : FilterResult
}
