package model

import (
	"time"
)

type Record struct {
	ID        int64     `gorm:"primaryKey;autoIncrement" json:"id,string"`
	CreatedAt time.Time `gorm:"type:timestamptz" json:"createdAt"`
	UpdatedAt time.Time `gorm:"type:timestamptz" json:"updatedAt"`
}

type Library struct {
	Record
	Revision      int64
	TrashRevision int64
}

type Entry struct {
	Record
	ParentID  int64      `gorm:"index:entry_listing,priority:1" json:"parentId,string"`
	Name      string     `gorm:"index:entry_listing,priority:4" json:"name"`
	Kind      string     `gorm:"index:entry_listing,priority:3" json:"kind"`
	State     string     `gorm:"index:entry_listing,priority:2" json:"state"`
	Size      int64      `json:"size,string"`
	Mime      string     `json:"mime"`
	ObjectKey string     `json:"-"`
	Version   string     `json:"-"`
	Revision  int64      `json:"revision,string"`
	DeletedAt *time.Time `gorm:"type:timestamptz" json:"deletedAt,omitempty"`
}

type Upload struct {
	Record
	EntryID        int64     `gorm:"index" json:"entryId,string"`
	ParentID       int64     `json:"parentId,string"`
	Name           string    `json:"name"`
	Size           int64     `json:"size,string"`
	PartSize       int64     `json:"partSize,string"`
	PartCount      int       `json:"partCount"`
	Fingerprint    string    `json:"fingerprint"`
	IdempotencyKey string    `gorm:"index" json:"idempotencyKey"`
	ObjectKey      string    `json:"-"`
	MultipartID    string    `json:"-"`
	State          string    `gorm:"index" json:"state"`
	Error          string    `json:"error,omitempty"`
	ExpiresAt      time.Time `gorm:"type:timestamptz" json:"expiresAt"`
}

type Part struct {
	Record
	UploadID int64  `gorm:"index:part_lookup,priority:1" json:"-"`
	Number   int    `gorm:"index:part_lookup,priority:2" json:"number"`
	SHA256   string `json:"sha256"`
	Size     int64  `json:"size,string"`
	ETag     string `gorm:"column:etag" json:"etag,omitempty"`
}

type Job struct {
	Record
	Kind       string
	TargetID   int64     `gorm:"index"`
	State      string    `gorm:"index:job_claim,priority:1"`
	DueAt      time.Time `gorm:"type:timestamptz;index:job_claim,priority:2"`
	LeaseUntil time.Time `gorm:"type:timestamptz"`
	Owner      string
	Attempts   int
}

type Preview struct {
	Record
	EntryID     int64  `gorm:"index:preview_lookup,priority:1"`
	Version     string `gorm:"index:preview_lookup,priority:2"`
	Extension   string
	Engine      string
	CacheKey    string
	SourceToken string `json:"-"`
	ObjectKey   string
	State       string
	Error       string
	Refresh     bool
}
