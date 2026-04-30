package game

type Cell struct {
	X int `json:"x"`
	Y int `json:"y"`
}

type Ship struct {
	ID    string `json:"id"`
	Cells []Cell `json:"cells"`
}

// ClientMsg est décodé depuis chaque message WebSocket envoyé par le navigateur.
type ClientMsg struct {
	Type   string `json:"type"`
	RoomID string `json:"room_id"`
	Pseudo string `json:"pseudo"`
	Ships  []Ship `json:"ships"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
}
