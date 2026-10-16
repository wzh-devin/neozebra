package service

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"log/slog"
	"time"

	"github.com/minio/minio-go/v7"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/model"
	"github.com/neozebra/assets/vault/repository"
)

func (a *Service) RunPreviewWorker(ctx context.Context) { a.runWorker(ctx, true) }

func (a *Service) RunWorker(ctx context.Context) { a.runWorker(ctx, false) }

func (a *Service) ClaimJob(ctx context.Context, previewOnly bool) (model.Job, error) {
	var job model.Job
	err := a.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		now := time.Now().UTC()
		query := tx
		if previewOnly {
			query = query.Where("kind = ?", "preview")
		} else {
			query = query.Where("kind <> ?", "preview")
		}
		if e := query.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).Where("(state = ? AND due_at <= ?) OR (state = ? AND lease_until < ?)", "queued", now, "running", now).Order("id").First(&job).Error; e != nil {
			return e
		}
		job.State = "running"
		job.Owner = token()
		job.LeaseUntil = now.Add(time.Minute)
		job.Attempts++
		return tx.Save(&job).Error
	})
	return job, err
}

func (a *Service) cleanupUpload(ctx context.Context, job model.Job) error {
	var u model.Upload
	if e := a.DB.WithContext(ctx).First(&u, job.TargetID).Error; e != nil {
		return e
	}
	if u.State != "failed" && u.State != "cancelled" {
		return nil
	}
	list, e := a.Objects.ListMultipartUploads(ctx, a.Config.Bucket, u.ObjectKey, "", "", "", 100)
	if e != nil {
		return e
	}
	for _, item := range list.Uploads {
		if item.Key == u.ObjectKey {
			if e = a.Objects.AbortMultipartUpload(ctx, a.Config.Bucket, u.ObjectKey, item.UploadID); e != nil && !IsMissing(e) {
				return e
			}
		}
	}
	if e = a.Objects.RemoveObject(ctx, a.Config.Bucket, u.ObjectKey, minio.RemoveObjectOptions{}); e != nil {
		return e
	}
	return a.jobTransaction(ctx, job, func(tx *gorm.DB, library *model.Library) error {
		return tx.Model(&model.Entry{}).Where("id = ? AND state <> ?", u.EntryID, "ready").Update("state", "purged").Error
	})
}

func (a *Service) ExpireUploads(ctx context.Context) {
	_ = a.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var l model.Library
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).First(&l, 1).Error; e != nil {
			return e
		}
		tasks := []model.Upload{}
		if e := tx.Where("expires_at < ? AND state IN ?", time.Now().UTC(), []string{"uploading", "paused", "preparing"}).Limit(20).Find(&tasks).Error; e != nil {
			return e
		}
		for _, u := range tasks {
			if e := a.failInTransaction(tx, &u, "上传任务已过期"); e != nil {
				return e
			}
		}
		return nil
	})
}

func (a *Service) failInTransaction(tx *gorm.DB, u *model.Upload, message string) error {
	u.State = "failed"
	u.Error = message
	if e := tx.Save(u).Error; e != nil {
		return e
	}
	if e := tx.Model(&model.Entry{}).Where("id = ? AND state = ?", u.EntryID, "pending").Update("state", "purging").Error; e != nil {
		return e
	}
	return tx.Create(&model.Job{Kind: "cleanup", TargetID: u.ID, State: "queued", DueAt: time.Now().UTC()}).Error
}

func (a *Service) failUpload(ctx context.Context, job model.Job, u model.Upload, message string) error {
	return a.jobTransaction(ctx, job, func(tx *gorm.DB, library *model.Library) error { return a.failInTransaction(tx, &u, message) })
}

