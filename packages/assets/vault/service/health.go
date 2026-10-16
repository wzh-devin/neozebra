package service

import "context"

// Health checks the database and Redis with the caller's deadline.
func (a *Service) Health(ctx context.Context) error {
	db, err := a.DB.DB()
	if err != nil {
		return err
	}
	if err = db.PingContext(ctx); err != nil {
		return err
	}
	return a.Redis.Ping(ctx).Err()
}
