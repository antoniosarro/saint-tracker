package db

import (
	"github.com/antoniosarro/saint-tracker/backend/config"
	"github.com/jmoiron/sqlx"

	_ "github.com/mattn/go-sqlite3"
)

func Init(conf *config.Config) (*sqlx.DB, error) {
	db, err := sqlx.Connect(conf.Database.Driver, conf.Database.Filename)
	if err != nil {
		return nil, err
	}

	return db, nil
}
