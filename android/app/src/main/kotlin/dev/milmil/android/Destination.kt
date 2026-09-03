package dev.milmil.android

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.DateRange
import androidx.compose.material.icons.outlined.Home
import androidx.compose.ui.graphics.vector.ImageVector

/**
 * Bottom-nav destinations. Library, downloads and notifications stay on web
 * and macOS — a phone screen does not earn them, and they are v1 non-goals.
 *
 * M3 swaps the icon between outlined and filled with selection, which is half
 * of what makes a navigation bar read as Android.
 */
public enum class Destination(
    public val label: String,
    public val selected: ImageVector,
    public val unselected: ImageVector,
) {
    Home("首頁", Icons.Filled.Home, Icons.Outlined.Home),
    Schedule("時間表", Icons.Filled.DateRange, Icons.Outlined.DateRange),
    Search("搜尋", Icons.Filled.Search, Icons.Filled.Search),
    Collection("收藏", BookmarkFilled, BookmarkOutlined),
}
