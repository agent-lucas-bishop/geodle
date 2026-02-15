import { useState, useEffect, useCallback } from 'react'
import './App.css'

interface Country {
  name: { common: string }
  cca2: string
  region: string
  subregion: string
  population: number
  latlng: [number, number]
  area: number
  capital?: string[]
  continents: string[]
}

function seededRandom(seed: number) {
  let x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function getDayNumber() {
  const now = new Date()
  return now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

function bearing(lat1: number, lon1: number, lat2: number, lon2: number): string {
  const dLon = (lon2 - lon1) * Math.PI / 180
  const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180)
  const x = Math.cos(lat1*Math.PI/180)*Math.sin(lat2*Math.PI/180) - Math.sin(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.cos(dLon)
  let b = Math.atan2(y, x) * 180 / Math.PI
  b = (b + 360) % 360
  if (b < 22.5 || b >= 337.5) return '⬆️'
  if (b < 67.5) return '↗️'
  if (b < 112.5) return '➡️'
  if (b < 157.5) return '↘️'
  if (b < 202.5) return '⬇️'
  if (b < 247.5) return '↙️'
  if (b < 292.5) return '⬅️'
  return '↖️'
}

function formatPop(n: number): string {
  if (n >= 1e9) return (n/1e9).toFixed(1) + 'B'
  if (n >= 1e6) return (n/1e6).toFixed(1) + 'M'
  if (n >= 1e3) return (n/1e3).toFixed(0) + 'K'
  return n.toString()
}

type GuessResult = {
  country: Country
  distance: number
  direction: string
  regionMatch: boolean
  continentMatch: boolean
}

const STORAGE_KEY = 'geodle-state'

export default function App() {
  const [countries, setCountries] = useState<Country[]>([])
  const [target, setTarget] = useState<Country | null>(null)
  const [guesses, setGuesses] = useState<GuessResult[]>([])
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<Country[]>([])
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [copied, setCopied] = useState(false)
  const [stats, setStats] = useState({ played: 0, won: 0, streak: 0, maxStreak: 0 })
  const maxGuesses = 6

  useEffect(() => {
    fetch('https://restcountries.com/v3.1/all?fields=name,cca2,region,subregion,population,latlng,area,capital,continents')
      .then(r => r.json())
      .then((data: Country[]) => {
        const filtered = data.filter(c => c.population > 100000 && c.latlng?.length === 2)
        setCountries(filtered)
        const dayNum = getDayNumber()
        const idx = Math.floor(seededRandom(dayNum) * filtered.length)
        setTarget(filtered[idx])

        // Load saved state
        try {
          const raw = localStorage.getItem(STORAGE_KEY)
          if (raw) {
            const saved = JSON.parse(raw)
            if (saved.date === new Date().toDateString()) {
              // Rebuild guess results from saved country names
              const restoredGuesses = saved.guessNames.map((name: string) => {
                const c = filtered.find(x => x.name.common === name)
                if (!c) return null
                const t = filtered[idx]
                const dist = haversine(c.latlng[0], c.latlng[1], t.latlng[0], t.latlng[1])
                return {
                  country: c, distance: dist,
                  direction: dist < 50 ? '🎯' : bearing(c.latlng[0], c.latlng[1], t.latlng[0], t.latlng[1]),
                  regionMatch: c.region === t.region,
                  continentMatch: c.continents[0] === t.continents[0]
                }
              }).filter(Boolean)
              setGuesses(restoredGuesses)
              setGameOver(saved.gameOver)
              setWon(saved.won)
            }
          }
        } catch {}

        try {
          const s = localStorage.getItem('geodle-stats')
          if (s) setStats(JSON.parse(s))
        } catch {}
      })
  }, [])

  const saveState = useCallback((names: string[], over: boolean, w: boolean) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      date: new Date().toDateString(), guessNames: names, gameOver: over, won: w
    }))
  }, [])

  const handleInput = (val: string) => {
    setInput(val)
    if (val.length < 2) { setSuggestions([]); return }
    const lower = val.toLowerCase()
    const guessedNames = new Set(guesses.map(g => g.country.name.common))
    setSuggestions(countries.filter(c => 
      c.name.common.toLowerCase().includes(lower) && !guessedNames.has(c.name.common)
    ).slice(0, 5))
  }

  const submitGuess = (country: Country) => {
    if (!target || gameOver) return
    setInput('')
    setSuggestions([])

    const dist = haversine(country.latlng[0], country.latlng[1], target.latlng[0], target.latlng[1])
    const result: GuessResult = {
      country, distance: dist,
      direction: dist < 50 ? '🎯' : bearing(country.latlng[0], country.latlng[1], target.latlng[0], target.latlng[1]),
      regionMatch: country.region === target.region,
      continentMatch: country.continents[0] === target.continents[0]
    }
    const newGuesses = [...guesses, result]
    const isWin = country.name.common === target.name.common
    const isOver = isWin || newGuesses.length >= maxGuesses

    setGuesses(newGuesses)
    if (isWin) { setWon(true); setGameOver(true) }
    else if (newGuesses.length >= maxGuesses) { setGameOver(true) }

    const names = newGuesses.map(g => g.country.name.common)
    saveState(names, isOver, isWin)

    if (isOver) {
      const s = { ...stats, played: stats.played + 1 }
      if (isWin) { s.won++; s.streak++; s.maxStreak = Math.max(s.maxStreak, s.streak) }
      else { s.streak = 0 }
      setStats(s)
      localStorage.setItem('geodle-stats', JSON.stringify(s))
    }
  }

  const share = () => {
    const blocks = guesses.map(g => {
      if (g.country.name.common === target?.name.common) return '🟩'
      if (g.distance < 1000) return '🟨'
      if (g.continentMatch) return '🟧'
      return '🟥'
    })
    const dirs = guesses.map(g => g.direction)
    const text = `🌍 Geodle ${new Date().toLocaleDateString()}\n${blocks.join('')} ${won ? guesses.length : 'X'}/${maxGuesses}\n${dirs.join('')}\n\ngeodle.app`
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!target) return <div className="app loading">Loading atlas...</div>

  return (
    <div className="app">
      <header>
        <div className="compass">🧭</div>
        <h1>GEODLE</h1>
        <p className="subtitle">The Daily Geography Challenge</p>
      </header>

      <div className="stats-bar">
        <span>🔥 {stats.streak}</span>
        <span>🏆 {stats.won}/{stats.played}</span>
      </div>

      <div className="clue-panel">
        <div className="clue"><span className="clue-label">Continent</span><span>{target.continents[0]}</span></div>
        <div className="clue"><span className="clue-label">Population</span><span>{formatPop(target.population)}</span></div>
        <div className="clue"><span className="clue-label">First Letter</span><span>{target.name.common[0]}</span></div>
      </div>

      <div className="guess-list">
        {guesses.map((g, i) => (
          <div key={i} className={`guess-row ${g.country.name.common === target.name.common ? 'correct' : ''}`}>
            <span className="guess-flag">{getFlagEmoji(g.country.cca2)}</span>
            <span className="guess-name">{g.country.name.common}</span>
            <span className="guess-dist">{Math.round(g.distance)} km</span>
            <span className="guess-dir">{g.direction}</span>
          </div>
        ))}
      </div>

      {!gameOver ? (
        <div className="input-area">
          <input
            type="text"
            value={input}
            onChange={e => handleInput(e.target.value)}
            placeholder="Type a country name..."
            className="country-input"
          />
          {suggestions.length > 0 && (
            <div className="suggestions">
              {suggestions.map(c => (
                <button key={c.cca2} className="suggestion" onClick={() => submitGuess(c)}>
                  {getFlagEmoji(c.cca2)} {c.name.common}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="result">
          <p className="result-text">
            {won ? `🎉 Found it in ${guesses.length}!` : `The answer was ${getFlagEmoji(target.cca2)} ${target.name.common}`}
          </p>
          <button className="share-btn" onClick={share}>
            {copied ? '✓ Copied!' : '📋 Share Result'}
          </button>
        </div>
      )}

      <footer>A new country every day</footer>

      <div className="daily-cross-promo">
        <span className="promo-label">More Dailies</span>
        <div className="promo-links">
          <a href="https://cinephile.codyp.xyz" target="_blank" rel="noopener">🎬 Cinéphile</a>
          <a href="https://chromacle.vercel.app" target="_blank" rel="noopener">🎨 Chromacle</a>
          <a href="https://pokedle-pi.vercel.app" target="_blank" rel="noopener">🔴 Pokédle</a>
          <a href="https://flaggle-chi.vercel.app" target="_blank" rel="noopener">🏁 Flaggle</a>
          <a href="https://cosmole.vercel.app" target="_blank" rel="noopener">🪐 Cosmole</a>
        </div>
      </div>
    </div>
  )
}

function getFlagEmoji(cc: string): string {
  return cc.toUpperCase().replace(/./g, c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65))
}
