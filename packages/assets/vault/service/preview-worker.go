package service

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/minio/minio-go/v7"
	"gorm.io/gorm"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/dto"
	"github.com/neozebra/assets/vault/model"
	"github.com/neozebra/assets/vault/repository"
)

func (a *Service) buildPreview(parent context.Context, job model.Job) error {
	var p model.Preview
	if e := a.DB.WithContext(parent).First(&p, job.TargetID).Error; e != nil {
		return e
	}
	if p.State == "ready" || p.State == "failed" {
		return nil
	}
	entry, e := a.ReadableEntry(parent, p.EntryID)
	var unavailable *apperror.APIError
	if e != nil && !errors.As(e, &unavailable) && !errors.Is(e, gorm.ErrRecordNotFound) {
		return e
	}
	if e != nil || entry.Version != p.Version || PreviewExtension(entry.Name) != p.Extension {
		return a.updatePreviewJob(parent, job, p, "failed", "文件已被移除或发生变化，请重新打开", "")
	}
	ctx, cancel := context.WithTimeout(parent, 2*time.Minute)
	defer cancel()
	if e = a.SavePreviewTicket(ctx, "source", p.SourceToken, p.ID); e != nil {
		return e
	}
	if e = a.updatePreviewJob(ctx, job, p, "running", "", ""); e != nil {
		return e
	}
	key := ""
	run := func() error {
		if e := a.checkPreviewArchive(ctx, entry); e != nil {
			return e
		}
		if IsSpreadsheet(p.Extension) {
			response, e := previewHTTP(ctx, a.Config.PreviewURL+"/xspreadsheet/xlsx.full.min.js")
			if e != nil {
				return e
			}
			defer response.Body.Close()
			if response.StatusCode != 200 {
				return errors.New("spreadsheet reader unavailable")
			}
			return nil
		}
		response, e := previewHTTP(ctx, a.PreviewEngineURL(p))
		if e != nil {
			return e
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			return fmt.Errorf("preview engine HTTP %d", response.StatusCode)
		}
		raw, e := io.ReadAll(io.LimitReader(response.Body, 4<<20))
		if e != nil {
			return e
		}
		html := string(raw)
		if strings.Contains(html, "系统暂不支持在线预览") || strings.Contains(html, "if ('true' == 'true')") || strings.Contains(html, "id=\"filePassword\"") || strings.Contains(html, "id='filePassword'") {
			return apperror.New(422, "PREVIEW_INVALID", "文档无法解析，可能已损坏、受密码保护或格式不兼容")
		}
		if !strings.Contains(strings.ToLower(html), "<html") {
			return errors.New("invalid preview response")
		}
		if !isPDFPreview(p.Extension) {
			return nil
		}
		response, e = previewHTTP(ctx, a.Config.PreviewURL+"/"+p.CacheKey+p.Extension+".pdf")
		if e != nil {
			return e
		}
		defer response.Body.Close()
		if response.StatusCode != 200 {
			return errors.New("converted preview missing")
		}
		file, e := os.CreateTemp("", "neozebra-preview-*.pdf")
		if e != nil {
			return e
		}
		defer os.Remove(file.Name())
		defer file.Close()
		size, e := io.Copy(file, io.LimitReader(response.Body, previewLimit+1))
		if e != nil {
			return e
		}
		if size > previewLimit {
			return apperror.New(413, "PREVIEW_LIMIT", "转换结果超过 100 MiB，请下载原文件查看")
		}
		header := make([]byte, 5)
		if _, e = file.ReadAt(header, 0); e != nil || string(header) != "%PDF-" {
			return apperror.New(422, "PREVIEW_INVALID", "文档未生成有效 PDF，请下载原文件查看")
		}
		if _, e = file.Seek(0, 0); e != nil {
			return e
		}
		key = "previews/" + p.CacheKey + "/document.pdf"
		_, e = a.Objects.Client.PutObject(ctx, a.Config.Bucket, key, file, size, minio.PutObjectOptions{ContentType: "application/pdf"})
		return e
	}
	e = run()
	if e != nil {
		if parent.Err() != nil {
			return parent.Err()
		}
		var permanent *apperror.APIError
		if errors.As(e, &permanent) {
			return a.updatePreviewJob(parent, job, p, "failed", permanent.Message, "")
		}
		if job.Attempts >= 3 {
			return a.updatePreviewJob(parent, job, p, "failed", "预览服务暂时不可用，请稍后重试", "")
		}
		if update := a.updatePreviewJob(parent, job, p, "queued", "预览服务暂时不可用，正在重试", ""); update != nil {
			return update
		}
		return e
	}

	// 发布前重新检查文件，避免转换与永久删除并发时重新留下派生对象。
	entry, e = a.ReadableEntry(parent, p.EntryID)
	if e != nil && !errors.As(e, &unavailable) && !errors.Is(e, gorm.ErrRecordNotFound) {
		return e
	}
	if e != nil || entry.Version != p.Version {
		if key != "" {
			if remove := a.Objects.RemoveObject(parent, a.Config.Bucket, key, minio.RemoveObjectOptions{}); remove != nil {
				return remove
			}
		}
		return a.updatePreviewJob(parent, job, p, "failed", "文件已被移除或发生变化", "")
	}
	return a.updatePreviewJob(parent, job, p, "ready", "", key)
}

