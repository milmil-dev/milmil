package danmaku

import (
	"crypto/md5" //nolint:gosec // Bilibili's WBI scheme is defined over MD5; not used for security.
	"encoding/hex"
	"net/url"
	"strconv"
	"strings"
	"time"
)

// wbiMixinTable is the fixed permutation Bilibili's web client applies to
// img_key+sub_key to derive the signing key. Taken from the client bundle;
// documented at github.com/SocialSisterYi/bilibili-API-collect.
var wbiMixinTable = [...]int{
	46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43, 5, 49,
	33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16, 24, 55, 40,
	61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11,
	36, 20, 34, 44, 52,
}

// wbiMixinKey derives the 32-character signing key from the two key
// fragments the `nav` endpoint publishes (they rotate daily).
func wbiMixinKey(imgKey, subKey string) string {
	raw := imgKey + subKey
	if len(raw) < 64 {
		return ""
	}
	var b strings.Builder
	b.Grow(32)
	for _, i := range wbiMixinTable[:32] {
		b.WriteByte(raw[i])
	}
	return b.String()
}

// wbiSign adds `wts` and `w_rid` to params the way the web client does:
// values lose the characters !'()* , the query is key-sorted and form
// encoded, and w_rid = md5(query + mixinKey). The input is not mutated.
func wbiSign(params url.Values, mixinKey string, now time.Time) url.Values {
	signed := make(url.Values, len(params)+2)
	for k, vs := range params {
		for _, v := range vs {
			signed.Add(k, strings.Map(func(r rune) rune {
				if strings.ContainsRune("!'()*", r) {
					return -1
				}
				return r
			}, v))
		}
	}
	signed.Set("wts", strconv.FormatInt(now.Unix(), 10))
	sum := md5.Sum([]byte(signed.Encode() + mixinKey)) //nolint:gosec // see import note
	signed.Set("w_rid", hex.EncodeToString(sum[:]))
	return signed
}

// wbiKeyFromURL turns ".../wbi/7cd084941338484aae1ad9425b84077c.png" into
// the bare key.
func wbiKeyFromURL(raw string) string {
	base := raw[strings.LastIndex(raw, "/")+1:]
	if i := strings.IndexByte(base, '.'); i >= 0 {
		base = base[:i]
	}
	return base
}
