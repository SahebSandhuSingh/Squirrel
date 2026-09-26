package com.runapp.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.Button
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp

@Composable
fun RecoveryScreen(
    runLocalId: Long,
    onResume: () -> Unit,
    onFinish: () -> Unit
) {
    Column(
        modifier = Modifier.fillMaxSize().padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("Run In Progress Found")
        Spacer(modifier = Modifier.height(16.dp))
        Button(onClick = onResume) {
            Text("RESUME")
        }
        Spacer(modifier = Modifier.height(8.dp))
        Button(onClick = onFinish) {
            Text("FINISH")
        }
    }
}