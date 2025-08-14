package middlewares

import (
	"fmt"

	"github.com/antoniosarro/saint-tracker/backend/internal/sdk/httperrors"
	"github.com/antoniosarro/saint-tracker/backend/internal/web/webcontext"
	"github.com/labstack/echo/v4"
)

func (mid *Middleware) Authenticated(next echo.HandlerFunc) echo.HandlerFunc {
	return func(c echo.Context) error {

		// Get X-Header-Token
		token := c.Request().Header.Get("X-Header-Token")
		if token == "" {
			e := httperrors.New(httperrors.Unauthenticated, "X-Header-Token missing")
			e.AddDetail("X-Header-Token header is required")
			return e
		}

		// Get X-Header-Device
		deviceID := c.Request().Header.Get("X-Header-Device")
		if deviceID == "" {
			e := httperrors.New(httperrors.Unauthenticated, "X-Header-Device missing")
			e.AddDetail("X-Header-Device header is required")
			return e
		}

		// Try to get device info from cache first
		var validToken string
		if cachedInfo, found := mid.deviceCache.Get(deviceID); found {
			validToken = cachedInfo.Token
		} else {
			query := `SELECT token FROM esp32_devices WHERE serial_number = $1`
			row := mid.db.QueryRowxContext(c.Request().Context(), query, deviceID)

			var device struct {
				Token string `db:"token"`
			}

			if err := row.StructScan(&device); err != nil {
				fmt.Println(err)
				e := httperrors.New(httperrors.Unauthenticated, "esp32 device not valid")
				e.AddDetail("esp32 device not valid")
				return e
			}

			validToken = device.Token

			// Cache the result
			mid.deviceCache.Set(deviceID, validToken)
		}

		if token != validToken {
			e := httperrors.New(httperrors.Unauthenticated, "Invalid token for device")
			e.AddDetail("Token does not match device")
			return e
		}

		ctx := webcontext.SetDeviceID(c.Request().Context(), deviceID)
		ctx = webcontext.SetAccessToken(ctx, token)

		c.SetRequest(c.Request().WithContext(ctx))

		return next(c)
	}
}
