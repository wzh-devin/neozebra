package server

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"time"
)

func Serve(ctx context.Context, address string, handler http.Handler) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()
	server := &http.Server{Addr: address, Handler: handler, ReadHeaderTimeout: 10 * time.Second, ReadTimeout: 30 * time.Second, IdleTimeout: 60 * time.Second, MaxHeaderBytes: 32 << 10}
	shutdownDone := make(chan struct{})
	go func() {
		defer close(shutdownDone)
		<-ctx.Done()
		shutdown, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		_ = server.Shutdown(shutdown)
	}()
	slog.Info("vault listening", "address", address)
	err := server.ListenAndServe()
	cancel()
	<-shutdownDone
	if errors.Is(err, http.ErrServerClosed) {
		return nil
	}
	return err
}
