package middlewares

import (
	"sync"
	"time"
)

type DeviceInfo struct {
	ID        string
	Token     string
	ExpiresAt time.Time
}

type DeviceCache struct {
	mu    sync.RWMutex
	cache map[string]*DeviceInfo
	ttl   time.Duration
}

func NewDeviceCache(ttl time.Duration) *DeviceCache {
	dc := &DeviceCache{
		cache: make(map[string]*DeviceInfo),
		ttl:   ttl,
	}

	go dc.cleanup()

	return dc
}

func (dc *DeviceCache) Get(deviceID string) (*DeviceInfo, bool) {
	dc.mu.RLock()
	defer dc.mu.RUnlock()

	info, exists := dc.cache[deviceID]
	if !exists {
		return nil, false
	}

	if time.Now().After(info.ExpiresAt) {
		return nil, false
	}

	return info, true
}

func (dc *DeviceCache) Set(deviceID string, token string) {
	dc.mu.Lock()
	defer dc.mu.Unlock()

	dc.cache[deviceID] = &DeviceInfo{
		ID:        deviceID,
		Token:     token,
		ExpiresAt: time.Now().Add(dc.ttl),
	}
}

func (dc *DeviceCache) cleanup() {
	ticker := time.NewTicker(time.Minute * 5)
	defer ticker.Stop()

	for range ticker.C {
		dc.mu.Lock()

		now := time.Now()
		for id, info := range dc.cache {
			if now.After(info.ExpiresAt) {
				delete(dc.cache, id)
			}
		}

		dc.mu.Unlock()
	}
}
