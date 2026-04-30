package main

import (
	"fmt"
	"log"
	"net/http"
	"runtime"
	"time"

	"battleship/internal/handler"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
)

func main() {
	startMonitor(10 * time.Second)

	r := chi.NewRouter()
	r.Use(middleware.Logger)

	r.Get("/ws", handler.ServeWS)
	r.Get("/rooms", handler.ServeRooms)

	log.Printf("server listening on :8080")
	if err := http.ListenAndServe(":8080", r); err != nil {
		log.Fatalf("server error: %s", err)
	}
}

// startMonitor log les stats runtime à intervalle régulier dans une goroutine dédiée.
func startMonitor(interval time.Duration) {
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for range ticker.C {
			var m runtime.MemStats
			runtime.ReadMemStats(&m) // suspend brièvement le GC pour lire les stats
			log.Printf(
				"[monitor] goroutines=%-3d  heap=%-8s  sys=%-8s  gc=%d  last_pause=%s",
				runtime.NumGoroutine(),
				fmtBytes(m.HeapAlloc),
				fmtBytes(m.Sys),
				m.NumGC,
				time.Duration(m.PauseNs[(m.NumGC+255)%256]).Round(time.Microsecond),
			)
		}
	}()
}

func fmtBytes(b uint64) string {
	switch {
	case b >= 1<<20:
		return fmt.Sprintf("%.1fMB", float64(b)/float64(1<<20))
	case b >= 1<<10:
		return fmt.Sprintf("%.1fKB", float64(b)/float64(1<<10))
	default:
		return fmt.Sprintf("%dB", b)
	}
}
