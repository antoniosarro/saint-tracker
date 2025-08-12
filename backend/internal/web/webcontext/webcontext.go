package webcontext

import "context"

type contextKey string

const (
	deviceKey contextKey = "device_key"
	tokenKey  contextKey = "token_key"
)

func SetDeviceID(ctx context.Context, deviceID string) context.Context {
	return context.WithValue(ctx, deviceKey, deviceID)
}

func SetAccessToken(ctx context.Context, token string) context.Context {
	return context.WithValue(ctx, deviceKey, token)
}
