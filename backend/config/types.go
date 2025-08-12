package config

import "time"

type Config struct {
	App      string `env:"APP_ENV"`
	Server   serverConfig
	Logger   loggerConfig
	Database databaseConfig
}

type serverConfig struct {
	Host              string        `env:"SERVER_HOST"`
	Port              string        `env:"SERVER_PORT"`
	ReadTimeout       time.Duration `env:"SERVER_READTIMEOUT"`
	WriteTimeout      time.Duration `env:"SERVER_WRITETIMEOUT"`
	CtxDefaultTimeout time.Duration `env:"SERVER_CTXDEFAULTTIMEOUT"`
	AllowedOrigins    []string      `env:"SERVER_ALLOWEDORIGINS"`
}

type loggerConfig struct {
	Level          string `env:"LOGGER_LEVEL"`
	File           string `env:"LOGGER_FILE"`
	FileMaxSize    int    `env:"LOGGER_FILE_MAXSIZE"`
	FileMaxBackups int    `env:"LOGGER_FILE_MAXBACKUPS"`
	FileMaxAge     int    `env:"LOGGER_FILE_MAXAGE"`
	FileCompress   bool   `env:"LOGGER_FILE_COMPRESS"`
}

type databaseConfig struct {
	Driver   string `env:"DB_DRIVER"`
	Filename string `env:"DB_FILENAME"`
}
