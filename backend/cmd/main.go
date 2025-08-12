package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

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

	db, err := db.Init(conf)
	if err != nil {
		log.Fatalf("database connection error, %v", err)
	}
	defer db.Close()
	log.Infof("database connected: %+v", db.Stats())

	shutdownCh := make(chan os.Signal, 1)
	signal.Notify(shutdownCh, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)

	server := server.Init(&server.Options{
		DB:        db,
		Log:       log,
		ServerCfg: conf,
	})

	serverErrCh := make(chan error, 1)

	go func() {
		s := &http.Server{
			Addr:         conf.Server.Host + ":" + conf.Server.Port,
			ReadTimeout:  time.Second * conf.Server.ReadTimeout,
			WriteTimeout: time.Second * conf.Server.WriteTimeout,
		}

		log.Infof("server started on %s:%s", conf.Server.Host, conf.Server.Port)
		serverErrCh <- server.StartServer(s)
	}()

	select {
	case sig := <-shutdownCh:
		log.Infof("shutdown started: %s", sig)
		defer log.Infof("shutdown completed: %s", sig)

		ctx, cancel := context.WithTimeout(ctx, conf.Server.CtxDefaultTimeout)
		defer cancel()

		if err := server.Shutdown(ctx); err != nil {
			server.Close()
			return fmt.Errorf("gracefull shutdown failed, server forced to shutdown :%v", err)
		}
	case err := <-serverErrCh:
		log.Errorf("server error, %v", err)
		return err
	}

	return nil
}
