package service

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/dto"
	"github.com/neozebra/assets/vault/model"
)

const previewEngine = "kkfileview-5.0.3-v2"

const previewLimit = 100 << 20

const previewLifetime = 30 * time.Minute

func PreviewExtension(name string) string {
	return strings.TrimPrefix(strings.ToLower(filepath.Ext(name)), ".")
}

func IsPreviewFormat(ext string) bool {
	switch ext {
	case "doc", "docx", "dot", "dotx", "odt", "rtf", "ppt", "pptx", "pps", "ppsx", "odp", "xls", "xlsx", "xlsm", "csv", "tsv", "ods", "wps", "et", "dps", "ofd", "epub", "eml", "msg", "xmind", "drawio", "bpmn", "tif", "tiff", "heic", "heif", "zip", "rar", "7z", "tar", "gz":
		return true
	}
	return false
}

func IsSpreadsheet(ext string) bool {
	switch ext {
	case "xls", "xlsx", "xlsm", "csv", "tsv", "ods", "et":
		return true
	}
	return false
}

func isPDFPreview(ext string) bool {
	switch ext {
	case "doc", "docx", "dot", "dotx", "odt", "rtf", "ppt", "pptx", "pps", "ppsx", "odp", "wps", "dps":
		return true
	}
	return false
}

func PreviewCacheKey(entry model.Entry) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%d:%s:%s:%s", entry.ID, entry.Version, PreviewExtension(entry.Name), previewEngine)))
	return "pv" + hex.EncodeToString(sum[:])
}

func newPreview(entry model.Entry) model.Preview {
	return model.Preview{EntryID: entry.ID, Version: entry.Version, Extension: PreviewExtension(entry.Name), Engine: previewEngine, CacheKey: PreviewCacheKey(entry), SourceToken: token(), State: "queued"}
}

func (a *Service) PreviewRecord(ctx context.Context, entry model.Entry) (model.Preview, error) {
	var p model.Preview
	e := a.DB.WithContext(ctx).Where("entry_id = ? AND version = ? AND extension = ? AND engine = ?", entry.ID, entry.Version, PreviewExtension(entry.Name), previewEngine).Order("id DESC").First(&p).Error
	return p, e
}

func (a *Service) PreviewKey(kind, ticket string) string {
	return a.Config.Schema + ":preview:" + kind + ":" + ticket
}

func (a *Service) SavePreviewTicket(ctx context.Context, kind, ticket string, id int64) error {
	return a.Redis.Set(ctx, a.PreviewKey(kind, ticket), strconv.FormatInt(id, 10), previewLifetime).Err()
}

func (a *Service) ResolvePreviewTicket(ctx context.Context, kind, ticket string) (model.Preview, model.Entry, error) {
	var p model.Preview
	if len(ticket) != 64 {
		return p, model.Entry{}, apperror.New(403, "PREVIEW_EXPIRED", "预览链接已失效，请重新打开")
	}
	id, e := a.Redis.Get(ctx, a.PreviewKey(kind, ticket)).Int64()
	if errors.Is(e, redis.Nil) {
		return p, model.Entry{}, apperror.New(403, "PREVIEW_EXPIRED", "预览链接已失效，请重新打开")
	}
	if e != nil {
		return p, model.Entry{}, e
	}
	if e = a.DB.WithContext(ctx).First(&p, id).Error; e != nil {
		return p, model.Entry{}, e
	}
	entry, e := a.ReadableEntry(ctx, p.EntryID)
	if e == nil && (entry.Version != p.Version || PreviewExtension(entry.Name) != p.Extension || p.Engine != previewEngine) {
		e = apperror.New(409, "PREVIEW_CHANGED", "文件已发生变化，请重新打开预览")
	}
	return p, entry, e
}

func (a *Service) PreparePreview(ctx context.Context, id int64, input dto.PreparePreview) (map[string]any, error) {
	entry, e := a.ReadableEntry(ctx, id)
	if e != nil {
		return nil, e
	}
	ext := PreviewExtension(entry.Name)
	if !IsPreviewFormat(ext) {
		return nil, apperror.New(415, "PREVIEW_UNSUPPORTED", "此格式暂不支持在线预览")
	}
	if IsSpreadsheet(ext) && entry.Size > 25<<20 {
		return nil, apperror.New(413, "PREVIEW_LIMIT", "表格超过 25 MiB，请下载查看")
	}
	if entry.Size <= 0 || entry.Size > previewLimit {
		return nil, apperror.New(413, "PREVIEW_LIMIT", "文件为空或超过 100 MiB，请下载查看")
	}
	var p model.Preview
	e = a.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var library model.Library
		if e := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&library, 1).Error; e != nil {
			return e
		}
		lookup := tx.Where("entry_id = ? AND version = ? AND extension = ? AND engine = ?", entry.ID, entry.Version, ext, previewEngine).Order("id DESC").First(&p).Error
		if lookup != nil && !errors.Is(lookup, gorm.ErrRecordNotFound) {
			return lookup
		}
		if lookup == nil && !(input.Retry && (p.State == "failed" || p.State == "ready")) {
			return nil
		}
		if lookup != nil {
			p = newPreview(entry)
		} else {
			p.Refresh = true
		}
		p.State = "queued"
		p.Error = ""
		if e := tx.Save(&p).Error; e != nil {
			return e
		}
		return tx.Create(&model.Job{Kind: "preview", TargetID: p.ID, State: "queued", DueAt: time.Now().UTC()}).Error
	})
	if e != nil {
		return nil, e
	}
	return a.PreviewResult(ctx, p)
}

func (a *Service) GetPreview(ctx context.Context, id int64) (map[string]any, error) {
	entry, e := a.ReadableEntry(ctx, id)
	if e != nil {
		return nil, e
	}
	p, e := a.PreviewRecord(ctx, entry)
	if e != nil {
		return nil, e
	}
	return a.PreviewResult(ctx, p)
}

func (a *Service) PreviewResult(ctx context.Context, p model.Preview) (map[string]any, error) {
	value := map[string]any{"state": p.State, "message": p.Error}
	if p.State == "ready" {
		if p.ObjectKey != "" {
			value["kind"] = "pdf"
			value["url"] = fmt.Sprintf("%s/entries/%d/preview/content", dto.Prefix, p.EntryID)
		} else {
			if e := a.SavePreviewTicket(ctx, "source", p.SourceToken, p.ID); e != nil {
				return nil, e
			}
			ticket := token()
			if e := a.SavePreviewTicket(ctx, "viewer", ticket, p.ID); e != nil {
				return nil, e
			}
			value["kind"] = "frame"
			if IsSpreadsheet(p.Extension) {
				value["kind"] = "sheet"
			}
			value["url"] = dto.Prefix + "/viewer/" + ticket + "/onlinePreview"
		}
	}
	return value, nil
}
