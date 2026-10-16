package main

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"os/signal"
	"sync"
	"syscall"

	"github.com/minio/minio-go/v7"

	"github.com/neozebra/assets/vault/config"
	"github.com/neozebra/assets/vault/controller"
	"github.com/neozebra/assets/vault/repository"
	"github.com/neozebra/assets/vault/server"
	"github.com/neozebra/assets/vault/service"
)

func main() {
	command := "serve"
	if len(os.Args) > 1 {
		command = os.Args[1]
	}
	c, e := config.LoadConfig()
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if command == "dev" && errors.Is(e, config.ErrNotConfigured) {
		slog.Warn("vault not configured; workspace remains available. Configure packages/assets/vault/.env and restart to enable the file library")
		if e = server.Serve(ctx, c.Address, controller.DevelopmentNotConfiguredHandler()); e != nil {
			slog.Error("vault listener failed")
			os.Exit(1)
		}
		return
	}
	if e != nil {
		slog.Error(e.Error())
		os.Exit(1)
	}
	db, e := repository.OpenDB(c)
	if e != nil {
		slog.Error("database unavailable")
		os.Exit(1)
	}
	app, e := service.New(c, db)
	if e != nil {
		slog.Error(e.Error())
		os.Exit(1)
	}
	defer app.Close()
	switch command {
	case "migrate":
		if e = repository.Migrate(db, c); e != nil {
			slog.Error("migration failed")
			os.Exit(1)
		}
		slog.Info("vault migration complete")
		return
	case "init-bucket":
		if app.Objects == nil {
			slog.Error("MinIO not configured")
			os.Exit(1)
		}
		exists, err := app.Objects.BucketExists(ctx, c.Bucket)
		if err != nil {
			slog.Error("MinIO unavailable")
			os.Exit(1)
		}
		if !exists {
			if e = app.Objects.MakeBucket(ctx, c.Bucket, minio.MakeBucketOptions{Region: c.Region}); e != nil {
				slog.Error("bucket creation failed")
				os.Exit(1)
			}
		}
		slog.Info("private bucket ready")
		return
	case "worker":
		var workers sync.WaitGroup
		workers.Go(func() { app.RunPreviewWorker(ctx) })
		app.RunWorker(ctx)
		workers.Wait()
		return
	case "serve", "dev":
	default:
		slog.Error("unknown command")
		os.Exit(1)
	}
	var workers sync.WaitGroup
	for i := 0; i < 2; i++ {
		workers.Go(func() { app.RunWorker(ctx) })
	}
	workers.Go(func() { app.RunPreviewWorker(ctx) })
	if e = server.Serve(ctx, c.Address, controller.New(app).Handler()); e != nil {
		slog.Error("vault listener failed")
		os.Exit(1)
	}
	stop()
	workers.Wait()
}
