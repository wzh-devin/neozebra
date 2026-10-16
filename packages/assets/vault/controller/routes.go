package controller

import (
	"net/http"
	"strings"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/dto"
)

func (a *Controller) Handler() http.Handler {
	m := http.NewServeMux()
	m.HandleFunc("GET "+dto.Prefix+"/health", a.wrap(a.health))
	m.HandleFunc("GET "+dto.Prefix+"/entries", a.wrap(a.listEntries))
	m.HandleFunc("POST "+dto.Prefix+"/folders", a.wrap(a.createFolder))
	m.HandleFunc("PATCH "+dto.Prefix+"/entries/{id}", a.wrap(a.editEntry))
	m.HandleFunc("DELETE "+dto.Prefix+"/entries/{id}", a.wrap(a.trashEntry))
	m.HandleFunc("POST "+dto.Prefix+"/entries/{id}/restore", a.wrap(a.restoreEntry))
	m.HandleFunc("POST "+dto.Prefix+"/entries/{id}/purge", a.wrap(a.purgeEntry))
	m.HandleFunc("POST "+dto.Prefix+"/trash/empty", a.wrap(a.emptyTrash))
	m.HandleFunc("GET "+dto.Prefix+"/entries/{id}/content", a.wrap(a.content))
	m.HandleFunc("HEAD "+dto.Prefix+"/entries/{id}/content", a.wrap(a.content))
	m.HandleFunc("POST "+dto.Prefix+"/entries/{id}/preview", a.wrap(a.preparePreview))
	m.HandleFunc("GET "+dto.Prefix+"/entries/{id}/preview", a.wrap(a.getPreview))
	m.HandleFunc("GET "+dto.Prefix+"/entries/{id}/preview/content", a.wrap(a.previewContent))
	m.HandleFunc("HEAD "+dto.Prefix+"/entries/{id}/preview/content", a.wrap(a.previewContent))
	m.HandleFunc("GET "+dto.Prefix+"/preview-source/{ticket}/{name}", a.wrap(a.previewSource))
	m.HandleFunc("HEAD "+dto.Prefix+"/preview-source/{ticket}/{name}", a.wrap(a.previewSource))
	m.HandleFunc(dto.Prefix+"/viewer/{ticket}/{path...}", a.wrap(a.previewProxy))
	m.HandleFunc("GET "+dto.Prefix+"/uploads", a.wrap(a.listUploads))
	m.HandleFunc("POST "+dto.Prefix+"/uploads", a.wrap(a.prepareUpload))
	m.HandleFunc("GET "+dto.Prefix+"/uploads/{id}", a.wrap(a.getUpload))
	m.HandleFunc("PATCH "+dto.Prefix+"/uploads/{id}", a.wrap(a.updateUpload))
	m.HandleFunc("POST "+dto.Prefix+"/uploads/{id}/parts/{number}/sign", a.wrap(a.signPart))
	m.HandleFunc("POST "+dto.Prefix+"/uploads/{id}/parts/{number}/confirm", a.wrap(a.confirmPart))
	m.HandleFunc("POST "+dto.Prefix+"/uploads/{id}/complete", a.wrap(a.completeUpload))
	m.HandleFunc(dto.Prefix+"/", a.wrap(func(w http.ResponseWriter, r *http.Request) error {
		return apperror.New(404, "NOT_FOUND", "接口不存在")
	}))
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.URL.Path, dto.Prefix+"/") {
			respond(w, 404, map[string]string{"message": "Not found"})
			return
		}
		m.ServeHTTP(w, r)
	})
}
