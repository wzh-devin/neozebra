package controller

import (
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/neozebra/assets/vault/dto"
	"github.com/neozebra/assets/vault/model"
)

func (a *Controller) readableEntry(r *http.Request) (model.Entry, error) {
	id, e := dto.ParseID(r.PathValue("id"))
	if e != nil {
		return model.Entry{}, e
	}
	return a.Service.ReadableEntry(r.Context(), id)
}

func (a *Controller) serveContent(w http.ResponseWriter, r *http.Request, entry model.Entry) error {
	object, e := a.Service.OpenContent(r.Context(), entry)
	if e != nil {
		return e
	}
	defer object.Close()
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(entry.Name)))
	if contentType == "" {
		contentType = "application/octet-stream"
	}
	disposition := "attachment"
	if r.URL.Query().Get("inline") == "true" && (strings.HasPrefix(contentType, "image/") && !strings.Contains(contentType, "svg") || strings.HasPrefix(contentType, "audio/") || strings.HasPrefix(contentType, "video/")) {
		disposition = "inline"
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType(disposition, map[string]string{"filename": entry.Name}))
	w.Header().Set("Content-Security-Policy", "sandbox")
	w.Header().Set("ETag", `"`+entry.Version+`"`)
	http.ServeContent(w, r, entry.Name, entry.UpdatedAt, object)
	return nil
}

func (a *Controller) content(w http.ResponseWriter, r *http.Request) error {
	entry, e := a.readableEntry(r)
	if e != nil {
		return e
	}
	return a.serveContent(w, r, entry)
}
