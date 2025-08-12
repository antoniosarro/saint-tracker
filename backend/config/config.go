package config

import (
	"log"

	"github.com/caarlos0/env/v11"
	"github.com/joho/godotenv"
)

func Load() (*Config, error) {
	if err := godotenv.Load(); err != nil {
		log.Printf("no .env file found, using system environment variables: %v", err)
	}
	c := new(Config)
	if err := env.Parse(c); err != nil {
		log.Printf("unable to parse environment variables: %v", err)
		return nil, err
	}

	return c, nil
}
