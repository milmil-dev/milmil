package bangumi_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/milmil/api/internal/integration/bangumi"
)

func TestSearchSubjects_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v0/search/subjects" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Fatalf("unexpected method: %s", r.Method)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":[{"id":425848,"name":"Frieren","name_cn":"葬送的芙莉蓮","summary":"勇者一行人","eps":28,"rating":{"score":9.1,"total":5000}}],"total":1}`))
	}))
	defer srv.Close()

	c := bangumi.NewClientWithURL(srv.Client(), "milmil/test", srv.URL)
	subjects, err := c.SearchSubjects(context.Background(), "Frieren")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(subjects) != 1 {
		t.Fatalf("want 1 subject, got %d", len(subjects))
	}
	if subjects[0].NameCN != "葬送的芙莉蓮" {
		t.Errorf("want name_cn=葬送的芙莉蓮, got %s", subjects[0].NameCN)
	}
}

func TestGetCalendar_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/calendar" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`[{"weekday":{"en":"Mon","cn":"星期一","ja":"月曜日","id":1},"items":[{"id":1,"name":"Test","name_cn":"測試","eps":12}]}]`))
	}))
	defer srv.Close()

	c := bangumi.NewClientWithURL(srv.Client(), "milmil/test", srv.URL)
	days, err := c.GetCalendar(context.Background())
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(days) != 1 {
		t.Fatalf("want 1 day, got %d", len(days))
	}
	if days[0].Weekday.CN != "星期一" {
		t.Errorf("want weekday cn=星期一, got %s", days[0].Weekday.CN)
	}
}

func TestGetSubject_NotFound(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := bangumi.NewClientWithURL(srv.Client(), "milmil/test", srv.URL)
	_, err := c.GetSubject(context.Background(), 99999)
	if err == nil {
		t.Fatal("expected error for 404")
	}
}

func TestGetSubject_RateLimited(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	c := bangumi.NewClientWithURL(srv.Client(), "milmil/test", srv.URL)
	_, err := c.GetSubject(context.Background(), 1)
	if err == nil {
		t.Fatal("expected error for 429")
	}
}

func TestGetSubjectEpisodes_Success(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"data":[{"id":100,"sort":1,"name":"はじまり","name_cn":"開始","airdate":"2024-01-01"}],"total":1}`))
	}))
	defer srv.Close()

	c := bangumi.NewClientWithURL(srv.Client(), "milmil/test", srv.URL)
	eps, err := c.GetSubjectEpisodes(context.Background(), 1)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(eps) != 1 {
		t.Fatalf("want 1 episode, got %d", len(eps))
	}
	if eps[0].NameCN != "開始" {
		t.Errorf("want name_cn=開始, got %s", eps[0].NameCN)
	}
}
