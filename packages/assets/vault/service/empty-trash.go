package service

import (
	"context"
	"time"

	"gorm.io/gorm"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/dto"
	"github.com/neozebra/assets/vault/model"
)

func (a *Service) EmptyTrash(ctx context.Context, input dto.EmptyTrash) (int64, error) {
	if !input.Confirm {
		return 0, apperror.New(400, "CONFIRM_REQUIRED", "请先确认永久清空回收站")
	}
	var count int64
	err := a.namespace(ctx, func(tx *gorm.DB, library *model.Library) error {
		var entries []model.Entry
		result := tx.Select("id").Where("deleted_at IS NOT NULL AND state = ?", "ready").FindInBatches(&entries, 100, func(_ *gorm.DB, _ int) error {
			ids := make([]int64, 0, len(entries))
			jobs := make([]model.Job, 0, len(entries))
			now := time.Now().UTC()
			for _, entry := range entries {
				ids = append(ids, entry.ID)
				jobs = append(jobs, model.Job{Kind: "purge", TargetID: entry.ID, State: "queued", DueAt: now})
			}
			if err := tx.Model(&model.Entry{}).Where("id IN ?", ids).Update("state", "purging").Error; err != nil {
				return err
			}
			if err := tx.CreateInBatches(&jobs, 100).Error; err != nil {
				return err
			}
			count += int64(len(entries))
			return nil
		})
		if result.Error != nil {
			return result.Error
		}
		if count > 0 {
			library.TrashRevision++
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	return count, nil
}
