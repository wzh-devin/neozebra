package service

import (
	"context"

	"github.com/minio/minio-go/v7"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/model"
	"github.com/neozebra/assets/vault/repository"
)

func (a *Service) ReadableEntry(ctx context.Context, id int64) (model.Entry, error) {
	entry, e := repository.GetEntry(a.DB.WithContext(ctx), id)
	if e != nil {
		return entry, e
	}
	if entry.Kind != "file" || entry.State != "ready" || entry.DeletedAt != nil {
		return entry, apperror.New(404, "FILE_UNAVAILABLE", "文件不存在或已被移除")
	}
	_, e = folderPath(a.DB.WithContext(ctx), entry.ParentID)
	return entry, e
}

// OpenContent validates the immutable object before the HTTP layer streams it.
func (a *Service) OpenContent(ctx context.Context, entry model.Entry) (*minio.Object, error) {
	if e := a.ObjectsReady(); e != nil {
		return nil, e
	}
	object, e := a.Objects.Client.GetObject(ctx, a.Config.Bucket, entry.ObjectKey, minio.GetObjectOptions{})
	if e != nil {
		return nil, e
	}
	stat, e := object.Stat()
	if e != nil {
		object.Close()
		return nil, e
	}
	if stat.Size != entry.Size {
		object.Close()
		return nil, apperror.New(503, "FILE_UNAVAILABLE", "存储中的文件不完整")
	}
	return object, nil
}

// OpenPreviewContent checks the preview cache before the controller writes response headers.
func (a *Service) OpenPreviewContent(ctx context.Context, entry model.Entry) (model.Preview, *minio.Object, error) {
	p, e := a.PreviewRecord(ctx, entry)
	if e != nil {
		return model.Preview{}, nil, e
	}
	if p.State != "ready" || p.ObjectKey == "" {
		return model.Preview{}, nil, apperror.New(409, "PREVIEW_NOT_READY", "预览尚未准备完成")
	}
	if e = a.ObjectsReady(); e != nil {
		return model.Preview{}, nil, e
	}
	object, e := a.Objects.Client.GetObject(ctx, a.Config.Bucket, p.ObjectKey, minio.GetObjectOptions{})
	if e != nil {
		return model.Preview{}, nil, e
	}
	if _, e = object.Stat(); e != nil {
		object.Close()
		return model.Preview{}, nil, apperror.New(503, "PREVIEW_MISSING", "预览缓存已失效，请重试")
	}
	return p, object, nil
}
