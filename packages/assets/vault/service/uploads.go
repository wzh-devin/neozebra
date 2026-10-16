package service

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/dto"
	"github.com/neozebra/assets/vault/model"
)

const minPartSize int64 = 8 << 20

func PartSize(size int64) int64 {
	n := (size + 9999) / 10000
	if n < minPartSize {
		return minPartSize
	}
	return ((n + (1 << 20) - 1) / (1 << 20)) * (1 << 20)
}

func Fingerprint(size, partSize int64, hashes []string) string {
	digest := sha256.Sum256([]byte(fmt.Sprintf("%d:%d:%s", size, partSize, strings.Join(hashes, ":"))))
	return hex.EncodeToString(digest[:])
}

func ValidateManifest(input dto.PrepareUpload) (int64, int64, error) {
	size, e := dto.ParseID(input.Size)
	if e != nil || size > 5*(1<<40) {
		return 0, 0, apperror.New(400, "INVALID_SIZE", "文件大小超出对象存储范围")
	}
	partSize, e := dto.ParseID(input.PartSize)
	if e != nil || partSize != PartSize(size) {
		return 0, 0, apperror.New(400, "INVALID_PART_SIZE", "分片规格无效")
	}
	count := int((size + partSize - 1) / partSize)
	if count != len(input.Hashes) {
		return 0, 0, apperror.New(400, "INVALID_MANIFEST", "分片校验清单不完整")
	}
	for _, hash := range input.Hashes {
		b, e := hex.DecodeString(hash)
		if e != nil || len(b) != 32 || hash != strings.ToLower(hash) {
			return 0, 0, apperror.New(400, "INVALID_MANIFEST", "分片校验值无效")
		}
	}
	if !regexp.MustCompile(`^[a-zA-Z0-9-]{16,80}$`).MatchString(input.Key) {
		return 0, 0, apperror.New(400, "INVALID_INPUT", "上传幂等键无效")
	}
	if len(input.Mime) > 128 || strings.ContainsAny(input.Mime, "\r\n") {
		return 0, 0, apperror.New(400, "INVALID_INPUT", "文件类型无效")
	}
	return size, partSize, nil
}

func (a *Service) PrepareUpload(ctx context.Context, input dto.PrepareUpload) (model.Upload, error) {
	if e := a.ObjectsReady(); e != nil {
		return model.Upload{}, e
	}
	if e := dto.ValidateName(input.Name); e != nil {
		return model.Upload{}, e
	}
	size, partSize, e := ValidateManifest(input)
	if e != nil {
		return model.Upload{}, e
	}
	parent, e := dto.ParseID(input.ParentID)
	if e != nil {
		return model.Upload{}, e
	}
	fingerprint := Fingerprint(size, partSize, input.Hashes)
	var upload model.Upload
	e = a.namespace(ctx, func(tx *gorm.DB, l *model.Library) error {
		if err := tx.Where("idempotency_key = ?", input.Key).First(&upload).Error; err == nil {
			if upload.Fingerprint != fingerprint || upload.Name != input.Name || upload.ParentID != parent {
				return apperror.New(409, "IDEMPOTENCY_CONFLICT", "上传幂等键已用于其他文件")
			}
			return nil
		} else if err != gorm.ErrRecordNotFound {
			return err
		}
		if _, err := folderPath(tx, parent); err != nil {
			return err
		}
		if err := availableName(tx, parent, 0, input.Name); err != nil {
			return err
		}
		entry := model.Entry{ParentID: parent, Name: input.Name, Kind: "file", State: "pending", Size: size, Mime: input.Mime, ObjectKey: "objects/" + token(), Version: token()[:32], Revision: 1}
		if err := tx.Create(&entry).Error; err != nil {
			return err
		}
		upload = model.Upload{EntryID: entry.ID, ParentID: parent, Name: input.Name, Size: size, PartSize: partSize, PartCount: len(input.Hashes), Fingerprint: fingerprint, IdempotencyKey: input.Key, ObjectKey: entry.ObjectKey, State: "preparing", ExpiresAt: time.Now().UTC().Add(7 * 24 * time.Hour)}
		if err := tx.Create(&upload).Error; err != nil {
			return err
		}
		parts := make([]model.Part, len(input.Hashes))
		for i, hash := range input.Hashes {
			n := partSize
			if remaining := size - int64(i)*partSize; remaining < n {
				n = remaining
			}
			parts[i] = model.Part{UploadID: upload.ID, Number: i + 1, Size: n, SHA256: hash}
		}
		if len(parts) > 0 {
			if err := tx.CreateInBatches(&parts, 200).Error; err != nil {
				return err
			}
		}
		return tx.Create(&model.Job{Kind: "init", TargetID: upload.ID, State: "queued", DueAt: time.Now().UTC()}).Error
	})
	if e != nil {
		return model.Upload{}, e
	}
	return upload, nil
}

