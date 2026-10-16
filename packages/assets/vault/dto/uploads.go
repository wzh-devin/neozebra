package dto

import (
	"time"

	"github.com/neozebra/assets/vault/model"
)

type PrepareUpload struct {
	Name     string   `json:"name"`
	ParentID string   `json:"parentId"`
	Size     string   `json:"size"`
	PartSize string   `json:"partSize"`
	Hashes   []string `json:"hashes"`
	Mime     string   `json:"mime"`
	Key      string   `json:"idempotencyKey"`
}

type UpdateUpload struct {
	Action      string `json:"action"`
	Fingerprint string `json:"fingerprint"`
}
type UploadQuery struct{ Status, Sort, Search, Cursor string }
type UploadPage struct {
	Uploads    []model.Upload `json:"uploads"`
	NextCursor string         `json:"nextCursor"`
}
type UploadDetail struct {
	Upload model.Upload `json:"upload"`
	Parts  []model.Part `json:"parts"`
}
type SignedPart struct {
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers"`
	ExpiresAt time.Time         `json:"expiresAt"`
}
