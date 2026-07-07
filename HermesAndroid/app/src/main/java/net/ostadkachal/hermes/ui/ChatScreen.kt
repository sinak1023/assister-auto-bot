package net.ostadkachal.hermes.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.PickVisualMediaRequest
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Menu
import androidx.compose.material.icons.filled.Psychology
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material.icons.filled.UnfoldMore
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import net.ostadkachal.hermes.model.Attachment
import net.ostadkachal.hermes.model.ChatMessage
import net.ostadkachal.hermes.model.Effort
import net.ostadkachal.hermes.model.Role

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    vm: HermesViewModel,
    state: UiState,
    onMenu: () -> Unit,
    onOpenSettings: () -> Unit
) {
    var input by remember { mutableStateOf("") }
    var showModelPicker by remember { mutableStateOf(false) }
    val listState = rememberLazyListState()
    val messages = state.current.messages
    val context = LocalContext.current

    val imagePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.PickVisualMedia()
    ) { uri -> uri?.let { readAttachment(context, it)?.let(vm::addAttachment) } }

    val filePicker = rememberLauncherForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri -> uri?.let { readAttachment(context, it)?.let(vm::addAttachment) } }

    LaunchedEffect(messages.size, messages.lastOrNull()?.text?.length, messages.lastOrNull()?.thinking?.length) {
        if (messages.isNotEmpty()) listState.animateScrollToItem(messages.size - 1)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column(Modifier.clickable { showModelPicker = true }) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Text(
                                state.config.modelLabel(state.effectiveModel),
                                fontWeight = FontWeight.Bold,
                                fontSize = 16.sp,
                                maxLines = 1
                            )
                            Icon(Icons.Filled.UnfoldMore, "change model", modifier = Modifier.size(18.dp))
                        }
                        Text(
                            if (state.config.hasUsableModel) "Hermes · tap to switch model"
                            else "demo mode · set up in Settings",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = { IconButton(onClick = onMenu) { Icon(Icons.Filled.Menu, "Menu") } },
                actions = { IconButton(onClick = vm::newChat) { Icon(Icons.Filled.Add, "New chat") } },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { pad ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(pad)
                .imePadding()
        ) {
            if (messages.isEmpty()) {
                EmptyState(
                    configured = state.config.hasUsableModel,
                    onOpenSettings = onOpenSettings,
                    onSuggest = { input = it },
                    modifier = Modifier.weight(1f)
                )
            } else {
                LazyColumn(
                    state = listState,
                    modifier = Modifier.weight(1f),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(messages, key = { it.id }) { msg -> MessageBubble(msg) }
                }
            }

            ThinkControls(
                think = state.current.think,
                effort = state.current.effort,
                onThink = vm::setThink,
                onEffort = vm::setEffort
            )

            if (state.pending.isNotEmpty()) {
                PendingRow(state.pending, onRemove = vm::removeAttachment)
            }

            InputBar(
                value = input,
                onValueChange = { input = it },
                sending = state.sending,
                onSend = { val t = input; input = ""; vm.send(t) },
                onStop = vm::stopStreaming,
                onPickImage = {
                    imagePicker.launch(
                        PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)
                    )
                },
                onPickFile = { filePicker.launch("*/*") }
            )
        }
    }

    if (showModelPicker) {
        ModelPickerSheet(
            config = state.config,
            current = state.effectiveModel,
            onPick = { ref -> vm.selectModel(ref); showModelPicker = false },
            onDismiss = { showModelPicker = false },
            onOpenSettings = { showModelPicker = false; onOpenSettings() }
        )
    }
}

