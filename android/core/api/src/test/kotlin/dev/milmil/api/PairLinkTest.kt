package dev.milmil.api

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull

/**
 * One QR code has to work on iOS, Android and macOS. These cases mirror what
 * `PairRequest.swift` accepts and rejects.
 */
class PairLinkTest {
    @Test
    fun `parses a link the web app produces`() {
        val link = PairLink.parse(
            "milmil://pair?url=http%3A%2F%2F192.168.1.10%3A8080&token=mlml_abc123&name=milmil",
        )
        assertEquals(PairLink("milmil", "http://192.168.1.10:8080", "mlml_abc123"), link)
    }

    @Test
    fun `strips a pasted api path, like ServerProfile normalize`() {
        val link = PairLink.parse("milmil://pair?url=http%3A%2F%2Fhost%3A8080%2Fapi%2Fv1&token=mlml_x")
        assertEquals("http://host:8080", link?.url)
    }

    @Test
    fun `keeps a reverse-proxy prefix`() {
        val link = PairLink.parse("milmil://pair?url=https%3A%2F%2Fexample.com%2Fmilmil%2F&token=mlml_x")
        assertEquals("https://example.com/milmil", link?.url)
    }

    @Test
    fun `falls back to the host when the link carries no name`() {
        val link = PairLink.parse("milmil://pair?url=https%3A%2F%2Fmedia.example.com&token=mlml_x")
        assertEquals("media.example.com", link?.name)
    }

    @Test
    fun `a token is required — a link without one pairs with nothing`() {
        assertNull(PairLink.parse("milmil://pair?url=http%3A%2F%2Fhost%3A8080"))
        assertNull(PairLink.parse("milmil://pair?url=http%3A%2F%2Fhost%3A8080&token="))
    }

    @Test
    fun `a server url is required`() {
        assertNull(PairLink.parse("milmil://pair?token=mlml_x"))
    }

    @Test
    fun `other milmil links are not pairing links`() {
        assertNull(PairLink.parse("milmil://watch/530725?ep=abc"))
        assertNull(PairLink.parse("milmil://downloads"))
    }

    @Test
    fun `a foreign scheme is refused`() {
        assertNull(PairLink.parse("https://pair?url=http%3A%2F%2Fhost&token=mlml_x"))
    }

    @Test
    fun `junk does not throw`() {
        assertNull(PairLink.parse(""))
        assertNull(PairLink.parse("not a uri at all"))
        assertNull(PairLink.parse("milmil://"))
    }

    @Test
    fun `a token keeps characters URI decoding would mangle`() {
        val link = PairLink.parse("milmil://pair?url=http%3A%2F%2Fh%3A80&token=mlml_a%2Bb%2Fc%3D")
        assertEquals("mlml_a+b/c=", link?.token)
    }
}
