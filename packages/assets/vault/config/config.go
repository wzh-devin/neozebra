package config

import (
	"errors"
	"net/url"
	"os"
	"regexp"
)

type Config struct {
	DatabaseURL, Schema, RedisURL, Origin, Address                 string
	Endpoint, PublicEndpoint, AccessKey, SecretKey, Bucket, Region string
	PreviewURL, PreviewSourceOrigin                                string
}

var ErrNotConfigured = errors.New("configure database and Redis for the file library")

func env(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func LoadConfig() (Config, error) {
	c := Config{
		DatabaseURL: env("STORAGE_DATABASE_URL", os.Getenv("DATABASE_URL")), Schema: env("STORAGE_SCHEMA", "neozebra_storage"),
		RedisURL: env("STORAGE_REDIS_URL", os.Getenv("REDIS_URL")), Origin: env("APP_ORIGIN", "http://localhost:5174"), Address: env("STORAGE_ADDRESS", "127.0.0.1:3001"),
		Endpoint: os.Getenv("STORAGE_MINIO_ENDPOINT"), PublicEndpoint: os.Getenv("STORAGE_MINIO_PUBLIC_ENDPOINT"),
		AccessKey: os.Getenv("STORAGE_MINIO_ACCESS_KEY"), SecretKey: os.Getenv("STORAGE_MINIO_SECRET_KEY"), Bucket: env("STORAGE_MINIO_BUCKET", "neozebra-private"), Region: env("STORAGE_MINIO_REGION", "us-east-1"),
		PreviewURL: env("STORAGE_PREVIEW_URL", "http://127.0.0.1:8012"), PreviewSourceOrigin: env("STORAGE_PREVIEW_SOURCE_ORIGIN", "http://host.docker.internal:3001"),
	}
	if c.PublicEndpoint == "" {
		c.PublicEndpoint = c.Endpoint
	}
	u, err := url.Parse(c.Origin)
	if err != nil || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.Path != "" {
		return c, errors.New("APP_ORIGIN must be an absolute origin")
	}
	if !regexp.MustCompile(`^[a-z][a-z0-9_]{0,62}$`).MatchString(c.Schema) {
		return c, errors.New("invalid STORAGE_SCHEMA")
	}
	if c.Endpoint != "" && (c.AccessKey == "" || c.SecretKey == "") {
		return c, errors.New("configure credentials for the new MinIO service")
	}
	if c.DatabaseURL == "" || c.RedisURL == "" {
		return c, ErrNotConfigured
	}
	for _, value := range []string{c.PreviewURL, c.PreviewSourceOrigin} {
		u, e := url.Parse(value)
		if e != nil || u.Host == "" || u.User != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Path != "" || u.RawQuery != "" || u.Fragment != "" {
			return c, errors.New("preview addresses must be absolute HTTP origins")
		}
	}
	return c, nil
}