func (a *Service) finishUpload(ctx context.Context, job model.Job) error {
	var u model.Upload
	if e := a.DB.WithContext(ctx).First(&u, job.TargetID).Error; e != nil {
		return e
	}
	if u.State != "completing" {
		return nil
	}
	parts := []model.Part{}
	if e := a.DB.WithContext(ctx).Where("upload_id = ?", u.ID).Order("number").Find(&parts).Error; e != nil {
		return e
	}
	stat, e := a.Objects.StatObject(ctx, a.Config.Bucket, u.ObjectKey, minio.StatObjectOptions{})
	if e != nil && !IsMissing(e) {
		return e
	}
	if e != nil {
		if u.Size == 0 {
			_, e = a.Objects.Client.PutObject(ctx, a.Config.Bucket, u.ObjectKey, bytes.NewReader(nil), 0, minio.PutObjectOptions{ContentType: "application/octet-stream"})
		} else {
			complete := make([]minio.CompletePart, len(parts))
			for i, p := range parts {
				if p.ETag == "" {
					return errors.New("missing confirmed part")
				}
				complete[i] = minio.CompletePart{PartNumber: p.Number, ETag: p.ETag}
			}
			_, e = a.Objects.CompleteMultipartUpload(ctx, a.Config.Bucket, u.ObjectKey, u.MultipartID, complete, minio.PutObjectOptions{})
		}
		if e != nil {
			code := minio.ToErrorResponse(e).Code
			if code == "NoSuchUpload" || code == "InvalidPart" || code == "InvalidPartOrder" || code == "EntityTooSmall" {
				return a.failUpload(ctx, job, u, "上传分片已失效，请重新上传")
			}
			return e
		}
		stat, e = a.Objects.StatObject(ctx, a.Config.Bucket, u.ObjectKey, minio.StatObjectOptions{})
		if e != nil {
			return e
		}
	}
	if stat.Size != u.Size {
		return a.failUpload(ctx, job, u, "文件大小校验失败")
	}
	object, e := a.Objects.Client.GetObject(ctx, a.Config.Bucket, u.ObjectKey, minio.GetObjectOptions{})
	if e != nil {
		return e
	}
	e = VerifyObject(object, parts, u.Size)
	object.Close()
	if e != nil {
		var invalid *apperror.APIError
		if errors.As(e, &invalid) {
			return a.failUpload(ctx, job, u, invalid.Message)
		}
		return e
	}
	return a.jobTransaction(ctx, job, func(tx *gorm.DB, library *model.Library) error {
		var current model.Upload
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, u.ID).Error; e != nil {
			return e
		}
		if current.State != "completing" {
			return nil
		}
		entry, e := repository.GetEntry(tx, current.EntryID)
		if e != nil {
			return e
		}
		if _, e = folderPath(tx, entry.ParentID); e != nil {
			return a.failInTransaction(tx, &current, "目标目录已被移除")
		}
		if entry.State != "pending" {
			return a.failInTransaction(tx, &current, "上传条目已被移除")
		}
		entry.State = "ready"
		if e = tx.Save(&entry).Error; e != nil {
			return e
		}
		current.State = "completed"
		current.Error = ""
		if err := tx.Save(&current).Error; err != nil {
			return err
		}
		if IsPreviewFormat(PreviewExtension(entry.Name)) && entry.Size > 0 && entry.Size <= previewLimit && (!IsSpreadsheet(PreviewExtension(entry.Name)) || entry.Size <= 25<<20) {
			preview := newPreview(entry)
			if err := tx.Create(&preview).Error; err != nil {
				return err
			}
			if err := tx.Create(&model.Job{Kind: "preview", TargetID: preview.ID, State: "queued", DueAt: time.Now().UTC()}).Error; err != nil {
				return err
			}
		}
		return touchDirectory(tx, library, entry.ParentID)
	})
}

