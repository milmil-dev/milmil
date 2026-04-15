package renamer

import (
	"bytes"
	"fmt"
	"math"
	"regexp"
	"strings"
	texttemplate "text/template"
)

// Compiled is a validated, parsed rename template ready to Execute.
type Compiled struct {
	raw string
	tpl *texttemplate.Template
}

var (
	illegalFilenameChars = regexp.MustCompile(`[\x00-\x1f/\\:*?"<>|]`)
	multiSpace           = regexp.MustCompile(`\s+`)
)

func funcMap() texttemplate.FuncMap {
	return texttemplate.FuncMap{
		"pad": func(v any, width int) string {
			switch n := v.(type) {
			case int:
				return fmt.Sprintf("%0*d", width, n)
			case int64:
				return fmt.Sprintf("%0*d", width, n)
			case float64:
				if n == math.Trunc(n) {
					return fmt.Sprintf("%0*d", width, int(n))
				}
				return fmt.Sprintf("%0*.1f", width+2, n)
			case string:
				if len(n) >= width {
					return n
				}
				return strings.Repeat("0", width-len(n)) + n
			}
			return fmt.Sprintf("%v", v)
		},
		"sanitize": func(s string) string {
			s = illegalFilenameChars.ReplaceAllString(s, "")
			s = multiSpace.ReplaceAllString(s, " ")
			return strings.TrimSpace(s)
		},
		"slugify": func(s string) string {
			s = strings.ToLower(s)
			s = illegalFilenameChars.ReplaceAllString(s, "")
			s = multiSpace.ReplaceAllString(s, "-")
			return strings.Trim(s, "-")
		},
		"upper": strings.ToUpper,
		"lower": strings.ToLower,
		// Note: strings.Title is deprecated; acceptable here to avoid pulling
		// a new dep for a template helper. Users can layer their own casing.
		"title": strings.Title,
	}
}

// Compile parses raw as a text/template with the renamer funcmap and returns
// an error for empty or syntactically invalid templates.
func Compile(raw string) (*Compiled, error) {
	if strings.TrimSpace(raw) == "" {
		return nil, fmt.Errorf("empty template")
	}
	t, err := texttemplate.New("rename").Funcs(funcMap()).Parse(raw)
	if err != nil {
		return nil, err
	}
	return &Compiled{raw: raw, tpl: t}, nil
}

// Execute renders the template against ctx. The returned string is a
// template-relative path (forward slashes or separators as authored); callers
// should run ClampToLibraryRoot on it before touching the filesystem.
func (c *Compiled) Execute(ctx TemplateContext) (string, error) {
	var buf bytes.Buffer
	if err := c.tpl.Execute(&buf, ctx); err != nil {
		return "", err
	}
	return buf.String(), nil
}

// Raw returns the original template source.
func (c *Compiled) Raw() string { return c.raw }
