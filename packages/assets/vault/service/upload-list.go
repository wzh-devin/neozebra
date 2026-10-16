package service

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"strings"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/dto"
	"github.com/neozebra/assets/vault/model"
)

type uploadListCursor struct {
	ID           int64 `json:"id,string"`
	Size         int64 `json:"size,string"`
	Status, Sort string
	Search       string
}

func (a *Service) ListUploads(ctx context.Context, input dto.UploadQuery) (dto.UploadPage, error) {
	status := input.Status
	if status == "" {
		status = "all"
	}
	switch status {
	case "all", "active", "paused", "completed", "failed", "cancelled":
	default:
		return dto.UploadPage{}, apperror.New(400, "INVALID_FILTER", "任务状态筛选无效")
	}
	order := input.Sort
	if order == "" {
		order = "newest"
	}
	switch order {
	case "newest", "oldest", "size-desc", "size-asc":
	default:
		return dto.UploadPage{}, apperror.New(400, "INVALID_SORT", "任务排序条件无效")
	}
	search := strings.TrimSpace(input.Search)
	if len(search) > 255 {
		return dto.UploadPage{}, apperror.New(400, "INVALID_FILTER", "搜索关键词过长")
	}
	var anchor uploadListCursor
	if raw := input.Cursor; raw != "" {
		if len(raw) > 4096 {
			return dto.UploadPage{}, apperror.New(400, "INVALID_CURSOR", "任务分页条件无效，请重新加载")
		}
		data, err := base64.RawURLEncoding.DecodeString(raw)
		if err != nil || json.Unmarshal(data, &anchor) != nil || anchor.ID <= 0 || anchor.Size < 0 || anchor.Status != status || anchor.Sort != order || anchor.Search != search {
			return dto.UploadPage{}, apperror.New(400, "INVALID_CURSOR", "任务分页条件已变化，请重新加载")
		}
	}
	query := a.DB.WithContext(ctx)
	if status == "active" {
		query = query.Where("state IN ?", []string{"preparing", "uploading", "completing"})
	} else if status != "all" {
		query = query.Where("state = ?", status)
	}
	if search != "" {
		escaped := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(search)
		query = query.Where("name ILIKE ?", "%"+escaped+"%")
	}
	ascending := order == "oldest" || order == "size-asc"
	if order == "size-asc" || order == "size-desc" {
		if ascending {
			query = query.Order("size ASC")
		} else {
			query = query.Order("size DESC")
		}
		if anchor.ID > 0 {
			if ascending {
				query = query.Where("(size > ? OR (size = ? AND id > ?))", anchor.Size, anchor.Size, anchor.ID)
			} else {
				query = query.Where("(size < ? OR (size = ? AND id < ?))", anchor.Size, anchor.Size, anchor.ID)
			}
		}
	} else if anchor.ID > 0 {
		if ascending {
			query = query.Where("id > ?", anchor.ID)
		} else {
			query = query.Where("id < ?", anchor.ID)
		}
	}
	if ascending {
		query = query.Order("id ASC")
	} else {
		query = query.Order("id DESC")
	}
	uploads := []model.Upload{}
	if err := query.Limit(11).Find(&uploads).Error; err != nil {
		return dto.UploadPage{}, err
	}
	cursor := ""
	if len(uploads) > 10 {
		uploads = uploads[:10]
		last := uploads[9]
		data, _ := json.Marshal(uploadListCursor{ID: last.ID, Size: last.Size, Status: status, Sort: order, Search: search})
		cursor = base64.RawURLEncoding.EncodeToString(data)
	}
	return dto.UploadPage{Uploads: uploads, NextCursor: cursor}, nil
}
