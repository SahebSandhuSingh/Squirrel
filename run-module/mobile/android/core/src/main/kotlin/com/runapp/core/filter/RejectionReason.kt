package com.runapp.core.filter

enum class RejectionReason {
    INVALID_COORDINATES,
    MOCK_PROVIDER,
    INVALID_ACCURACY,
    LOW_ACCURACY,
    FUTURE_TIMESTAMP,
    STALE,
    OUT_OF_ORDER,
    IMPLIED_SPEED
}
