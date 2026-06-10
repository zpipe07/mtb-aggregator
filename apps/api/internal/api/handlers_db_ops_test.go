package api

import "testing"

func TestAdminDBOpsAllowed(t *testing.T) {
	t.Setenv("ALLOW_ADMIN_DB_OPS", "")
	t.Setenv("APP_ENV", "")
	t.Setenv("RENDER", "")
	if !adminDBOpsAllowed() {
		t.Fatal("expected allowed in local dev")
	}

	t.Setenv("APP_ENV", "production")
	if adminDBOpsAllowed() {
		t.Fatal("expected disabled in production")
	}

	t.Setenv("ALLOW_ADMIN_DB_OPS", "1")
	if !adminDBOpsAllowed() {
		t.Fatal("expected allowed when ALLOW_ADMIN_DB_OPS=1")
	}
}
