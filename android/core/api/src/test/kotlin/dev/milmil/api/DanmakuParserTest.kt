package dev.milmil.api

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The `p` string is the one danmaku format all three clients parse, and every
 * case here is one the Swift parser already handles — a comment one client
 * shows and another drops reads as a bug in whichever you are holding.
 */
class DanmakuParserTest {
    @Test
    fun `parses time mode and colour out of a p string`() {
        val comment = DanmakuParser.comment(
            DandanPlayComment(cid = 42, p = "12.5,1,16711680,0", m = " 好耐冇見 "),
        )

        requireNotNull(comment)
        assertEquals(12.5, comment.time)
        assertEquals(DanmakuMode.Scroll, comment.mode)
        assertEquals(0xFF0000, comment.color)
        assertEquals("好耐冇見", comment.text)
        assertEquals("ddp:42", comment.id)
    }

    @Test
    fun `garbage degrades the way the web worker degrades it`() {
        val comment = DanmakuParser.comment(DandanPlayComment(cid = 1, p = "oops", m = "x"))

        requireNotNull(comment)
        assertEquals(0.0, comment.time)
        assertEquals(DanmakuMode.Scroll, comment.mode)
        assertEquals(0xFFFFFF, comment.color)
    }

    @Test
    fun `an empty comment is dropped rather than drawn blank`() {
        assertNull(DanmakuParser.comment(DandanPlayComment(cid = 1, p = "1,1,0,0", m = "   ")))
    }

    @Test
    fun `dandanplay modes map the way the other clients map them`() {
        assertEquals(DanmakuMode.Bottom, DanmakuParser.dandanPlayMode("4"))
        assertEquals(DanmakuMode.Top, DanmakuParser.dandanPlayMode("5"))
        // 6 is reverse scroll, which every client draws as an ordinary scroll.
        assertEquals(DanmakuMode.Scroll, DanmakuParser.dandanPlayMode("6"))
        assertEquals(DanmakuMode.Scroll, DanmakuParser.dandanPlayMode(""))
    }

    @Test
    fun `colours accept every spelling the imports use`() {
        assertEquals(0xFF0000, DanmakuParser.colorFromHex("#FF0000"))
        assertEquals(0xFF0000, DanmakuParser.colorFromHex("ff0000"))
        assertEquals(0xFFFFFF, DanmakuParser.colorFromHex("#fff"))
        assertEquals(0xFFFFFF, DanmakuParser.colorFromHex("nonsense"))
    }

    @Test
    fun `ids without a cid hash the same as they do in Swift`() {
        // FNV-1a base 36, matching MilmilDanmaku's stableHash: the same comment
        // must carry the same id on every client and every launch.
        assertEquals("2fjdn89knn4qq", DanmakuParser.stableHash("12.5,1,16777215,0|hello"))
        assertEquals("16b5gb90k2fa", DanmakuParser.stableHash("0|rtl|測試"))
    }

    @Test
    fun `imported comments keep their source and web mode names`() {
        val comments = DanmakuParser.comments(
            ImportedDanmaku(
                source = "bilibili",
                comments = listOf(
                    ExternalComment(text = "頂", time = 3.0, mode = "top", color = "#00FF00"),
                    ExternalComment(text = "", time = 4.0, mode = "bottom", color = "#FFF"),
                ),
            ),
        )

        assertEquals(1, comments.size)
        assertEquals(DanmakuMode.Top, comments[0].mode)
        assertEquals(0x00FF00, comments[0].color)
        assertEquals("bilibili", comments[0].source)
        assertTrue(comments[0].id.startsWith("bilibili:"))
    }
}
