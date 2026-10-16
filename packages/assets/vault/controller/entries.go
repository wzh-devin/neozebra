package controller

import (
	"net/http"

	"github.com/neozebra/assets/vault/dto"
)

func (a *Controller) listEntries(w http.ResponseWriter, r *http.Request) error {
	input, err := dto.ParseEntryQuery(r.URL.Query())
	if err != nil {
		return err
	}
	value, err := a.Service.ListEntries(r.Context(), input)
	if err != nil {
		return err
	}
	respond(w, 200, value)
	return nil
}

func (a *Controller) createFolder(w http.ResponseWriter, r *http.Request) error {
	var input dto.CreateFolder
	if err := DecodeJSON(w, r, &input); err != nil {
		return err
	}
	value, err := a.Service.CreateFolder(r.Context(), input)
	if err != nil {
		return err
	}
	respond(w, 201, value)
	return nil
}

func (a *Controller) editEntry(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	var input dto.EditEntry
	if err := DecodeJSON(w, r, &input); err != nil {
		return err
	}
	value, err := a.Service.EditEntry(r.Context(), id, input)
	if err != nil {
		return err
	}
	respond(w, 200, value)
	return nil
}

func (a *Controller) restoreEntry(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	var input dto.RestoreEntry
	if err := DecodeJSON(w, r, &input); err != nil {
		return err
	}
	value, err := a.Service.RestoreEntry(r.Context(), id, input)
	if err != nil {
		return err
	}
	respond(w, 200, value)
	return nil
}

func (a *Controller) trashEntry(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	if err := a.Service.TrashEntry(r.Context(), id); err != nil {
		return err
	}
	w.WriteHeader(204)
	return nil
}

func (a *Controller) purgeEntry(w http.ResponseWriter, r *http.Request) error {
	id, err := dto.ParseID(r.PathValue("id"))
	if err != nil {
		return err
	}
	if err := a.Service.PurgeEntry(r.Context(), id); err != nil {
		return err
	}
	respond(w, 202, map[string]string{"state": "purging"})
	return nil
}

func (a *Controller) emptyTrash(w http.ResponseWriter, r *http.Request) error {
	var input dto.EmptyTrash
	if err := DecodeJSON(w, r, &input); err != nil {
		return err
	}
	value, err := a.Service.EmptyTrash(r.Context(), input)
	if err != nil {
		return err
	}
	respond(w, 202, map[string]any{"state": "purging", "queuedCount": value})
	return nil
}