func (a *Service) GetUpload(ctx context.Context, id int64) (dto.UploadDetail, error) {
	u, e := a.readUpload(ctx, id)
	if e != nil {
		return dto.UploadDetail{}, e
	}
	parts := []model.Part{}
	if e = a.DB.WithContext(ctx).Where("upload_id = ?", u.ID).Order("number").Find(&parts).Error; e != nil {
		return dto.UploadDetail{}, e
	}
	return dto.UploadDetail{Upload: u, Parts: parts}, nil
}

func (a *Service) UpdateUpload(ctx context.Context, id int64, input dto.UpdateUpload) (model.Upload, error) {
	u, e := a.readUpload(ctx, id)
	if e != nil {
		return model.Upload{}, e
	}
	e = a.namespace(ctx, func(tx *gorm.DB, l *model.Library) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&u, u.ID).Error; err != nil {
			return err
		}
		if u.State == "completed" || u.State == "completing" || u.State == "cancelled" || u.State == "failed" {
			return apperror.New(409, "TASK_STATE_CONFLICT", "任务已进入不可修改的阶段")
		}
		if time.Now().After(u.ExpiresAt) && input.Action != "cancel" {
			return apperror.New(410, "UPLOAD_EXPIRED", "上传任务已过期，请重新上传")
		}
		switch input.Action {
		case "pause":
			u.State = "paused"
		case "resume":
			if input.Fingerprint != u.Fingerprint {
				return apperror.New(409, "SOURCE_MISMATCH", "重新选择的文件与原文件不一致")
			}
			if _, err := folderPath(tx, u.ParentID); err != nil {
				return err
			}
			u.State = "uploading"
			if u.MultipartID == "" {
				u.State = "preparing"
			}
		case "cancel":
			u.State = "cancelled"
			if err := tx.Model(&model.Entry{}).Where("id = ? AND state = ?", u.EntryID, "pending").Update("state", "purging").Error; err != nil {
				return err
			}
			if err := tx.Create(&model.Job{Kind: "cleanup", TargetID: u.ID, State: "queued", DueAt: time.Now().UTC()}).Error; err != nil {
				return err
			}
		default:
			return apperror.New(400, "INVALID_INPUT", "上传操作无效")
		}
		return tx.Save(&u).Error
	})
	if e != nil {
		return model.Upload{}, e
	}
	return u, nil
}

func (a *Service) SignPart(ctx context.Context, id int64, number string) (dto.SignedPart, error) {
	if e := a.ObjectsReady(); e != nil {
		return dto.SignedPart{}, e
	}
	u, p, e := a.taskPart(ctx, id, number)
	if e != nil {
		return dto.SignedPart{}, e
	}
	if e = canUpload(u); e != nil {
		return dto.SignedPart{}, e
	}
	if _, e = folderPath(a.DB.WithContext(ctx), u.ParentID); e != nil {
		return dto.SignedPart{}, e
	}
	if p.ETag != "" {
		return dto.SignedPart{}, apperror.New(409, "PART_CONFIRMED", "该分片已确认")
	}
	hash, _ := hex.DecodeString(p.SHA256)
	checksum := base64.StdEncoding.EncodeToString(hash)
	headers := http.Header{"X-Amz-Checksum-Sha256": []string{checksum}}
	query := url.Values{"uploadId": []string{u.MultipartID}, "partNumber": []string{strconv.Itoa(p.Number)}}
	signed, e := a.Public.PresignHeader(ctx, "PUT", a.Config.Bucket, u.ObjectKey, 10*time.Minute, query, headers)
	if e != nil {
		return dto.SignedPart{}, e
	}
	return dto.SignedPart{URL: signed.String(), Headers: map[string]string{"x-amz-checksum-sha256": checksum}, ExpiresAt: time.Now().UTC().Add(10 * time.Minute)}, nil
}

