package main

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/antoniosarro/saint-tracker/backend/config"
	"github.com/antoniosarro/saint-tracker/backend/internal/server"
	"github.com/antoniosarro/saint-tracker/backend/pkg/db"
	"github.com/antoniosarro/saint-tracker/backend/pkg/logger"
)

func main() {
	conf, err := config.Load()
	if err != nil {
		panic("load config error, " + err.Error())
	}

	log := logger.Init(conf)
	ctx := context.Background()

	if err := run(ctx, conf, log); err != nil {
		log.Fatalf("run error, %v", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, conf *config.Config, log *logger.Log) error {
	log.Infof("starting server...")

	database, err := db.Init(conf)
	if err != nil {
		log.Fatalf("database connection error, %v", err)
	}
	defer database.Close()
	log.Infof("database connected: %+v", database.Stats())

	shutdownCh := make(chan os.Signal, 1)
	signal.Notify(shutdownCh, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	appServer := server.Init(&server.Options{
		DB:        database,
		Log:       log,
		ServerCfg: conf,
	})

	serverErrCh := make(chan error, 1)

	go func() {
		addr := conf.Server.Host + ":" + conf.Server.Port
		log.Infof("server starting on %s (with WebSocket support)", addr)

		// Start the Echo server directly
		serverErrCh <- appServer.Echo.Start(addr)
	}()

	select {
	case sig := <-shutdownCh:
		log.Infof("shutdown started: %s", sig)
		defer log.Infof("shutdown completed: %s", sig)

		ctx, cancel := context.WithTimeout(ctx, conf.Server.CtxDefaultTimeout)
		defer cancel()

		if err := appServer.Shutdown(ctx); err != nil {
			appServer.Close()
			return fmt.Errorf("graceful shutdown failed, server forced to shutdown: %v", err)
		}
	case err := <-serverErrCh:
		log.Errorf("server error, %v", err)
		return err
	}

	return nil
}
