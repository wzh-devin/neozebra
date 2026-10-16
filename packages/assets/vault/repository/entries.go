package repository

import (
	"gorm.io/gorm"

	"github.com/neozebra/assets/vault/model"
)

func GetEntry(db *gorm.DB, id int64) (model.Entry, error) {
	var e model.Entry
	err := db.First(&e, id).Error
	return e, err
}
