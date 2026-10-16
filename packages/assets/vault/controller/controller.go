package controller

import (
	"context"
	"net/http"
	"time"

	"github.com/neozebra/assets/vault/service"
)

// Controller adapts HTTP requests to vault operations and streams content responses.
type Controller struct{ *service.Service }

// New composes the HTTP boundary with the existing vault service.
func New(vault *service.Service) *Controller { return &Controller{Service: vault} }

func (a *Controller) health(w http.ResponseWriter, r *http.Request) error {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := a.Service.Health(ctx); err != nil {
		return err
	}
	respond(w, 200, map[string]any{"status": "ok", "vaultConfigured": a.Objects != nil})
	return nil
}
