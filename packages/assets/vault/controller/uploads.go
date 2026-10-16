package controller

import (
	"net/http"

	"github.com/neozebra/assets/vault/dto"
)

func (a *Controller) listUploads(w http.ResponseWriter, r *http.Request) error {
	query := r.URL.Query()
	input := dto.UploadQuery{Status: query.Get("status"), Sort: query.Get("sort"), Search: query.Get("search"), Cursor: query.Get("cursor")}
	value, err := a.Service.ListUploads(r.Context(), input)
	if err != nil {
		return err
	}
	respond(w, 200, value)
	return nil
}

func (a *Controller) prepareUpload(w http.ResponseWriter, r *http.Request) error {
	var input dto.PrepareUpload
	if err := DecodeJSON(w, r, &input); err != nil {
		return err
	}
	value, err := a.Service.PrepareUpload(r.Context(), input)
	if err != nil {
		return err
	}
	respond(w, 201, value)
	return nil
}

func (a *Controller) getUpload(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	value, err := a.Service.GetUpload(r.Context(), id)
	if err != nil {
		return err
	}
	respond(w, 200, value)
	return nil
}

func (a *Controller) updateUpload(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	var input dto.UpdateUpload
	if err := DecodeJSON(w, r, &input); err != nil {
		return err
	}
	value, err := a.Service.UpdateUpload(r.Context(), id, input)
	if err != nil {
		return err
	}
	respond(w, 200, value)
	return nil
}

func (a *Controller) signPart(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	value, err := a.Service.SignPart(r.Context(), id, r.PathValue("number"))
	if err != nil {
		return err
	}
	respond(w, 200, value)
	return nil
}

func (a *Controller) confirmPart(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	value, err := a.Service.ConfirmPart(r.Context(), id, r.PathValue("number"))
	if err != nil {
		return err
	}
	respond(w, 200, value)
	return nil
}

func (a *Controller) completeUpload(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	value, err := a.Service.CompleteUpload(r.Context(), id)
	if err != nil {
		return err
	}
	respond(w, 202, value)
	return nil
}

func (a *Controller) preparePreview(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	var input dto.PreparePreview
	if err := DecodeJSON(w, r, &input); err != nil {
		return err
	}
	value, err := a.Service.PreparePreview(r.Context(), id, input)
	if err != nil {
		return err
	}
	respond(w, 200, value)
	return nil
}

func (a *Controller) getPreview(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	value, err := a.Service.GetPreview(r.Context(), id)
	if err != nil {
		return err
	}
	respond(w, 200, value)
	return nil
}
