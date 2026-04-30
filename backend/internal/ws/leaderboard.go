package ws

import (
	"sort"
	"sync"
)

type Score struct {
	Pseudo string `json:"pseudo"`
	Wins   int    `json:"wins"`
}

type LeaderboardStore struct {
	mu     sync.RWMutex
	scores map[string]int
}

var GlobalLeaderboard = &LeaderboardStore{scores: make(map[string]int)}

func (l *LeaderboardStore) AddWin(pseudo string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	l.scores[pseudo]++
}

func (l *LeaderboardStore) List() []Score {
	l.mu.RLock()
	defer l.mu.RUnlock()
	out := make([]Score, 0, len(l.scores))
	for pseudo, wins := range l.scores {
		out = append(out, Score{Pseudo: pseudo, Wins: wins})
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].Wins > out[j].Wins
	})
	return out
}