func (a *Service) ConfirmPart(ctx context.Context, id int64, number string) (model.Part, error) {
	if e := a.ObjectsReady(); e != nil {
		return model.Part{}, e
	}
	u, p, e := a.taskPart(ctx, id, number)
	if e != nil {
		return model.Part{}, e
	}
	if e = canUpload(u); e != nil {
		return model.Part{}, e
	}
	if p.ETag != "" {
		return p, nil
	}
	remote, e := a.Objects.ListObjectParts(ctx, a.Config.Bucket, u.ObjectKey, u.MultipartID, p.Number-1, 1)
	if e != nil {
		return model.Part{}, e
	}
	if len(remote.ObjectParts) != 1 || remote.ObjectParts[0].PartNumber != p.Number || remote.ObjectParts[0].Size != p.Size {
		return model.Part{}, apperror.New(409, "PART_NOT_READY", "分片尚未完整接收，请重试")
	}
	etag := remote.ObjectParts[0].ETag
	e = a.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&u, u.ID).Error; err != nil {
			return err
		}
		if err := canUpload(u); err != nil {
			return err
		}
		return tx.Model(&p).Where("etag = ?", "").Update("etag", etag).Error
	})
	if e != nil {
		return model.Part{}, e
	}
	p.ETag = etag
	return p, nil
}

func (a *Service) CompleteUpload(ctx context.Context, id int64) (model.Upload, error) {
	u, e := a.readUpload(ctx, id)
	if e != nil {
		return model.Upload{}, e
	}
	e = a.namespace(ctx, func(tx *gorm.DB, l *model.Library) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&u, u.ID).Error; err != nil {
			return err
		}
		if u.State == "completed" || u.State == "completing" {
			return nil
		}
		if err := canUpload(u); err != nil {
			return err
		}
		if _, err := folderPath(tx, u.ParentID); err != nil {
			return err
		}
		var missing int64
		if err := tx.Model(&model.Part{}).Where("upload_id = ? AND etag = ?", u.ID, "").Count(&missing).Error; err != nil {
			return err
		}
		if missing != 0 {
			return apperror.New(409, "PARTS_MISSING", "仍有未确认的分片")
		}
		u.State = "completing"
		if err := tx.Save(&u).Error; err != nil {
			return err
		}
		return tx.Create(&model.Job{Kind: "complete", TargetID: u.ID, State: "queued", DueAt: time.Now().UTC()}).Error
	})
	if e != nil {
		return model.Upload{}, e
	}
	return u, nil
}

func (a *Service) readUpload(ctx context.Context, id int64) (model.Upload, error) {
	var upload model.Upload
	e := a.DB.WithContext(ctx).First(&upload, id).Error
	return upload, e
}

func (a *Service) taskPart(ctx context.Context, id int64, rawNumber string) (model.Upload, model.Part, error) {
	u, e := a.readUpload(ctx, id)
	if e != nil {
		return u, model.Part{}, e
	}
	number, e := strconv.Atoi(rawNumber)
	if e != nil || number < 1 || number > u.PartCount {
		return u, model.Part{}, apperror.New(400, "INVALID_PART", "分片编号无效")
	}
	var part model.Part
	e = a.DB.WithContext(ctx).Where("upload_id = ? AND number = ?", u.ID, number).First(&part).Error
	return u, part, e
}

func canUpload(u model.Upload) error {
	if time.Now().After(u.ExpiresAt) {
		return apperror.New(410, "UPLOAD_EXPIRED", "上传任务已过期")
	}
	if u.State != "uploading" {
		return apperror.New(409, "TASK_STATE_CONFLICT", "上传任务已暂停或不再接收分片")
	}
	return nil
}
