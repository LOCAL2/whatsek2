import { useState, useEffect, useCallback, useRef, memo } from 'react'
import './App.css'

const API_BASE = '/api'
const POLL_INTERVAL = 10000
const LIMIT = 10

interface Slip {
  id: number
  uploader: string
  sender: string
  receiver: string
  amount: number
  transferDate: string
  qrPayload: string
  createdAt: string
}

interface ApiResponse {
  slips: Slip[]
  total: number
  page: number
  totalPages: number
  totalAmount: number
}

function formatBaht(amount: number) {
  return new Intl.NumberFormat('th-TH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const currentYear = new Date().getFullYear()
  if (y === 1970 || y > currentYear) return 'ไม่พบวันที่ในสลิป'
  return d.toLocaleDateString('th-TH-u-ca-gregory', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function useAnimatedNumber(target: number, duration = 800) {
  const [display, setDisplay] = useState(target)
  const rafRef = useRef<number>(0)
  const startRef = useRef<number>(0)
  const fromRef = useRef<number>(target)

  useEffect(() => {
    fromRef.current = display
    startRef.current = performance.now()
    const from = fromRef.current
    const diff = target - from

    const tick = (now: number) => {
      const elapsed = now - startRef.current
      const progress = Math.min(elapsed / duration, 1)
      // ease out cubic
      const ease = 1 - Math.pow(1 - progress, 3)
      setDisplay(from + diff * ease)
      if (progress < 1) rafRef.current = requestAnimationFrame(tick)
    }

    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [target, duration])

  return display
}

const RealtimeDot = memo(function RealtimeDot() {
  return (
    <div className="stat-realtime">
      <span className="stat-dot" aria-hidden="true" />
      อัปเดตอัตโนมัติ
    </div>
  )
})

function AnimatedTotal({ value }: { value: number }) {
  const animated = useAnimatedNumber(value)
  return (
    <div className="stat-value-wrap">
      <span className="stat-value">
        {Math.floor(animated).toLocaleString('th-TH')}
      </span>
      <span className="stat-decimal">
        .{String(Math.round((animated % 1) * 100)).padStart(2, '0')}
      </span>
      <span className="stat-currency">THB</span>
    </div>
  )
}

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [totalAmount, setTotalAmount] = useState(0)
  const [totalDelta, setTotalDelta] = useState<number | null>(null)
  const [deltaVisible, setDeltaVisible] = useState(false)
  const [countDelta, setCountDelta] = useState<number | null>(null)
  const [countDeltaVisible, setCountDeltaVisible] = useState(false)
  const prevTotalRef = useRef<number>(0)
  const [page, setPage] = useState(() => {
    const p = new URLSearchParams(window.location.search).get('page')
    return p ? Math.max(1, parseInt(p)) : 1
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null)
  const [sortMenuOpen, setSortMenuOpen] = useState(false)
  const [yearMenuOpen, setYearMenuOpen] = useState(false)
  const [allSlips, setAllSlips] = useState<Slip[] | null>(null)
  const [fetchingAll, setFetchingAll] = useState(false)
  const [fetchAllProgress, setFetchAllProgress] = useState(0)
  const [filterYear, setFilterYear] = useState<number | null>(null)
  const [searchQuery, setSearchQuery] = useState('')

  const tableBodyRef = useRef<HTMLDivElement>(null)

  const deltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countDeltaTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateTotal = useCallback((newAmount: number) => {
    setTotalAmount(prev => {
      if (prev > 0 && newAmount !== prev) {
        const diff = newAmount - prev
        setTotalDelta(diff)
        setDeltaVisible(true)
        if (deltaTimerRef.current) clearTimeout(deltaTimerRef.current)
        deltaTimerRef.current = setTimeout(() => setDeltaVisible(false), 10000)
      }
      prevTotalRef.current = newAmount
      return newAmount
    })
  }, [])

  const updateCount = useCallback((newCount: number) => {
    setData(prev => {
      if (prev && prev.total > 0 && newCount !== prev.total) {
        const diff = newCount - prev.total
        setCountDelta(diff)
        setCountDeltaVisible(true)
        if (countDeltaTimerRef.current) clearTimeout(countDeltaTimerRef.current)
        countDeltaTimerRef.current = setTimeout(() => setCountDeltaVisible(false), 10000)
      }
      return prev ? { ...prev, total: newCount } : prev
    })
  }, [])

  // measure actual row height and set exact container height for 10 rows
  useEffect(() => {
    if (!tableBodyRef.current || loading) return
    const thead = tableBodyRef.current.querySelector('thead') as HTMLElement | null
    const firstRow = tableBodyRef.current.querySelector('tbody tr') as HTMLElement | null
    if (!firstRow) return
    const rowH = firstRow.getBoundingClientRect().height
    const theadH = thead ? thead.getBoundingClientRect().height : 0
    tableBodyRef.current.style.height = `${theadH + rowH * LIMIT}px`
  }, [loading])

  const fetchData = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)

    const attempt = async (tries: number): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE}/slips?page=${p}&limit=${LIMIT}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: ApiResponse = await res.json()
        setData(json)
        updateTotal(json.totalAmount)
      } catch (e) {
        if (tries > 0) {
          await new Promise(r => setTimeout(r, 1500))
          return attempt(tries - 1)
        }
        console.error('Fetch error:', e)
        setError('ไม่สามารถโหลดข้อมูลได้ กรุณาลองใหม่อีกครั้ง')
      }
    }

    await attempt(2)
    setLoading(false)
  }, [])

  // poll realtime — update slips, totalAmount, total, totalPages
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/slips?page=${page}&limit=${LIMIT}`)
        if (!res.ok) return
        const json: ApiResponse = await res.json()
        updateTotal(json.totalAmount)
        updateCount(json.total)
        // update current page slips (only when not in sorted/filtered mode)
        setData(prev => prev ? { ...prev, slips: json.slips, totalPages: json.totalPages } : prev)
        // if allSlips is loaded, refresh the new entries by re-fetching page 1 to detect new slips
        setAllSlips(prev => {
          if (!prev) return prev
          // merge new slips into allSlips (add any new ids, update existing)
          const existingIds = new Set(prev.map(s => s.id))
          const newSlips = json.slips.filter(s => !existingIds.has(s.id))
          if (newSlips.length === 0) return prev
          return [...newSlips, ...prev]
        })
      } catch { /* silent */ }
    }, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [page])

  useEffect(() => {
    fetchData(page)
  }, [page, fetchData])

  useEffect(() => {
    const onPop = () => {
      const p = new URLSearchParams(window.location.search).get('page')
      setPage(p ? Math.max(1, parseInt(p)) : 1)
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const goTo = (p: number) => {
    if (p < 1 || p > displayTotalPages) return
    setPage(p)
    const params = new URLSearchParams(window.location.search)
    params.set('page', String(p))
    window.history.pushState(null, '', `?${params.toString()}`)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const toggleSort = () => setSortMenuOpen(prev => !prev)

  const selectSort = (dir: 'asc' | 'desc' | null) => {
    setSortMenuOpen(false)
    setSortDir(dir)
    if (dir !== null && allSlips === null && !fetchingAll) {
      fetchAllSlips()
    }
  }

  const selectYear = (year: number | null) => {
    setFilterYear(year)
    setPage(1)
    if (year !== null && allSlips === null && !fetchingAll) {
      fetchAllSlips()
    }
  }

  const handleSearch = (q: string) => {
    setSearchQuery(q)
    setPage(1)
    if (q.trim() !== '' && allSlips === null && !fetchingAll) {
      fetchAllSlips()
    }
  }

  // available years from allSlips — only reasonable years (2015 to current year)
  const currentYear = new Date().getFullYear()
  const availableYears = allSlips
    ? [...new Set(
        allSlips
          .map(s => new Date(s.transferDate).getFullYear())
          .filter(y => y >= 2015 && y <= currentYear)
      )].sort((a, b) => b - a)
    : []

  useEffect(() => {
    if (!sortMenuOpen) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.sort-menu-wrap')) setSortMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [sortMenuOpen])

  useEffect(() => {
    if (!yearMenuOpen) return
    const close = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('.year-menu-wrap')) setYearMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [yearMenuOpen])

  const fetchAllSlips = useCallback(async () => {
    setFetchingAll(true)
    setFetchAllProgress(0)
    try {
      // get total pages first
      const first = await fetch(`${API_BASE}/slips?page=1&limit=100`)
      if (!first.ok) throw new Error(`HTTP ${first.status}`)
      const firstJson: ApiResponse = await first.json()
      const totalPages = firstJson.totalPages
      const collected: Slip[] = [...firstJson.slips]
      setFetchAllProgress(1 / totalPages)

      if (totalPages > 1) {
        // fire ALL remaining requests simultaneously
        let done = 1
        const requests = Array.from({ length: totalPages - 1 }, (_, i) =>
          fetch(`${API_BASE}/slips?page=${i + 2}&limit=100`)
            .then(r => r.json() as Promise<ApiResponse>)
            .then(json => {
              done++
              setFetchAllProgress(done / totalPages)
              return json
            })
        )
        const results = await Promise.all(requests)
        results.forEach(r => collected.push(...r.slips))
      }

      setAllSlips(collected)
    } catch (e) {
      console.error('fetchAll error:', e)
    } finally {
      setFetchingAll(false)
      setFetchAllProgress(0)
    }
  }, [])

  // sorted view: if allSlips loaded use it, else use current page
  const SORT_PAGE_SIZE = LIMIT

  const trimmed = searchQuery.trim().toLowerCase()

  const matchesSearch = (s: Slip) => {
    if (trimmed === '') return true
    // exact match for numeric queries, substring for text
    const isNumeric = /^\d+(\.\d+)?$/.test(trimmed)
    if (isNumeric) return s.amount === parseFloat(trimmed)
    return [s.sender, s.receiver, s.uploader].some(v => v.toLowerCase().includes(trimmed))
  }

  const baseSlips = allSlips && (sortDir !== null || filterYear !== null || trimmed !== '')
    ? allSlips.filter(s => {
        const yearOk = filterYear === null || new Date(s.transferDate).getFullYear() === filterYear
        return yearOk && matchesSearch(s)
      })
    : trimmed !== '' && allSlips
      ? allSlips.filter(s => matchesSearch(s))
      : null

  const sortedAll = baseSlips && sortDir !== null
    ? [...baseSlips].sort((a, b) => sortDir === 'desc' ? b.amount - a.amount : a.amount - b.amount)
    : baseSlips

  const sortPage = sortedAll
    ? Math.min(page, Math.ceil(sortedAll.length / SORT_PAGE_SIZE))
    : page

  const displaySlips = sortedAll
    ? sortedAll.slice((sortPage - 1) * SORT_PAGE_SIZE, sortPage * SORT_PAGE_SIZE)
    : sortDir !== null && data?.slips
      ? [...data.slips].sort((a, b) => sortDir === 'desc' ? b.amount - a.amount : a.amount - b.amount)
      : data?.slips ?? []

  const displayTotalPages = sortedAll
    ? Math.ceil(sortedAll.length / SORT_PAGE_SIZE)
    : data?.totalPages ?? 1

  const displayTotal = sortedAll ? sortedAll.length : data?.total ?? 0

  const renderPagination = () => {
    if (!data) return null
    const totalPages = displayTotalPages
    const curPage = sortedAll ? sortPage : page
    const pages: (number | '...')[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (curPage > 3) pages.push('...')
      for (let i = Math.max(2, curPage - 1); i <= Math.min(totalPages - 1, curPage + 1); i++) pages.push(i)
      if (curPage < totalPages - 2) pages.push('...')
      pages.push(totalPages)
    }
    return (
      <nav className="pagination" aria-label="การแบ่งหน้า">
        <button className="page-btn nav-btn" onClick={() => goTo(curPage - 1)} disabled={curPage === 1} aria-label="ก่อนหน้า">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        {pages.map((p, i) =>
          p === '...'
            ? <span key={`d${i}`} className="page-dots">…</span>
            : <button key={p} className={`page-btn${p === curPage ? ' active' : ''}`} onClick={() => goTo(p as number)} aria-current={p === curPage ? 'page' : undefined}>{p}</button>
        )}
        <button className="page-btn nav-btn" onClick={() => goTo(curPage + 1)} disabled={curPage === totalPages} aria-label="ถัดไป">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
        </button>
      </nav>
    )
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="container header-inner">
          <div className="brand">
            <div className="brand-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="white" strokeWidth="2">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <path d="M2 10h20M7 15h2M12 15h5" />
              </svg>
            </div>
            <div>
              <div className="brand-name">Whatsek Slips</div>
              <div className="brand-sub">ระบบติดตามสลิปโอนเงิน</div>
            </div>
          </div>
          <div className="header-joke">ชะเอิงเอย ชะเอิงเอย ตลกจังเลย</div>
        </div>
      </header>

      <main className="main">
        {/* Disclaimer banner */}
        <div className="disclaimer-wrap">
          <div className="disclaimer-banner">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
            <span>website นี้ไม่มีเจตนาที่ไม่ดี ทำขึ้นเพื่อดูข้อมูลบนมือถือได้ง่าย กรองข้อมูลได้ ค้นหาข้อมูลได้ หากทำผิดพลาดยินดีปิด Website ทันที</span>
          </div>
        </div>
        {/* Summary */}
        {data && (
          <div className="summary-row">
            <div className="stat-card accent">
              <div className="stat-icon">
                <span className="baht-icon">฿</span>
              </div>
              <div className="stat-body">
                <div className="stat-label">
                  ยอดรวมทั้งหมด
                  {deltaVisible && totalDelta !== null && (
                    <span className={`total-delta${totalDelta >= 0 ? ' up' : ' down'}`}>
                      {totalDelta >= 0 ? '+' : ''}{formatBaht(totalDelta)}
                    </span>
                  )}
                </div>
                <AnimatedTotal value={totalAmount} />
                <RealtimeDot />
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon secondary">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" />
                </svg>
              </div>
              <div className="stat-body">
                <div className="stat-label">
                  จำนวนสลิป
                  {countDeltaVisible && countDelta !== null && (
                    <span className={`total-delta${countDelta >= 0 ? ' up' : ' down'}`}>
                      {countDelta >= 0 ? '+' : ''}{countDelta.toLocaleString('th-TH')}
                    </span>
                  )}
                </div>
                <div className="stat-value">{data.total.toLocaleString('th-TH')}</div>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="error-wrap">
            <div className="error-box" role="alert">
              <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
              <p className="error-msg">{error}</p>
              <button className="retry-btn" onClick={() => fetchData(page)}>ลองใหม่อีกครั้ง</button>
            </div>
          </div>
        )}

        {/* Table / Cards */}
        <div className="table-section">

          {/* Search bar */}
          <div className="search-wrap">
            <div className="search-box">
              <svg className="search-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                className="search-input"
                type="search"
                placeholder="ค้นหาผู้โอน, ผู้รับ, ผู้อัปโหลด, ยอดเงิน..."
                value={searchQuery}
                onChange={e => handleSearch(e.target.value)}
                aria-label="ค้นหาสลิป"
              />
              {searchQuery && (
                <button className="search-clear" onClick={() => handleSearch('')} aria-label="ล้างการค้นหา">
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                </button>
              )}
            </div>
            {fetchingAll && searchQuery && (
              <span className="search-loading">กำลังโหลดข้อมูลทั้งหมด {Math.round(fetchAllProgress * 100)}%</span>
            )}
          </div>

          <div className="table-wrap">
            <div className="table-body-wrap" ref={tableBodyRef}>
              <table className="table" aria-label="รายการสลิปโอนเงิน">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>การโอนเงิน</th>
                    <th>
                      <div className="sort-menu-wrap">
                        <button className={`sort-btn${sortDir !== null ? ' active' : ''}`} onClick={toggleSort} aria-label="เรียงตามจำนวนเงิน" aria-expanded={sortMenuOpen}>
                          จำนวนเงิน
                          <span className="sort-icon">
                            {sortDir === 'asc'
                              ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                              : sortDir === 'desc'
                              ? <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                              : <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 9l4-4 4 4M8 15l4 4 4-4"/></svg>
                            }
                          </span>
                        </button>
                        {sortMenuOpen && (
                          <div className="sort-dropdown" role="menu">
                            <button className={`sort-option${sortDir === 'desc' ? ' selected' : ''}`} onClick={() => selectSort('desc')} role="menuitem">
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                              มากไปน้อย
                            </button>
                            <button className={`sort-option${sortDir === 'asc' ? ' selected' : ''}`} onClick={() => selectSort('asc')} role="menuitem">
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                              น้อยไปมาก
                            </button>
                            {sortDir !== null && (
                              <button className="sort-option reset" onClick={() => selectSort(null)} role="menuitem">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                                ลำดับปกติ
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                    <th>
                      <div className="year-menu-wrap">
                        <button
                          className={`sort-btn${filterYear !== null ? ' active' : ''}`}
                          onClick={() => {
                            if (allSlips === null && !fetchingAll) fetchAllSlips()
                            setYearMenuOpen(p => !p)
                          }}
                          aria-expanded={yearMenuOpen}
                        >
                          {filterYear ? `ปี ${filterYear}` : 'วันที่โอน'}
                          <span className="sort-icon">
                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                          </span>
                        </button>
                        {yearMenuOpen && (
                          <div className="sort-dropdown year-dropdown" role="menu">
                            <button
                              className={`sort-option${filterYear === null ? ' selected' : ''}`}
                              onClick={() => { selectYear(null); setYearMenuOpen(false) }}
                              role="menuitem"
                            >
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                              ทั้งหมด
                            </button>
                            {fetchingAll && (
                              <div className="sort-option" style={{cursor:'default', opacity:.6}}>
                                <span className="fetchall-label" style={{padding:0}}>กำลังโหลด...</span>
                              </div>
                            )}
                            {availableYears.map(y => (
                              <button
                                key={y}
                                className={`sort-option${filterYear === y ? ' selected' : ''}`}
                                onClick={() => { selectYear(y); setYearMenuOpen(false) }}
                                role="menuitem"
                              >
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                                {y}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </th>
                    <th>วันที่อัปโหลด</th>
                    <th>อัปโหลดโดย</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: LIMIT }).map((_, i) => (
                        <tr key={i} className="skeleton-row">
                          <td><span className="skel" /></td>
                          <td><span className="skel wide" /></td>
                          <td><span className="skel mid" /></td>
                          <td><span className="skel mid" /></td>
                          <td><span className="skel mid" /></td>
                          <td><span className="skel short" /></td>
                        </tr>
                      ))
                    : displaySlips.map((slip, idx) => (
                        <tr key={slip.id}>
                          <td className="col-id">{((sortedAll ? sortPage : page) - 1) * LIMIT + idx + 1}</td>
                          <td className="col-transfer">
                            <div className="transfer-flow">
                              <span className="transfer-sender">{slip.sender}</span>
                              <span className="transfer-arrow">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                              </span>
                              <span className="transfer-receiver">{slip.receiver}</span>
                            </div>
                          </td>
                          <td className="col-amount">{formatBaht(slip.amount)}</td>
                          <td className="col-date">{formatDate(slip.transferDate)}</td>
                          <td className="col-date">{formatDate(slip.createdAt)}</td>
                          <td className="col-uploader">{slip.uploader}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* Fetch-all progress */}
          {fetchingAll && (
            <div className="fetchall-progress">
              <div className="fetchall-bar" style={{ width: `${Math.round(fetchAllProgress * 100)}%` }} />
              <span className="fetchall-label">กำลังโหลดข้อมูลทั้งหมด {Math.round(fetchAllProgress * 100)}%</span>
            </div>
          )}

          {/* Mobile card list */}
          <div className="card-list">
            <div className="card-list-header">
              <span className="card-list-count">
                {sortedAll
                  ? `${filterYear ? filterYear + ' · ' : ''}${displayTotal.toLocaleString('th-TH')} รายการ`
                  : `${data?.total.toLocaleString('th-TH') ?? '—'} รายการ`
                }
              </span>
              <div className="mobile-toolbar-right">
                {/* Year filter mobile */}
                {availableYears.length > 0 && (
                  <div className="sort-menu-wrap">
                    <button
                      className={`mobile-sort-btn${filterYear !== null ? ' active' : ''}`}
                      onClick={() => {}}
                      style={{ pointerEvents: 'none' }}
                    >
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                      {filterYear ?? 'ทุกปี'}
                    </button>
                  </div>
                )}
                <div className="sort-menu-wrap">
                <button className={`mobile-sort-btn${sortDir !== null ? ' active' : ''}`} onClick={toggleSort} aria-expanded={sortMenuOpen}>
                  <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M3 6h18M7 12h10M11 18h2"/>
                  </svg>
                  {sortDir === 'desc' ? 'มากไปน้อย' : sortDir === 'asc' ? 'น้อยไปมาก' : 'เรียงตามยอด'}
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
                {sortMenuOpen && (
                  <div className="sort-dropdown" role="menu">
                    <button className={`sort-option${sortDir === 'desc' ? ' selected' : ''}`} onClick={() => selectSort('desc')} role="menuitem">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
                      มากไปน้อย
                    </button>
                    <button className={`sort-option${sortDir === 'asc' ? ' selected' : ''}`} onClick={() => selectSort('asc')} role="menuitem">
                      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 19V5M5 12l7-7 7 7"/></svg>
                      น้อยไปมาก
                    </button>
                    {sortDir !== null && (
                      <button className="sort-option reset" onClick={() => selectSort(null)} role="menuitem">
                        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                        ลำดับปกติ
                      </button>
                    )}
                  </div>
                )}
              </div>
              </div>
            </div>
            {loading
              ? Array.from({ length: LIMIT }).map((_, i) => (
                  <div key={i} className="slip-card slip-card--skeleton">
                    <div className="sc-top">
                      <span className="skel mid" />
                      <span className="skel short" />
                    </div>
                    <div className="sc-transfer">
                      <span className="skel wide" />
                      <span className="skel" style={{width:16}} />
                      <span className="skel wide" />
                    </div>
                    <div className="sc-bottom">
                      <span className="skel mid" />
                      <span className="skel short" />
                    </div>
                  </div>
                ))
              : displaySlips.map((slip, idx) => (
                  <div key={slip.id} className="slip-card">
                    <div className="sc-top">
                      <div className="sc-amount">{formatBaht(slip.amount)}</div>
                      <div className="sc-num">#{((sortedAll ? sortPage : page) - 1) * LIMIT + idx + 1}</div>
                    </div>
                    <div className="sc-transfer">
                      <span className="sc-sender">{slip.sender}</span>
                      <span className="sc-arrow">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                      </span>
                      <span className="sc-receiver">{slip.receiver}</span>
                    </div>
                    <div className="sc-bottom">
                      <span className="sc-date">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        วันที่โอน: {formatDate(slip.transferDate)}
                      </span>
                      <span className="sc-date">
                        <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                        อัปโหลด: {formatDate(slip.createdAt)}
                      </span>
                      <span className="sc-uploader">{slip.uploader}</span>
                    </div>
                  </div>
                ))
            }
          </div>

          {/* Pagination */}
          {!loading && data && (
            <div className="pagination-wrap">
              <span className="page-info">
                {sortedAll
                  ? <>เรียงแล้ว · แสดง {(sortPage - 1) * LIMIT + 1}–{Math.min(sortPage * LIMIT, displayTotal)} จาก {displayTotal.toLocaleString('th-TH')} รายการ</>
                  : <>แสดง {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, data.total)} จาก {data.total.toLocaleString('th-TH')} รายการ</>
                }
              </span>
              <div className="pagination-right">
                {renderPagination()}
              </div>
            </div>
          )}
        </div>
      </main>

      <footer className="footer">
        <div className="container footer-inner">
          <div className="footer-left">
            <div className="footer-credit">
              ขออนุญาต <span className="footer-names">พี่คิง & พี่มาลี & ทีมงานทุกๆคน</span>
            </div>
            <div className="footer-source">
              ข้อมูลจาก
              <a href="http://whatsek.com/" target="_blank" rel="noopener noreferrer" className="footer-link">
                whatsek.com
                <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3"/></svg>
              </a>
            </div>
          </div>
          <div className="footer-right">
            <span className="footer-disclaimer">ไม่มีเจตนาที่ไม่ดี หากทำผิดพลาดยินดีปิด website ทันที</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
