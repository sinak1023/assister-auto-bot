package net.ostadkachal.hermes.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.ostadkachal.hermes.model.AppConfig
import net.ostadkachal.hermes.model.ModelRef

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ModelPickerSheet(
    config: AppConfig,
    current: ModelRef?,
    onPick: (ModelRef) -> Unit,
    onDismiss: () -> Unit,
    onOpenSettings: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(Modifier.padding(horizontal = 20.dp).padding(bottom = 24.dp)) {
            Text("Choose a model", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Spacer(Modifier.padding(top = 4.dp))

            val all = config.allModels()
            if (all.isEmpty()) {
                Text(
                    "No models yet. Add an API key in Settings and tap \"Detect models\".",
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    modifier = Modifier.padding(vertical = 12.dp)
                )
                TextButton(onClick = onOpenSettings) { Text("Open Settings") }
            } else {
                LazyColumn(Modifier.heightIn(max = 460.dp)) {
                    // group headers by profile
                    var lastProfile: String? = null
                    itemsIndexed(all) { _, (profile, modelId) ->
                        if (profile.id != lastProfile) {
                            lastProfile = profile.id
                            Text(
                                profile.name,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold,
                                fontSize = 12.sp,
                                modifier = Modifier.padding(top = 12.dp, bottom = 4.dp)
                            )
                        }
                        val selected = current?.profileId == profile.id && current.modelId == modelId
                        Row(
                            Modifier
                                .fillMaxWidth()
                                .clickable { onPick(ModelRef(profile.id, modelId)) }
                                .padding(vertical = 10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(modelId, fontSize = 15.sp, modifier = Modifier.weight(1f))
                            if (selected) Icon(
                                Icons.Filled.Check, "selected",
                                tint = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
        }
    }
}
