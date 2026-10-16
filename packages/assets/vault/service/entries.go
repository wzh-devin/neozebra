package service

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/dto"
	"github.com/neozebra/assets/vault/model"
	"github.com/neozebra/assets/vault/repository"
)

func folderPath(db *gorm.DB, id int64) ([]model.Entry, error) {
	path := []model.Entry{}
	seen := map[int64]bool{}
	for id != 0 {
		if len(path) >= 128 || seen[id] {
			return nil, apperror.New(409, "INVALID_TREE", "目录层级无效或超过 128 层")
		}
		seen[id] = true
		e, err := repository.GetEntry(db, id)
		if err != nil {
			return nil, err
		}
		if e.Kind != "folder" || e.State != "ready" || e.DeletedAt != nil {
			return nil, apperror.New(409, "TARGET_UNAVAILABLE", "目标目录已被移除")
		}
		path = append(path, e)
		id = e.ParentID
	}
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
	}
	return path, nil
}

func availableName(db *gorm.DB, parentID, exceptID int64, name string) error {
	var count int64
	err := db.Model(&model.Entry{}).Where("parent_id = ? AND name = ? AND id <> ? AND deleted_at IS NULL AND state IN ?", parentID, name, exceptID, []string{"ready", "pending"}).Count(&count).Error
	if err != nil {
		return err
	}
	if count > 0 {
		return apperror.New(409, "NAME_CONFLICT", "该目录中已存在同名条目")
	}
	return nil
}

func subtreeDepth(db *gorm.DB, id int64) (int, error) {
	frontier := []int64{id}
	seen := map[int64]bool{id: true}
	depth := 1
	for len(frontier) > 0 {
		next := []int64{}
		for start := 0; start < len(frontier); start += 200 {
			var children []model.Entry
			if err := db.Where("parent_id IN ? AND kind = ? AND state = ?", frontier[start:min(start+200, len(frontier))], "folder", "ready").Find(&children).Error; err != nil {
				return 0, err
			}
			for _, child := range children {
				if seen[child.ID] {
					return 0, apperror.New(409, "INVALID_TREE", "目录包含循环")
				}
				seen[child.ID] = true
				next = append(next, child.ID)
			}
		}
		if len(next) == 0 {
			break
		}
		depth++
		if depth > 127 {
			return 0, apperror.New(409, "DEPTH_LIMIT", "目录层级过深")
		}
		frontier = next
	}
	return depth, nil
}

func (a *Service) namespace(ctx context.Context, fn func(*gorm.DB, *model.Library) error) error {
	return a.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var library model.Library
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).First(&library, 1).Error; err != nil {
			return err
		}
		if err := fn(tx, &library); err != nil {
			return err
		}
		return tx.Save(&library).Error
	})
}

func touchDirectory(tx *gorm.DB, library *model.Library, id int64) error {
	if id == 0 {
		library.Revision++
		return nil
	}
	entry, err := repository.GetEntry(tx, id)
	if err != nil {
		return err
	}
	return tx.Model(&entry).Update("revision", entry.Revision+1).Error
}

type entryCursor struct {
	Parent             int64
	Revision           int64
	Kind, Name, Search string
	ID                 int64
	Trash              bool
}