// OOXML/ZIP 只检查目录与声明大小，不在应用进程里无界解压。
func (a *Service) checkPreviewArchive(ctx context.Context, entry model.Entry) error {
	switch PreviewExtension(entry.Name) {
	case "docx", "pptx", "xlsx", "xlsm", "odt", "odp", "ods", "zip", "epub":
	default:
		return nil
	}
	object, e := a.Objects.Client.GetObject(ctx, a.Config.Bucket, entry.ObjectKey, minio.GetObjectOptions{})
	if e != nil {
		return e
	}
	defer object.Close()
	archive, e := zip.NewReader(object, entry.Size)
	if e != nil {
		return apperror.New(422, "PREVIEW_INVALID", "文件包损坏，请下载原文件查看")
	}
	var total uint64
	if len(archive.File) > 4000 {
		return apperror.New(413, "PREVIEW_LIMIT", "文件包包含过多项目，请下载查看")
	}
	for _, item := range archive.File {
		total += item.UncompressedSize64
		if item.UncompressedSize64 > 32<<20 || total > 256<<20 || strings.HasPrefix(item.Name, "/") || strings.Contains(item.Name, "\\") || strings.Contains(item.Name, "../") || item.Name == ".." || strings.HasSuffix(item.Name, "/..") {
			return apperror.New(413, "PREVIEW_LIMIT", "文件包超出预览资源限制，请下载查看")
		}
	}
	return nil
}

func (a *Service) PreviewEngineURL(p model.Preview) string {
	query := url.Values{"url": {base64.StdEncoding.EncodeToString([]byte(a.PreviewSourceURL(p)))}, "officePreviewType": {"pdf"}, "kkagent": {"true"}}
	if p.Refresh {
		query.Set("forceUpdatedCache", "true")
	}
	return a.Config.PreviewURL + "/onlinePreview?" + query.Encode()
}

func previewHTTP(ctx context.Context, address string) (*http.Response, error) {
	request, e := http.NewRequestWithContext(ctx, http.MethodGet, address, nil)
	if e != nil {
		return nil, e
	}
	client := &http.Client{Timeout: 2 * time.Minute, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return errors.New("preview redirect denied") }}
	return client.Do(request)
}

func (a *Service) PreviewSourceURL(p model.Preview) string {
	return a.Config.PreviewSourceOrigin + dto.Prefix + "/preview-source/" + p.SourceToken + "/" + p.CacheKey + "." + p.Extension
}

func (a *Service) updatePreviewJob(ctx context.Context, job model.Job, p model.Preview, state, message, key string) error {
	return a.jobTransaction(ctx, job, func(tx *gorm.DB, _ *model.Library) error {
		if state == "ready" {
			entry, err := repository.GetEntry(tx, p.EntryID)
			if err != nil {
				return err
			}
			_, parentError := folderPath(tx, entry.ParentID)
			if entry.State != "ready" || entry.DeletedAt != nil || entry.Version != p.Version || parentError != nil {
				if key != "" {
					if err := a.Objects.RemoveObject(ctx, a.Config.Bucket, key, minio.RemoveObjectOptions{}); err != nil {
						return err
					}
				}
				state = "failed"
				message = "文件已被移除或发生变化"
				key = ""
			}
		}
		values := map[string]any{"state": state, "error": message, "object_key": key}
		if state == "ready" {
			values["refresh"] = false
		}
		return tx.Model(&model.Preview{}).Where("id = ?", p.ID).Updates(values).Error
	})
}
