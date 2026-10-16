package controller

import (
	"crypto/rand"
	"net/http"
	"strings"

	"github.com/neozebra/assets/vault/dto"
)

// DevelopmentNotConfiguredHandler keeps the workspace usable until vault is configured.
func DevelopmentNotConfiguredHandler() http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		if !strings.HasPrefix(r.URL.Path, dto.Prefix+"/") {
			respond(w, 404, map[string]string{"message": "Not found"})
			return
		}
		requestID := rand.Text()[:16]
		w.Header().Set("X-Request-ID", requestID)
		respond(w, 503, map[string]any{"error": map[string]any{
			"code": "SERVICE_NOT_CONFIGURED", "message": "文件库尚未配置", "retryable": false, "requestId": requestID,
		}})
	})
}
