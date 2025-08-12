package logger

import (
	"io"
	"os"

	"github.com/antoniosarro/saint-tracker/backend/config"
	"github.com/rs/zerolog"
	"github.com/rs/zerolog/pkgerrors"
	"gopkg.in/natefinch/lumberjack.v2"
)

var remappedLogLevels = map[string]zerolog.Level{
	"debug": zerolog.DebugLevel,
	"info":  zerolog.InfoLevel,
	"warn":  zerolog.WarnLevel,
	"error": zerolog.ErrorLevel,
	"fatal": zerolog.FatalLevel,
}

type Log struct {
	conf   *config.Config
	logger *zerolog.Logger
}

func Init(conf *config.Config) *Log {
	l := &Log{conf: conf}
	l.start()

	return l
}

func (l *Log) start() {
	zerolog.ErrorStackMarshaler = pkgerrors.MarshalStack
	zerolog.TimeFieldFormat = zerolog.TimeFormatUnix
	zerolog.SetGlobalLevel(l.getLogLevet())

	var output io.Writer = zerolog.ConsoleWriter{
		Out: os.Stdout,
	}

	if l.conf.App != "development" {
		file := &lumberjack.Logger{
			Filename:   l.conf.Logger.File,
			MaxSize:    l.conf.Logger.FileMaxSize,
			MaxBackups: l.conf.Logger.FileMaxBackups,
			MaxAge:     l.conf.Logger.FileMaxAge,
			Compress:   l.conf.Logger.FileCompress,
		}

		output = zerolog.MultiLevelWriter(os.Stderr, file)
	}

	logger := zerolog.New(output).With().Timestamp().Logger()
	l.logger = &logger
}

func (l *Log) getLogLevet() zerolog.Level {
	level, exists := remappedLogLevels[l.conf.Logger.Level]
	if !exists {
		return zerolog.DebugLevel
	}
	return level
}

func (l *Log) Debug(msg string) {
	l.logger.Debug().Msg(msg)
}

func (l *Log) Debugf(template string, args ...interface{}) {
	l.logger.Debug().Msgf(template, args...)
}

func (l *Log) Info(msg string) {
	l.logger.Info().Msg(msg)
}

func (l *Log) Infof(template string, args ...interface{}) {
	l.logger.Info().Msgf(template, args...)
}

func (l *Log) Warn(msg string) {
	l.logger.Warn().Msg(msg)
}

func (l *Log) Warnf(template string, args ...interface{}) {
	l.logger.Warn().Msgf(template, args...)
}

func (l *Log) Error(msg string) {
	l.logger.Error().Msg(msg)
}

func (l *Log) Errorf(template string, args ...interface{}) {
	l.logger.Error().Msgf(template, args...)
}

func (l *Log) Fatal(msg string) {
	l.logger.Fatal().Msg(msg)
}

func (l *Log) Fatalf(template string, args ...interface{}) {
	l.logger.Fatal().Msgf(template, args...)
}
