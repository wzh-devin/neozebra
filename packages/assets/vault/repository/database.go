package repository

import (
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"

	"github.com/neozebra/assets/vault/config"
	"github.com/neozebra/assets/vault/model"
)

func OpenDB(c config.Config) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(c.DatabaseURL), &gorm.Config{DisableForeignKeyConstraintWhenMigrating: true, Logger: logger.Default.LogMode(logger.Silent), NamingStrategy: schema.NamingStrategy{TablePrefix: c.Schema + ".nm_storage_"}})
	if err != nil {
		return nil, err
	}
	pool, err := db.DB()
	if err != nil {
		return nil, err
	}
	pool.SetMaxOpenConns(20)
	pool.SetMaxIdleConns(5)
	pool.SetConnMaxLifetime(time.Hour)
	return db, nil
}

// Only infrastructure DDL uses SQL. Business tables and all reads/writes use GORM.
func Migrate(db *gorm.DB, c config.Config) error {
	if err := db.Exec(`CREATE SCHEMA IF NOT EXISTS "` + c.Schema + `"`).Error; err != nil {
		return err
	}
	if err := db.AutoMigrate(&model.Library{}, &model.Entry{}, &model.Upload{}, &model.Part{}, &model.Job{}, &model.Preview{}); err != nil {
		return err
	}
	return db.Clauses(clause.OnConflict{DoNothing: true}).Create(&model.Library{Record: model.Record{ID: 1}, Revision: 1}).Error
}