func (a *Service) ListEntries(ctx context.Context, input dto.EntryQuery) (dto.EntryPage, error) {
	parent, trash, search, limit := input.ParentID, input.Trash, input.Search, input.Limit
	var cursor *entryCursor
	if value := input.Cursor; value != "" {
		raw, e := base64.RawURLEncoding.DecodeString(value)
		if e != nil || len(raw) > 2048 {
			return dto.EntryPage{}, apperror.New(400, "INVALID_CURSOR", "分页位置无效")
		}
		cursor = &entryCursor{}
		if json.Unmarshal(raw, cursor) != nil || cursor.Parent != parent || cursor.Search != search || cursor.Trash != trash {
			return dto.EntryPage{}, apperror.New(400, "INVALID_CURSOR", "分页位置不属于当前目录")
		}
	}
	var result dto.EntryPage
	err := a.DB.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		var library model.Library
		if e := tx.First(&library, 1).Error; e != nil {
			return e
		}
		revision := library.Revision
		path := []model.Entry{}
		if !trash {
			var e error
			path, e = folderPath(tx, parent)
			if e != nil {
				return e
			}
			if len(path) > 0 {
				revision = path[len(path)-1].Revision
			}
		} else {
			revision = library.TrashRevision
		}
		if cursor != nil && cursor.Revision != revision {
			return apperror.New(409, "CURSOR_EXPIRED", "目录已更新，请重新加载")
		}
		query := tx.Where("state = ?", "ready")
		if trash {
			query = query.Where("deleted_at IS NOT NULL")
		} else {
			query = query.Where("parent_id = ? AND deleted_at IS NULL", parent)
		}
		if search != "" {
			escaped := strings.NewReplacer("\\", "\\\\", "%", "\\%", "_", "\\_").Replace(search)
			query = query.Where("name ILIKE ?", "%"+escaped+"%")
		}

		// Lexicographic kind descending puts folders before files without database expressions.
		if cursor != nil {
			query = query.Where("kind < ? OR (kind = ? AND name > ?) OR (kind = ? AND name = ? AND id > ?)", cursor.Kind, cursor.Kind, cursor.Name, cursor.Kind, cursor.Name, cursor.ID)
		}
		entries := []model.Entry{}
		if e := query.Order("kind DESC").Order("name ASC").Order("id ASC").Limit(limit + 1).Find(&entries).Error; e != nil {
			return e
		}
		next := ""
		if len(entries) > limit {
			entries = entries[:limit]
			last := entries[len(entries)-1]
			raw, _ := json.Marshal(entryCursor{Parent: parent, Revision: revision, Kind: last.Kind, Name: last.Name, ID: last.ID, Search: search, Trash: trash})
			next = base64.RawURLEncoding.EncodeToString(raw)
		}
		result = dto.EntryPage{Entries: entries, Path: path, NextCursor: next, Revision: strconv.FormatInt(revision, 10)}
		return nil
	}, &sql.TxOptions{Isolation: sql.LevelRepeatableRead, ReadOnly: true})
	return result, err
}

func (a *Service) CreateFolder(ctx context.Context, input dto.CreateFolder) (model.Entry, error) {
	if err := dto.ValidateName(input.Name); err != nil {
		return model.Entry{}, err
	}
	parent, err := dto.ParseID(input.ParentID)
	if err != nil {
		return model.Entry{}, err
	}
	var entry model.Entry
	err = a.namespace(ctx, func(tx *gorm.DB, l *model.Library) error {
		path, e := folderPath(tx, parent)
		if e != nil {
			return e
		}
		if len(path) >= 127 {
			return apperror.New(409, "DEPTH_LIMIT", "目录层级过深")
		}
		if input.Reuse {
			if e = tx.Where("parent_id = ? AND name = ? AND kind = ? AND state = ? AND deleted_at IS NULL", parent, input.Name, "folder", "ready").First(&entry).Error; e == nil {
				return nil
			}
			if e != gorm.ErrRecordNotFound {
				return e
			}
		}
		if e = availableName(tx, parent, 0, input.Name); e != nil {
			return e
		}
		entry = model.Entry{ParentID: parent, Name: input.Name, Kind: "folder", State: "ready", Revision: 1}
		if err := tx.Create(&entry).Error; err != nil {
			return err
		}
		return touchDirectory(tx, l, parent)
	})
	if err != nil {
		return model.Entry{}, err
	}
	return entry, nil
}

func (a *Service) EditEntry(ctx context.Context, id int64, input dto.EditEntry) (model.Entry, error) {
	if input.Name == nil && input.ParentID == nil {
		return model.Entry{}, apperror.New(400, "INVALID_INPUT", "没有指定修改内容")
	}
	var entry model.Entry
	err := a.namespace(ctx, func(tx *gorm.DB, l *model.Library) error {
		var e error
		entry, e = repository.GetEntry(tx, id)
		if e != nil {
			return e
		}
		if entry.State != "ready" || entry.DeletedAt != nil {
			return apperror.New(409, "ENTRY_UNAVAILABLE", "文件已被移除或尚未完成上传")
		}
		if _, e = folderPath(tx, entry.ParentID); e != nil {
			return e
		}
		parent := entry.ParentID
		name := entry.Name
		if input.Name != nil {
			name = *input.Name
			if e = dto.ValidateName(name); e != nil {
				return e
			}
		}
		if input.ParentID != nil {
			parent, e = dto.ParseID(*input.ParentID)
			if e != nil {
				return e
			}
		}
		path, e := folderPath(tx, parent)
		if e != nil {
			return e
		}
		if entry.Kind == "folder" {
			if id == parent {
				return apperror.New(409, "DIRECTORY_CYCLE", "不能移入自身或子目录")
			}
			for _, p := range path {
				if p.ID == id {
					return apperror.New(409, "DIRECTORY_CYCLE", "不能移入自身或子目录")
				}
			}
			depth, err := subtreeDepth(tx, id)
			if err != nil {
				return err
			}
			if len(path)+depth > 127 {
				return apperror.New(409, "DEPTH_LIMIT", "移动后目录层级超过 127 层")
			}
		}
		if e = availableName(tx, parent, id, name); e != nil {
			return e
		}
		originalParent := entry.ParentID
		entry.Name = name
		entry.ParentID = parent
		entry.Revision++
		if err := tx.Save(&entry).Error; err != nil {
			return err
		}
		if err := touchDirectory(tx, l, originalParent); err != nil {
			return err
		}
		if parent != originalParent {
			return touchDirectory(tx, l, parent)
		}
		return nil
	})
	if err != nil {
		return model.Entry{}, err
	}
	return entry, nil
}