func (a *Service) initialize(ctx context.Context, job model.Job) error {
	var u model.Upload
	if e := a.DB.WithContext(ctx).First(&u, job.TargetID).Error; e != nil {
		return e
	}
	if u.State != "preparing" && u.State != "paused" {
		return nil
	}
	multipart := u.MultipartID
	if u.Size > 0 && multipart == "" {

		// Reconcile the fixed object key after a crash between MinIO creation and its DB checkpoint.
		list, e := a.Objects.ListMultipartUploads(ctx, a.Config.Bucket, u.ObjectKey, "", "", "", 100)
		if e != nil {
			return e
		}
		for _, item := range list.Uploads {
			if item.Key == u.ObjectKey {
				if multipart == "" {
					multipart = item.UploadID
				} else {
					if e = a.Objects.AbortMultipartUpload(ctx, a.Config.Bucket, u.ObjectKey, item.UploadID); e != nil {
						return e
					}
				}
			}
		}
		if multipart == "" {
			multipart, e = a.Objects.NewMultipartUpload(ctx, a.Config.Bucket, u.ObjectKey, minio.PutObjectOptions{ContentType: "application/octet-stream"})
			if e != nil {
				return e
			}
		}
	}
	err := a.jobTransaction(ctx, job, func(tx *gorm.DB, library *model.Library) error {
		var current model.Upload
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, u.ID).Error; e != nil {
			return e
		}
		if current.State != "preparing" && current.State != "paused" {
			return nil
		}
		current.MultipartID = multipart
		current.Error = ""
		if current.State == "preparing" {
			current.State = "uploading"
		}
		return tx.Save(&current).Error
	})
	return err
}

func IsMissing(err error) bool {
	code := minio.ToErrorResponse(err).Code
	return code == "NoSuchKey" || code == "NoSuchUpload" || code == "NoSuchObject"
}

func (a *Service) jobTransaction(ctx context.Context, job model.Job, fn func(*gorm.DB, *model.Library) error) error {
	return a.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var library model.Library
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&library, 1).Error; e != nil {
			return e
		}
		var current model.Job
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&current, job.ID).Error; e != nil {
			return e
		}
		if current.Owner != job.Owner || current.State != "running" || current.LeaseUntil.Before(time.Now()) {
			return errors.New("worker lease lost")
		}
		if e := fn(tx, &library); e != nil {
			return e
		}
		return tx.Save(&library).Error
	})
}

func (a *Service) purge(ctx context.Context, job model.Job) error {
	entry, e := repository.GetEntry(a.DB.WithContext(ctx), job.TargetID)
	if e != nil {
		return e
	}
	if entry.State == "purged" {
		return nil
	}
	if entry.State != "purging" {
		return errors.New("invalid purge state")
	}
	previews := []model.Preview{}
	if e = a.DB.WithContext(ctx).Where("entry_id = ?", entry.ID).Find(&previews).Error; e != nil {
		return e
	}
	for _, preview := range previews {
		if preview.ObjectKey == "" && isPDFPreview(preview.Extension) && preview.CacheKey != "" {
			preview.ObjectKey = "previews/" + preview.CacheKey + "/document.pdf"
		}
		if preview.ObjectKey != "" {
			if e = a.Objects.RemoveObject(ctx, a.Config.Bucket, preview.ObjectKey, minio.RemoveObjectOptions{}); e != nil {
				return e
			}
		}
	}
	if entry.ObjectKey != "" {
		if e = a.Objects.RemoveObject(ctx, a.Config.Bucket, entry.ObjectKey, minio.RemoveObjectOptions{}); e != nil {
			return e
		}
	}
	return a.jobTransaction(ctx, job, func(tx *gorm.DB, library *model.Library) error {
		children := []model.Entry{}
		if e := tx.Where("parent_id = ? AND state IN ?", entry.ID, []string{"ready", "pending"}).Limit(100).Find(&children).Error; e != nil {
			return e
		}
		for _, child := range children {
			if child.DeletedAt != nil {
				library.TrashRevision++
			}
			if child.State == "pending" {
				var u model.Upload
				if e := tx.Where("entry_id = ?", child.ID).First(&u).Error; e != nil {
					return e
				}
				if u.State == "completing" {
					return errors.New("child upload is completing")
				}
				u.State = "cancelled"
				if e := tx.Save(&u).Error; e != nil {
					return e
				}
				if e := tx.Create(&model.Job{Kind: "cleanup", TargetID: u.ID, State: "queued", DueAt: time.Now().UTC()}).Error; e != nil {
					return e
				}
			} else {
				if e := tx.Create(&model.Job{Kind: "purge", TargetID: child.ID, State: "queued", DueAt: time.Now().UTC()}).Error; e != nil {
					return e
				}
			}
			if e := tx.Model(&child).Update("state", "purging").Error; e != nil {
				return e
			}
		}
		if len(children) == 100 {
			return tx.Create(&model.Job{Kind: "purge", TargetID: entry.ID, State: "queued", DueAt: time.Now().UTC()}).Error
		}
		return tx.Model(&entry).Update("state", "purged").Error
	})
}

