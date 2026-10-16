package service

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/url"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"
	"github.com/redis/go-redis/v9"
	"gorm.io/gorm"

	"github.com/neozebra/assets/vault/apperror"
	"github.com/neozebra/assets/vault/config"
)

type Service struct {
	Config  config.Config
	DB      *gorm.DB
	Redis   *redis.Client
	Objects *minio.Core
	Public  *minio.Client
}

func token() string {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func New(c config.Config, db *gorm.DB) (*Service, error) {
	r, err := redis.ParseURL(c.RedisURL)
	if err != nil {
		return nil, errors.New("invalid Redis configuration")
	}
	a := &Service{Config: c, DB: db, Redis: redis.NewClient(r)}
	if c.Endpoint != "" {
		createClient := func(endpoint string) (*minio.Client, error) {
			u, e := url.Parse(endpoint)
			if e != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.Path != "" {
				return nil, errors.New("MinIO endpoint must be an origin")
			}
			return minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(c.AccessKey, c.SecretKey, ""), Secure: u.Scheme == "https", Region: c.Region})
		}
		client, e := createClient(c.Endpoint)
		if e != nil {
			return nil, e
		}
		a.Objects = &minio.Core{Client: client}
		a.Public, e = createClient(c.PublicEndpoint)
		if e != nil {
			return nil, e
		}
	}
	return a, nil
}

func (a *Service) Close() {
	a.Redis.Close()
	if db, e := a.DB.DB(); e == nil {
		db.Close()
	}
}

func (a *Service) ObjectsReady() error {
	if a.Objects == nil {
		return apperror.New(503, "STORAGE_NOT_CONFIGURED", "尚未配置新的 MinIO 服务")
	}
	return nil
}
