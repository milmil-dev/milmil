package renamer

import (
	"strings"
	"testing"
)

func TestCompileRejectsEmpty(t *testing.T) {
	if _, err := Compile(""); err == nil {
		t.Fatal("expected error for empty template")
	}
	if _, err := Compile("   \t\n "); err == nil {
		t.Fatal("expected error for whitespace-only template")
	}
}

func TestCompileRejectsInvalidSyntax(t *testing.T) {
	if _, err := Compile("{{ .Title"); err == nil {
		t.Fatal("expected parse error for unclosed action")
	}
}

func TestExecuteAllFields(t *testing.T) {
	c, err := Compile("{{.Title}}/S{{pad .Season 2}}E{{pad .EpisodeNumber 2}} - {{.EpisodeTitle}}.{{.Ext}}")
	if err != nil {
		t.Fatal(err)
	}
	out, err := c.Execute(TemplateContext{
		Title:         "Frieren",
		Season:        1,
		EpisodeNumber: 3,
		EpisodeTitle:  "Killing Magic",
		Ext:           "mkv",
	})
	if err != nil {
		t.Fatal(err)
	}
	want := "Frieren/S01E03 - Killing Magic.mkv"
	if out != want {
		t.Errorf("got %q, want %q", out, want)
	}
}

func TestFuncmapSanitize(t *testing.T) {
	c, err := Compile(`{{sanitize .Title}}`)
	if err != nil {
		t.Fatal(err)
	}
	out, err := c.Execute(TemplateContext{Title: `Re:Zero/Season*2?`})
	if err != nil {
		t.Fatal(err)
	}
	if strings.ContainsAny(out, `:/*?`) {
		t.Errorf("sanitize left illegal chars: %q", out)
	}
}

func TestFuncmapPadFloat(t *testing.T) {
	c, err := Compile("{{pad .EpisodeNumber 2}}")
	if err != nil {
		t.Fatal(err)
	}
	out, err := c.Execute(TemplateContext{EpisodeNumber: 5})
	if err != nil {
		t.Fatal(err)
	}
	if out != "05" {
		t.Errorf("int-valued float: got %q, want 05", out)
	}
	out, err = c.Execute(TemplateContext{EpisodeNumber: 5.5})
	if err != nil {
		t.Fatal(err)
	}
	if out != "05.5" {
		t.Errorf("fractional: got %q, want 05.5", out)
	}
}

func TestFuncmapSlugify(t *testing.T) {
	c, err := Compile(`{{slugify .Title}}`)
	if err != nil {
		t.Fatal(err)
	}
	out, err := c.Execute(TemplateContext{Title: "Sousou no Frieren"})
	if err != nil {
		t.Fatal(err)
	}
	if out != "sousou-no-frieren" {
		t.Errorf("got %q, want sousou-no-frieren", out)
	}
}

func TestExecuteIfGuard(t *testing.T) {
	c, err := Compile(`{{.Title}}{{if .Year}} ({{.Year}}){{end}}`)
	if err != nil {
		t.Fatal(err)
	}
	out, err := c.Execute(TemplateContext{Title: "Frieren", Year: 2023})
	if err != nil {
		t.Fatal(err)
	}
	if out != "Frieren (2023)" {
		t.Errorf("with year: got %q", out)
	}
	out, err = c.Execute(TemplateContext{Title: "Frieren"})
	if err != nil {
		t.Fatal(err)
	}
	if out != "Frieren" {
		t.Errorf("without year: got %q", out)
	}
}
