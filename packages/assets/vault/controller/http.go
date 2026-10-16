package controller

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"

	"gorm.io/gorm"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/dto"
)

func respond(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func DecodeJSON(w http.ResponseWriter, r *http.Request, value any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 2<<20)
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	if err := d.Decode(value); err != nil {
		return apperror.New(400, "INVALID_INPUT", "请求内容无效")
	}
	var extra any
	if d.Decode(&extra) != io.EOF {
		return apperror.New(400, "INVALID_INPUT", "请求内容无效")
	}
	return nil
}

type endpoint func(http.ResponseWriter, *http.Request) error

func (a *Controller) wrap(handler endpoint) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		requestID := rand.Text()[:16]
		w.Header().Set("X-Request-ID", requestID)
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		err := func() error {
			if r.Method != "GET" && r.Method != "HEAD" && !(r.Method == "OPTIONS" && strings.HasPrefix(r.URL.Path, dto.Prefix+"/viewer/")) && r.Header.Get("Origin") != a.Service.Config.Origin {
				return apperror.New(403, "ORIGIN_DENIED", "请求来源无效")
			}
			return handler(w, r)
		}()
		if err != nil {
			e := &apperror.APIError{}
			if !errors.As(err, &e) {
				if errors.Is(err, gorm.ErrRecordNotFound) {
					e = &apperror.APIError{Code: "NOT_FOUND", Message: "文件或任务不存在", Status: 404}
				} else {
					e = &apperror.APIError{Code: "UNAVAILABLE", Message: "服务暂时不可用，请重试", Status: 503, Retryable: true}
					slog.Error("vault request failed", "requestId", requestID, "errorType", fmt.Sprintf("%T", err))
				}
			}
			respond(w, e.Status, map[string]any{"error": map[string]any{"code": e.Code, "message": e.Message, "retryable": e.Retryable, "requestId": requestID}})
		}
	}
}