func (a *Service) RunJob(parent context.Context, job model.Job) error {
	ctx, cancel := context.WithCancel(parent)
	defer cancel()
	done := make(chan struct{})
	defer close(done)
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				result := a.DB.WithContext(ctx).Model(&model.Job{}).Where("id = ? AND owner = ? AND state = ?", job.ID, job.Owner, "running").Update("lease_until", time.Now().UTC().Add(time.Minute))
				if result.Error != nil || result.RowsAffected != 1 {
					cancel()
					return
				}
			}
		}
	}()
	if e := a.ObjectsReady(); e != nil {
		return e
	}
	switch job.Kind {
	case "init":
		return a.initialize(ctx, job)
	case "complete":
		return a.finishUpload(ctx, job)
	case "cleanup":
		return a.cleanupUpload(ctx, job)
	case "purge":
		return a.purge(ctx, job)
	case "preview":
		return a.buildPreview(ctx, job)
	default:
		return errors.New("unknown job kind")
	}
}

func (a *Service) runWorker(ctx context.Context, previewOnly bool) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	for {
		if ctx.Err() != nil {
			return
		}
		job, e := a.ClaimJob(ctx, previewOnly)
		if e == nil {
			e = a.RunJob(ctx, job)
			state := "done"
			due := time.Now().UTC()
			if e != nil {
				state = "queued"
				delay := time.Duration(min(job.Attempts*job.Attempts, 300)) * time.Second
				due = due.Add(delay)
				slog.Warn("vault job will retry", "kind", job.Kind, "attempt", job.Attempts)
				if job.Kind == "init" || job.Kind == "complete" {
					_ = a.DB.WithContext(ctx).Model(&model.Upload{}).Where("id = ? AND state IN ?", job.TargetID, []string{"preparing", "completing"}).Update("error", "后台服务暂时不可用，任务将自动重试").Error
				}
			}
			_ = a.DB.WithContext(ctx).Model(&model.Job{}).Where("id = ? AND owner = ? AND state = ?", job.ID, job.Owner, "running").Updates(map[string]any{"state": state, "due_at": due, "owner": ""}).Error
			continue
		}
		if !errors.Is(e, gorm.ErrRecordNotFound) {
			slog.Warn("vault worker database unavailable")
		}
		if !previewOnly {
			a.ExpireUploads(ctx)
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func VerifyObject(reader io.Reader, parts []model.Part, size int64) error {
	buf := make([]byte, 1<<20)
	var total int64
	for _, part := range parts {
		hash := sha256.New()
		n, e := io.CopyBuffer(hash, io.LimitReader(reader, part.Size), buf)
		if e != nil {
			return e
		}
		if n != part.Size || hex.EncodeToString(hash.Sum(nil)) != part.SHA256 {
			return apperror.New(422, "CONTENT_MISMATCH", "文件内容校验失败，请重新上传")
		}
		total += n
	}
	if total != size {
		return apperror.New(422, "CONTENT_MISMATCH", "文件大小校验失败")
	}
	var extra [1]byte
	n, e := reader.Read(extra[:])
	if n != 0 || e != io.EOF {
		return apperror.New(422, "CONTENT_MISMATCH", "文件长度校验失败")
	}
	return nil
}
