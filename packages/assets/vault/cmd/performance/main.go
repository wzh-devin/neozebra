package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"

	"github.com/neozebra/assets/vault/config"
	"github.com/neozebra/assets/vault/model"
	"github.com/neozebra/assets/vault/repository"
	"github.com/neozebra/assets/vault/service"
)

// This executable only seeds isolated synthetic performance fixtures, never user libraries.
func main() {
	c, e := config.LoadConfig()
	if e != nil {
		panic(e)
	}
	if !strings.HasPrefix(c.Schema, "vault_perf_check_") {
		panic("isolated performance schema required")
	}
	db, e := repository.OpenDB(c)
	if e != nil {
		panic("fixture DB unavailable")
	}
	if e = repository.Migrate(db, c); e != nil {
		panic("fixture migration failed")
	}
	a, e := service.New(c, db)
	if e != nil {
		panic("fixture configuration failed")
	}
	defer a.Close()
	entries := make([]model.Entry, 10000)
	for i := range entries {
		kind := "file"
		if i < 100 {
			kind = "folder"
		}
		entries[i] = model.Entry{ParentID: 0, Name: fmt.Sprintf("synthetic-%05d.txt", i), Kind: kind, State: "ready", Size: 1024, Revision: 1}
	}
	if e = db.CreateInBatches(entries, 200).Error; e != nil {
		panic("fixture seed failed")
	}
	history := make([]model.Upload, 10000)
	states := []string{"preparing", "uploading", "completing", "paused", "completed", "failed", "cancelled"}
	for i := range history {
		history[i] = model.Upload{Name: fmt.Sprintf("synthetic-history-%05d.txt", i), State: states[i%len(states)], Size: int64(i%31) * 1024, ExpiresAt: time.Now().Add(time.Hour)}
	}
	if e = db.CreateInBatches(history, 200).Error; e != nil {
		panic("fixture history failed")
	}
	if e = a.Objects.MakeBucket(context.Background(), c.Bucket, minio.MakeBucketOptions{Region: c.Region}); e != nil {
		panic("fixture bucket failed")
	}
	key := "synthetic/performance"
	multipart, e := a.Objects.NewMultipartUpload(context.Background(), c.Bucket, key, minio.PutObjectOptions{})
	if e != nil {
		panic("fixture multipart failed")
	}
	hash := sha256.Sum256(make([]byte, 8<<20))
	u := model.Upload{ParentID: 0, Name: "synthetic-upload.bin", State: "uploading", ObjectKey: key, MultipartID: multipart, Size: 8 << 20, PartSize: 8 << 20, PartCount: 1, Fingerprint: "synthetic", ExpiresAt: time.Now().Add(time.Hour)}
	if e = db.Create(&u).Error; e != nil {
		panic("fixture task failed")
	}
	if e = db.Create(&model.Part{UploadID: u.ID, Number: 1, Size: 8 << 20, SHA256: hex.EncodeToString(hash[:])}).Error; e != nil {
		panic("fixture part failed")
	}
	json.NewEncoder(os.Stdout).Encode(map[string]any{"uploadId": u.ID, "entries": len(entries)})
}