@Composable
private fun ThinkControls(
    think: Boolean,
    effort: Effort,
    onThink: (Boolean) -> Unit,
    onEffort: (Effort) -> Unit
) {
    Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 1.dp) {
        Row(
            Modifier
                .fillMaxWidth()
                .padding(horizontal = 12.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Filled.Psychology, "think",
                tint = if (think) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.size(20.dp)
            )
            Spacer(Modifier.width(6.dp))
            Text("Think", fontSize = 14.sp)
            Switch(checked = think, onCheckedChange = onThink, modifier = Modifier.padding(start = 4.dp))
            Spacer(Modifier.weight(1f))
            if (think) {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    listOf(Effort.MEDIUM, Effort.HIGH, Effort.MAX).forEach { e ->
                        FilterChip(
                            selected = effort == e,
                            onClick = { onEffort(e) },
                            label = { Text(e.label, fontSize = 12.sp) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun PendingRow(pending: List<Attachment>, onRemove: (String) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 12.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        pending.forEach { a -> AttachmentChip(a) { onRemove(a.id) } }
    }
}

@Composable
private fun AttachmentChip(a: Attachment, onRemove: (() -> Unit)? = null) {
    Surface(
        color = MaterialTheme.colorScheme.surfaceVariant,
        shape = RoundedCornerShape(10.dp)
    ) {
        Row(
            Modifier.padding(horizontal = 8.dp, vertical = 6.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            if (a.kind == Attachment.Kind.IMAGE) {
                val thumb = remember(a.id) { decodeThumb(a.base64) }
                if (thumb != null) {
                    Image(
                        bitmap = thumb, contentDescription = a.name,
                        modifier = Modifier.size(28.dp).clip(RoundedCornerShape(6.dp)),
                        contentScale = ContentScale.Crop
                    )
                } else Icon(Icons.Filled.Image, null, Modifier.size(20.dp))
            } else {
                Icon(Icons.Filled.Description, null, Modifier.size(20.dp))
            }
            Spacer(Modifier.width(6.dp))
            Text(a.name.take(22), fontSize = 12.sp, maxLines = 1)
            if (onRemove != null) {
                Spacer(Modifier.width(4.dp))
                Icon(
                    Icons.Filled.Close, "remove",
                    modifier = Modifier.size(16.dp).clickable { onRemove() }
                )
            }
        }
    }
}

@Composable
private fun MessageBubble(msg: ChatMessage) {
    val isUser = msg.role == Role.USER
    val bg = when {
        msg.error -> MaterialTheme.colorScheme.errorContainer
        isUser -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.surfaceVariant
    }
    val fg = when {
        msg.error -> MaterialTheme.colorScheme.onErrorContainer
        isUser -> MaterialTheme.colorScheme.onPrimary
        else -> MaterialTheme.colorScheme.onSurface
    }
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = if (isUser) Arrangement.End else Arrangement.Start
    ) {
        Column(horizontalAlignment = if (isUser) Alignment.End else Alignment.Start) {
            if (!isUser && (msg.thinking.isNotEmpty() || (msg.streaming && msg.text.isEmpty()))) {
                ThinkingBlock(msg)
                Spacer(Modifier.height(4.dp))
            }
            Surface(
                color = bg,
                shape = RoundedCornerShape(
                    topStart = 16.dp, topEnd = 16.dp,
                    bottomStart = if (isUser) 16.dp else 4.dp,
                    bottomEnd = if (isUser) 4.dp else 16.dp
                ),
                modifier = Modifier.widthIn(max = 320.dp)
            ) {
                Column(Modifier.padding(horizontal = 14.dp, vertical = 10.dp)) {
                    if (!isUser) {
                        Text(
                            "Hermes", color = MaterialTheme.colorScheme.primary,
                            fontSize = 11.sp, fontWeight = FontWeight.SemiBold
                        )
                        Spacer(Modifier.height(2.dp))
                    }
                    if (msg.attachments.isNotEmpty()) {
                        Row(
                            Modifier.padding(bottom = 6.dp),
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) { msg.attachments.take(4).forEach { AttachmentChip(it) } }
                    }
                    val shown = if (msg.text.isEmpty() && msg.streaming) "…" else msg.text
                    if (shown.isNotEmpty()) Text(shown, color = fg, fontSize = 15.sp)
                    if (msg.streaming && msg.text.isNotEmpty()) {
                        Spacer(Modifier.height(4.dp))
                        Text("▍", color = MaterialTheme.colorScheme.primary, fontSize = 13.sp)
                    }
                }
            }
        }
    }
}

@Composable
private fun ThinkingBlock(msg: ChatMessage) {
    var expanded by remember(msg.id) { mutableStateOf(false) }
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(12.dp),
        tonalElevation = 2.dp,
        modifier = Modifier.widthIn(max = 320.dp)
    ) {
        Column(Modifier.padding(10.dp)) {
            Row(
                Modifier.fillMaxWidth().clickable { expanded = !expanded },
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(Icons.Filled.Psychology, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.secondary)
                Spacer(Modifier.width(6.dp))
                Text(
                    if (msg.streaming && msg.text.isEmpty()) "Thinking…" else "Thinking",
                    fontSize = 12.sp, fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.secondary, modifier = Modifier.weight(1f)
                )
                Icon(
                    if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ExpandMore,
                    null, Modifier.size(18.dp)
                )
            }
            if (expanded && msg.thinking.isNotEmpty()) {
                Spacer(Modifier.height(6.dp))
                Text(
                    msg.thinking, fontSize = 13.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

@Composable
private fun EmptyState(
    configured: Boolean,
    onOpenSettings: () -> Unit,
    onSuggest: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text("👋", fontSize = 40.sp)
        Spacer(Modifier.height(8.dp))
        Text("Hi, I'm Hermes", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground)
        Text(
            if (configured) "Pick a model up top, then ask me anything."
            else "Add an API key in Settings and detect models to begin.",
            fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = 6.dp)
        )
        Spacer(Modifier.height(20.dp))
        listOf(
            "Explain what you can do",
            "Write a haiku about the sea",
            "Give me a 3-step plan to learn Kotlin"
        ).forEach { s ->
            Surface(
                color = MaterialTheme.colorScheme.surfaceVariant,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)
                    .clip(RoundedCornerShape(12.dp)).clickable { onSuggest(s) }
            ) {
                Text(s, modifier = Modifier.fillMaxWidth().padding(14.dp), fontSize = 14.sp)
            }
        }
        if (!configured) {
            Spacer(Modifier.height(16.dp))
            androidx.compose.material3.TextButton(onClick = onOpenSettings) { Text("Open Settings") }
        }
    }
}

@Composable
private fun InputBar(
    value: String,
    onValueChange: (String) -> Unit,
    sending: Boolean,
    onSend: () -> Unit,
    onStop: () -> Unit,
    onPickImage: () -> Unit,
    onPickFile: () -> Unit
) {
    Surface(color = MaterialTheme.colorScheme.surface, tonalElevation = 3.dp) {
        Row(
            Modifier.fillMaxWidth().padding(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            IconButton(onClick = onPickImage) { Icon(Icons.Filled.Image, "Attach image") }
            IconButton(onClick = onPickFile) { Icon(Icons.Filled.AttachFile, "Attach file") }
            OutlinedTextField(
                value = value,
                onValueChange = onValueChange,
                modifier = Modifier.weight(1f),
                placeholder = { Text("Message Hermes…") },
                maxLines = 5,
                shape = RoundedCornerShape(24.dp)
            )
            Spacer(Modifier.width(6.dp))
            val canSend = value.isNotBlank() && !sending
            Box(
                Modifier.clip(RoundedCornerShape(24.dp)).background(
                    if (sending) MaterialTheme.colorScheme.error
                    else if (canSend) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.surfaceVariant
                )
            ) {
                if (sending) {
                    IconButton(onClick = onStop) {
                        Icon(Icons.Filled.Stop, "Stop", tint = MaterialTheme.colorScheme.onError)
                    }
                } else {
                    IconButton(onClick = onSend, enabled = canSend || value.isBlank()) {
                        Icon(
                            Icons.AutoMirrored.Filled.Send, "Send",
                            tint = if (canSend) MaterialTheme.colorScheme.onPrimary
                            else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }
        }
    }
}