func (a *Service) TrashEntry(ctx context.Context, id int64) error {
	e := a.namespace(ctx, func(tx *gorm.DB, l *model.Library) error {
		entry, err := repository.GetEntry(tx, id)
		if err != nil {
			return err
		}
		if entry.State != "ready" {
			return apperror.New(409, "ENTRY_UNAVAILABLE", "文件尚未完成上传或正在清理")
		}
		if entry.DeletedAt != nil {
			return nil
		}
		if _, err = folderPath(tx, entry.ParentID); err != nil {
			return err
		}
		now := time.Now().UTC()
		if err := tx.Model(&entry).Updates(map[string]any{"deleted_at": now, "revision": entry.Revision + 1}).Error; err != nil {
			return err
		}
		l.TrashRevision++
		return touchDirectory(tx, l, entry.ParentID)
	})
	if e != nil {
		return e
	}
	return nil
}

func (a *Service) RestoreEntry(ctx context.Context, id int64, input dto.RestoreEntry) (model.Entry, error) {
	var entry model.Entry
	err := a.namespace(ctx, func(tx *gorm.DB, l *model.Library) error {
		var e error
		entry, e = repository.GetEntry(tx, id)
		if e != nil {
			return e
		}
		if entry.DeletedAt == nil || entry.State != "ready" {
			return apperror.New(409, "ENTRY_UNAVAILABLE", "条目不在回收站或正在清理")
		}
		parent := entry.ParentID
		if input.ParentID != nil {
			parent, e = dto.ParseID(*input.ParentID)
			if e != nil {
				return e
			}
		}
		path, e := folderPath(tx, parent)
		if e != nil {
			return e
		}
		for _, p := range path {
			if p.ID == id {
				return apperror.New(409, "DIRECTORY_CYCLE", "不能恢复到自身子目录")
			}
		}
		if entry.Kind == "folder" {
			depth, err := subtreeDepth(tx, id)
			if err != nil {
				return err
			}
			if len(path)+depth > 127 {
				return apperror.New(409, "DEPTH_LIMIT", "恢复后目录层级超过 127 层")
			}
		}
		if e = availableName(tx, parent, id, entry.Name); e != nil {
			return e
		}
		entry.ParentID = parent
		entry.DeletedAt = nil
		entry.Revision++
		if err := tx.Save(&entry).Error; err != nil {
			return err
		}
		l.TrashRevision++
		return touchDirectory(tx, l, parent)
	})
	if err != nil {
		return model.Entry{}, err
	}
	return entry, nil
}

func (a *Service) PurgeEntry(ctx context.Context, id int64) error {
	e := a.namespace(ctx, func(tx *gorm.DB, l *model.Library) error {
		entry, err := repository.GetEntry(tx, id)
		if err != nil {
			return err
		}
		if entry.State == "purging" || entry.State == "purged" {
			return nil
		}
		if entry.DeletedAt == nil {
			return apperror.New(409, "NOT_IN_TRASH", "请先将文件移入回收站")
		}
		if err = tx.Model(&entry).Update("state", "purging").Error; err != nil {
			return err
		}
		l.TrashRevision++
		return tx.Create(&model.Job{Kind: "purge", TargetID: id, State: "queued", DueAt: time.Now().UTC()}).Error
	})
	if e != nil {
		return e
	}
	return nil
}
