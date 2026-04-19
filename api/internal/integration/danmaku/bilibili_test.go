package danmaku

import (
	"testing"
)

func TestParseBilibiliDanmakuXML(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?>
<i>
<d p="1.5,1,25,16777215,1609459200,0,abc123,100">Hello World</d>
<d p="10.0,5,25,255,1609459201,0,def456,101">Top comment</d>
<d p="20.5,4,25,16711680,1609459202,0,ghi789,102">Bottom comment</d>
</i>`

	comments, err := parseBilibiliXML([]byte(xml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(comments) != 3 {
		t.Fatalf("expected 3 comments, got %d", len(comments))
	}

	c := comments[0]
	if c.Text != "Hello World" {
		t.Errorf("text = %q, want %q", c.Text, "Hello World")
	}
	if c.Time != 1.5 {
		t.Errorf("time = %f, want 1.5", c.Time)
	}
	if c.Mode != "rtl" {
		t.Errorf("mode = %q, want %q", c.Mode, "rtl")
	}
	if c.Color != "#ffffff" {
		t.Errorf("color = %q, want %q", c.Color, "#ffffff")
	}

	c = comments[1]
	if c.Mode != "top" {
		t.Errorf("mode = %q, want %q", c.Mode, "top")
	}
	if c.Color != "#0000ff" {
		t.Errorf("color = %q, want %q", c.Color, "#0000ff")
	}

	c = comments[2]
	if c.Mode != "bottom" {
		t.Errorf("mode = %q, want %q", c.Mode, "bottom")
	}
	if c.Color != "#ff0000" {
		t.Errorf("color = %q, want %q", c.Color, "#ff0000")
	}
}

func TestParseBilibiliDanmakuXML_Empty(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?><i></i>`
	comments, err := parseBilibiliXML([]byte(xml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(comments) != 0 {
		t.Fatalf("expected 0 comments, got %d", len(comments))
	}
}

func TestParseBilibiliDanmakuXML_MalformedP(t *testing.T) {
	xml := `<?xml version="1.0" encoding="UTF-8"?>
<i>
<d p="bad">test</d>
<d p="5.0,1,25,16777215,0,0,abc,100">valid</d>
</i>`
	comments, err := parseBilibiliXML([]byte(xml))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(comments) != 1 {
		t.Fatalf("expected 1 comment, got %d", len(comments))
	}
	if comments[0].Text != "valid" {
		t.Errorf("text = %q, want %q", comments[0].Text, "valid")
	}
}
