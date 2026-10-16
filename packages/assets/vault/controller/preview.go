package controller

import (
	"net/http"

	"github.com/neozebra/assets/vault/apperror"
)

func (a *Controller) previewSource(w http.ResponseWriter, r *http.Request) error {
	p, entry, e := a.Service.ResolvePreviewTicket(r.Context(), "source", r.PathValue("ticket"))
	if e != nil {
		return e
	}
	if r.PathValue("name") != p.CacheKey+"."+p.Extension {
		return apperror.New(404, "NOT_FOUND", "文件不存在")
	}
	return a.serveContent(w, r, entry)
}

func (a *Controller) previewContent(w http.ResponseWriter, r *http.Request) error {
	entry, e := a.readableEntry(r)
	if e != nil {
		return e
	}
	p, object, e := a.Service.OpenPreviewContent(r.Context(), entry)
	if e != nil {
		return e
	}
	defer object.Close()
	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition", "inline; filename=preview.pdf")
	w.Header().Set("Content-Security-Policy", "sandbox")
	w.Header().Set("ETag", `"`+p.CacheKey+`"`)
	http.ServeContent(w, r, "preview.pdf", p.UpdatedAt, object)
	return nil
}
