package db

import (
	"embed"
	"fmt"

	"github.com/antoniosarro/saint-tracker/backend/config"
	"github.com/golang-migrate/migrate/v4"
	"github.com/golang-migrate/migrate/v4/database/sqlite3"
	"github.com/golang-migrate/migrate/v4/source/iofs"
	"github.com/jmoiron/sqlx"

	_ "github.com/mattn/go-sqlite3"
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

func Init(conf *config.Config) (*sqlx.DB, error) {
	db, err := sqlx.Connect(conf.Database.Driver, conf.Database.Filename)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}

	// Run migrations automatically
	if err := runMigrations(db); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to run migrations: %w", err)
	}

	db, err = sqlx.Connect(conf.Database.Driver, conf.Database.Filename)
	if err != nil {
		return nil, fmt.Errorf("failed to connect to database: %w", err)
	}
	return db, nil
}

func runMigrations(db *sqlx.DB) error {
	// Create the migrations source from embedded files
	migrationSource, err := iofs.New(migrationFiles, "migrations")
	if err != nil {
		return fmt.Errorf("failed to create migration source: %w", err)
	}

	// Create the database driver
	driver, err := sqlite3.WithInstance(db.DB, &sqlite3.Config{})
	if err != nil {
		return fmt.Errorf("failed to create database driver: %w", err)
	}

	// Create the migrate instance
	m, err := migrate.NewWithInstance("iofs", migrationSource, "sqlite3", driver)
	if err != nil {
		return fmt.Errorf("failed to create migrate instance: %w", err)
	}
	defer m.Close()

	// Run migrations
	err = m.Up()
	if err != nil && err != migrate.ErrNoChange {
		return fmt.Errorf("failed to apply migrations: %w", err)
	}

	if err == migrate.ErrNoChange {
		fmt.Println("No new migrations to apply")
	} else {
		fmt.Println("Migrations applied successfully")
	}

	return nil
}
