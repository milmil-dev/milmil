package main

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"time"

	"github.com/milmil/api/cmd/cli/internal/output"
	"github.com/spf13/cobra"
)

// auditEntry mirrors the server's store.AuditLog JSON shape. nullable
// columns ride as either *string or {Valid bool, ...} — sqlc's
// sql.NullString marshals as the latter, so we decode both forms.
type auditEntry struct {
	ID         string `json:"id"`
	UserID     string `json:"user_id"`
	TokenID    nullString `json:"token_id"`
	AgentLabel nullString `json:"agent_label"`
	ActionType string `json:"action_type"`
	TargetType nullString `json:"target_type"`
	TargetID   nullString `json:"target_id"`
	Confidence nullFloat64 `json:"confidence"`
	ParentID   nullString  `json:"parent_id"`
	DryRun     int64       `json:"dry_run"`
	UndoneAt   nullString  `json:"undone_at"`
	CreatedAt  string      `json:"created_at"`
}

// nullString decodes either {String: "x", Valid: true} or "x" / null.
type nullString struct {
	String string
	Valid  bool
}

func (n *nullString) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		return nil
	}
	// Object payload → sql.NullString shape (sqlc default JSON marshaling).
	if len(b) > 0 && b[0] == '{' {
		var sqlShape struct {
			String string `json:"String"`
			Valid  bool   `json:"Valid"`
		}
		if err := json.Unmarshal(b, &sqlShape); err != nil {
			return err
		}
		n.String = sqlShape.String
		n.Valid = sqlShape.Valid
		return nil
	}
	// Otherwise treat as a plain JSON string.
	var s string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	n.String = s
	n.Valid = s != ""
	return nil
}

// nullFloat64 mirrors nullString for float values.
type nullFloat64 struct {
	Float64 float64
	Valid   bool
}

func (n *nullFloat64) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		return nil
	}
	if len(b) > 0 && b[0] == '{' {
		var sqlShape struct {
			Float64 float64 `json:"Float64"`
			Valid   bool    `json:"Valid"`
		}
		if err := json.Unmarshal(b, &sqlShape); err != nil {
			return err
		}
		n.Float64 = sqlShape.Float64
		n.Valid = sqlShape.Valid
		return nil
	}
	var f float64
	if err := json.Unmarshal(b, &f); err != nil {
		return err
	}
	n.Float64 = f
	n.Valid = true
	return nil
}

var auditCmd = &cobra.Command{
	Use:   "audit",
	Short: "Inspect the agent audit log",
}

var auditListCmd = &cobra.Command{
	Use:   "list",
	Short: "List audit entries, optionally filtered by action/since",
	RunE: func(cmd *cobra.Command, args []string) error {
		action, _ := cmd.Flags().GetString("action")
		since, _ := cmd.Flags().GetString("since")
		limit, _ := cmd.Flags().GetInt("limit")

		c, err := newClient()
		if err != nil {
			return err
		}
		q := url.Values{}
		if action != "" {
			q.Set("action", action)
		}
		if since != "" {
			ts, err := parseSinceFlag(since)
			if err != nil {
				return err
			}
			q.Set("since", ts)
		}
		if limit > 0 {
			q.Set("limit", strconv.Itoa(limit))
		}

		var resp struct {
			Items []auditEntry `json:"items"`
		}
		if err := c.DoJSON("GET", "/api/v1/audit", nil, q, &resp); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(resp.Items)
		}
		if len(resp.Items) == 0 {
			output.Printf("No audit entries.")
			return nil
		}
		rows := make([][]string, 0, len(resp.Items))
		for _, e := range resp.Items {
			rows = append(rows, []string{
				e.ID,
				shortTime(e.CreatedAt),
				e.ActionType,
				targetCell(e.TargetType, e.TargetID),
				confidenceCell(e.Confidence),
				labelOrDash(e.AgentLabel),
			})
		}
		output.PrintTable(os.Stdout,
			[]string{"ID", "Time", "Action", "Target", "Conf", "By"}, rows)
		return nil
	},
}

var auditShowCmd = &cobra.Command{
	Use:   "show <audit_id>",
	Short: "Show one audit entry plus its macro children",
	Args:  cobra.ExactArgs(1),
	RunE: func(cmd *cobra.Command, args []string) error {
		c, err := newClient()
		if err != nil {
			return err
		}
		var resp struct {
			Entry    auditEntry   `json:"entry"`
			Children []auditEntry `json:"children"`
		}
		if err := c.DoJSON("GET", "/api/v1/audit/"+args[0], nil, nil, &resp); err != nil {
			return err
		}
		if flagJSON {
			return output.PrintJSON(resp)
		}
		printAuditEntry(resp.Entry)
		if len(resp.Children) > 0 {
			output.Printf("")
			output.Printf("Children (%d):", len(resp.Children))
			for _, ch := range resp.Children {
				output.Printf("  %s  %s  %s", ch.ID, ch.ActionType, targetCell(ch.TargetType, ch.TargetID))
			}
		}
		return nil
	},
}

func printAuditEntry(e auditEntry) {
	output.Printf("ID:         %s", e.ID)
	output.Printf("Time:       %s", e.CreatedAt)
	output.Printf("Action:     %s", e.ActionType)
	output.Printf("Target:     %s", targetCell(e.TargetType, e.TargetID))
	output.Printf("By:         %s", labelOrDash(e.AgentLabel))
	if e.Confidence.Valid {
		output.Printf("Confidence: %.2f", e.Confidence.Float64)
	}
	if e.UndoneAt.Valid {
		output.Printf("Undone at:  %s", e.UndoneAt.String)
	}
	if e.DryRun != 0 {
		output.Printf("Dry-run:    yes")
	}
}

func shortTime(s string) string {
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t.Local().Format("2006-01-02 15:04")
	}
	return s
}

func labelOrDash(n nullString) string {
	if !n.Valid || n.String == "" {
		return "-"
	}
	return n.String
}

func targetCell(t, id nullString) string {
	switch {
	case t.Valid && id.Valid:
		return t.String + ":" + id.String
	case id.Valid:
		return id.String
	case t.Valid:
		return t.String
	}
	return "-"
}

func confidenceCell(n nullFloat64) string {
	if !n.Valid {
		return "-"
	}
	return fmt.Sprintf("%.2f", n.Float64)
}

func init() {
	auditListCmd.Flags().String("action", "", "filter by action_type (e.g. match.apply)")
	auditListCmd.Flags().String("since", "", "duration ('1h') or RFC3339 timestamp")
	auditListCmd.Flags().Int("limit", 0, "max rows (server default 50, max 200)")
	auditCmd.AddCommand(auditListCmd, auditShowCmd)
	rootCmd.AddCommand(auditCmd)
}
