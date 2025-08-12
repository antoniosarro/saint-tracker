package validate

import (
	"errors"
	"reflect"
	"strings"
	"time"

	validation "github.com/go-ozzo/ozzo-validation"
)

var (
	Timestamp = validation.By(func(value interface{}) error {
		if timestamp, ok := value.(int64); ok {
			if timestamp <= 0 {
				return errors.New("timestamp must be positive")
			}

			t := time.Unix(timestamp, 0)

			// Upper and lower bounds
			year2000 := time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC).Unix()
			year2100 := time.Date(2100, 1, 1, 0, 0, 0, 0, time.UTC).Unix()

			if timestamp < year2000 || timestamp > year2100 {
				return errors.New("timestamp out of range 2000 < x < 2100")
			}

			if t.IsZero() {
				return errors.New("invalid timestamp")
			}

			return nil
		}
		return errors.New("timestamp must be int64")
	})
)

func SplitErrors(err error) []string {
	errStr := strings.TrimSuffix(err.Error(), ".")
	if reflect.TypeOf(err) == reflect.TypeOf(validation.Errors{}) {
		return strings.Split(errStr, ";")
	}
	return nil
}
