package subtitle

import (
	"bufio"
	"fmt"
	"io"
	"regexp"
	"strings"
)

// ToVTT converts ASS/SSA or SRT subtitle content to WebVTT format.
func ToVTT(r io.Reader, format string) string {
	switch strings.ToLower(format) {
	case "ass", "ssa":
		return assToVTT(r)
	case "srt", "subrip":
		return srtToVTT(r)
	default:
		// Already VTT or unknown — pass through
		b, _ := io.ReadAll(r)
		return string(b)
	}
}

// assToVTT converts ASS/SSA to WebVTT.
func assToVTT(r io.Reader) string {
	var sb strings.Builder
	sb.WriteString("WEBVTT\n\n")

	scanner := bufio.NewScanner(r)
	inEvents := false
	formatFields := []string{}

	for scanner.Scan() {
		line := scanner.Text()

		if strings.HasPrefix(line, "[Events]") {
			inEvents = true
			continue
		}
		if strings.HasPrefix(line, "[") && inEvents {
			break // next section
		}

		if !inEvents {
			continue
		}

		if after, ok := strings.CutPrefix(line, "Format:"); ok {
			raw := after
			for f := range strings.SplitSeq(raw, ",") {
				formatFields = append(formatFields, strings.TrimSpace(f))
			}
			continue
		}

		if !strings.HasPrefix(line, "Dialogue:") {
			continue
		}

		raw := strings.TrimPrefix(line, "Dialogue:")
		raw = strings.TrimSpace(raw)

		// Split only up to len(formatFields) parts — last field (Text) may contain commas
		parts := splitN(raw, ",", len(formatFields))
		if len(parts) < len(formatFields) {
			continue
		}

		fieldMap := make(map[string]string, len(formatFields))
		for i, f := range formatFields {
			fieldMap[f] = parts[i]
		}

		start := assTimeToVTT(fieldMap["Start"])
		end := assTimeToVTT(fieldMap["End"])
		text := fieldMap["Text"]

		// Strip ASS formatting tags like {\an8}, {\pos(x,y)}, {\fad(...)}, etc.
		text = stripASSTags(text)
		// Convert \N to newline
		text = strings.ReplaceAll(text, "\\N", "\n")
		text = strings.ReplaceAll(text, "\\n", "\n")
		text = strings.TrimSpace(text)

		if text == "" {
			continue
		}

		fmt.Fprintf(&sb, "%s --> %s\n%s\n\n", start, end, text)
	}

	return sb.String()
}

// srtToVTT converts SRT to WebVTT.
func srtToVTT(r io.Reader) string {
	var sb strings.Builder
	sb.WriteString("WEBVTT\n\n")

	scanner := bufio.NewScanner(r)
	for scanner.Scan() {
		line := scanner.Text()
		// Convert SRT timestamps (00:01:23,456) to VTT (00:01:23.456)
		line = strings.ReplaceAll(line, ",", ".")
		sb.WriteString(line + "\n")
	}

	return sb.String()
}

var reASSTag = regexp.MustCompile(`\{[^}]*\}`)

func stripASSTags(text string) string {
	return reASSTag.ReplaceAllString(text, "")
}

// assTimeToVTT converts "H:MM:SS.cc" to "HH:MM:SS.ccc".
func assTimeToVTT(t string) string {
	t = strings.TrimSpace(t)
	// ASS format: H:MM:SS.cc (centiseconds)
	parts := strings.SplitN(t, ".", 2)
	timePart := parts[0]
	centi := "00"
	if len(parts) > 1 {
		centi = parts[1]
	}

	// Pad centiseconds to milliseconds
	for len(centi) < 3 {
		centi += "0"
	}

	// Ensure HH:MM:SS format
	hms := strings.SplitN(timePart, ":", 3)
	if len(hms) == 3 {
		h := hms[0]
		if len(h) == 1 {
			h = "0" + h
		}
		return fmt.Sprintf("%s:%s:%s.%s", h, hms[1], hms[2], centi)
	}

	return t
}

// splitN splits s by sep into at most n parts.
func splitN(s, sep string, n int) []string {
	if n <= 0 {
		return strings.Split(s, sep)
	}
	result := make([]string, 0, n)
	for i := 0; i < n-1; i++ {
		idx := strings.Index(s, sep)
		if idx < 0 {
			break
		}
		result = append(result, strings.TrimSpace(s[:idx]))
		s = s[idx+len(sep):]
	}
	result = append(result, strings.TrimSpace(s))
	return result
}
