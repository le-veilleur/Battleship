import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import Game from './pages/Game'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/"     element={<Home />} />
        <Route path="/game" element={<Game />} />
        <Route path="*"     element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
