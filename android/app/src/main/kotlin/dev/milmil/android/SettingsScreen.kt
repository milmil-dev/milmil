package dev.milmil.android

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Slider
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import dev.milmil.android.player.DanmakuSettings

/**
 * 設定. Everything a phone can honour: who is signed in, where it points, the
 * danmaku controls the web keeps under 播放, and the way out.
 *
 * Preferences share the web's JSON keys, so a font size set here reads the same
 * on the desktop — that is the point of them being one set rather than three.
 */
@Composable
public fun SettingsScreen(
    username: String,
    serverName: String,
    serverUrl: String,
    version: String,
    avatarUrl: String?,
    danmaku: DanmakuSettings,
    onDanmaku: (DanmakuSettings) -> Unit,
    onUnpair: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
            modifier = Modifier.fillMaxWidth().padding(16.dp),
        ) {
            if (avatarUrl.isNullOrBlank()) {
                Box(
                    Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primaryContainer),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        username.take(1).uppercase(),
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onPrimaryContainer,
                    )
                }
            } else {
                AsyncImage(
                    model = avatarUrl,
                    contentDescription = null,
                    contentScale = ContentScale.Crop,
                    modifier = Modifier.size(56.dp).clip(CircleShape),
                )
            }
            Column {
                Text(username, style = MaterialTheme.typography.titleLarge, fontWeight = FontWeight.SemiBold)
                Text(
                    "$serverName · $serverUrl",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                Text(
                    // A release reports "0.1.20"; a dev build reports "dev",
                    // and "vdev" is not a version anyone recognises.
                    if (version.firstOrNull()?.isDigit() == true) "伺服器 v$version" else "伺服器 $version",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
        }

        SectionLabel("彈幕")
        SwitchRow("顯示彈幕", danmaku.enabled) { onDanmaku(danmaku.copy(enabled = it)) }
        SliderRow(
            label = "字型大小",
            value = danmaku.fontSize,
            range = 12f..36f,
            display = "${danmaku.fontSize.toInt()}",
        ) { onDanmaku(danmaku.copy(fontSize = it)) }
        SliderRow(
            label = "透明度",
            value = danmaku.opacity,
            range = 0.2f..1f,
            display = "${(danmaku.opacity * 100).toInt()}%",
        ) { onDanmaku(danmaku.copy(opacity = it)) }
        SliderRow(
            label = "速度",
            value = danmaku.speed,
            range = 60f..320f,
            display = "${danmaku.speed.toInt()} px/s",
        ) { onDanmaku(danmaku.copy(speed = it)) }
        SliderRow(
            label = "顯示範圍",
            value = danmaku.area,
            range = 0.25f..1f,
            display = "${(danmaku.area * 100).toInt()}%",
        ) { onDanmaku(danmaku.copy(area = it)) }

        SectionLabel("裝置")
        OutlinedButton(
            onClick = onUnpair,
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
        ) { Text("解除配對") }
        Text(
            "解除配對會刪除呢部機上面嘅權杖。伺服器嗰邊嘅權杖要喺 Web 版設定入面撤銷。",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 4.dp),
        )
        Box(Modifier.padding(bottom = 32.dp))
    }
}

@Composable
private fun SectionLabel(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = Modifier.padding(start = 16.dp, end = 16.dp, top = 20.dp, bottom = 4.dp),
    )
}

@Composable
private fun SwitchRow(label: String, checked: Boolean, onChange: (Boolean) -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onChange(!checked) }
            .padding(horizontal = 16.dp, vertical = 10.dp),
    ) {
        Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
        Switch(checked = checked, onCheckedChange = onChange)
    }
}

@Composable
private fun SliderRow(
    label: String,
    value: Float,
    range: ClosedFloatingPointRange<Float>,
    display: String,
    onChange: (Float) -> Unit,
) {
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp)) {
        Row {
            Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            Text(
                display,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Slider(value = value, onValueChange = onChange, valueRange = range)
    }
}
