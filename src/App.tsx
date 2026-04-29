import { useState, useEffect, useCallback, useRef } from 'react'
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
  if (d.getFullYear() === 1970) return 'ไม่พบวันที่ในสลิป'
  return d.toLocaleDateString('th-TH', {
    year: '2-digit',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
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

export default function App() {
  const [data, setData] = useState<ApiResponse | null>(null)
  const [totalAmount, setTotalAmount] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const animatedTotal = useAnimatedNumber(totalAmount)

  const fetchData = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)

    const attempt = async (tries: number): Promise<void> => {
      try {
        const res = await fetch(`${API_BASE}/slips?page=${p}&limit=${LIMIT}`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json: ApiResponse = await res.json()
        setData(json)
        setTotalAmount(json.totalAmount)
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

  // poll totalAmount realtime — reuse same page/limit, no extra request
  useEffect(() => {
    const id = setInterval(async () => {
      try {
        const res = await fetch(`${API_BASE}/slips?page=${page}&limit=${LIMIT}`)
        if (!res.ok) return
        const json: ApiResponse = await res.json()
        setTotalAmount(json.totalAmount)
        setData(prev => prev ? { ...prev, total: json.total, totalPages: json.totalPages } : prev)
      } catch { /* silent */ }
    }, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [page])

  useEffect(() => {
    fetchData(page)
  }, [page, fetchData])

  const goTo = (p: number) => {
    if (!data || p < 1 || p > data.totalPages) return
    setPage(p)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const renderPagination = () => {
    if (!data) return null
    const { totalPages } = data
    const pages: (number | '...')[] = []
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i)
    } else {
      pages.push(1)
      if (page > 3) pages.push('...')
      for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i)
      if (page < totalPages - 2) pages.push('...')
      pages.push(totalPages)
    }
    return (
      <nav className="pagination" aria-label="การแบ่งหน้า">
        <button className="page-btn nav-btn" onClick={() => goTo(page - 1)} disabled={page === 1} aria-label="ก่อนหน้า">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        {pages.map((p, i) =>
          p === '...'
            ? <span key={`d${i}`} className="page-dots">…</span>
            : <button key={p} className={`page-btn${p === page ? ' active' : ''}`} onClick={() => goTo(p as number)} aria-current={p === page ? 'page' : undefined}>{p}</button>
        )}
        <button className="page-btn nav-btn" onClick={() => goTo(page + 1)} disabled={page === data.totalPages} aria-label="ถัดไป">
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
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <path d="M2 10h20M7 15h2M12 15h5" />
            </svg>
            <span>Whatsek Slips</span>
          </div>
        </div>
      </header>

      <main className="main">
        {/* Summary */}
        {data && (
          <div className="summary-row">
            <div className="stat-card accent">
              <div className="stat-icon">
                <span className="baht-icon">฿</span>
              </div>
              <div>
                <div className="stat-label">ยอดรวมทั้งหมด</div>
                <div className="stat-value">{formatBaht(animatedTotal)}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon secondary">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /><path d="M9 12h6M9 16h4" />
                </svg>
              </div>
              <div>
                <div className="stat-label">จำนวนสลิป</div>
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

        {/* Table */}
        <div className="table-section">
          <div className="table-wrap">
            <div className="table-body-wrap">
              <table className="table" aria-label="รายการสลิปโอนเงิน">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>การโอนเงิน</th>
                    <th>จำนวนเงิน</th>
                    <th>วันที่โอน</th>
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
                          <td><span className="skel short" /></td>
                        </tr>
                      ))
                    : data?.slips.map((slip, idx) => (
                        <tr key={slip.id}>
                          <td className="col-id" data-label="#">{((page - 1) * LIMIT) + idx + 1}</td>
                          <td className="col-transfer" data-label="การโอนเงิน">
                            <div className="transfer-flow">
                              <span className="transfer-sender">{slip.sender}</span>
                              <span className="transfer-arrow">
                                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
                              </span>
                              <span className="transfer-receiver">{slip.receiver}</span>
                            </div>
                          </td>
                          <td className="col-amount" data-label="จำนวนเงิน">{formatBaht(slip.amount)}</td>
                          <td className="col-date" data-label="วันที่โอน">{formatDate(slip.transferDate)}</td>
                          <td className="col-uploader" data-label="อัปโหลดโดย">{slip.uploader}</td>
                        </tr>
                      ))
                  }
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {!loading && data && (
            <div className="pagination-wrap">
              <span className="page-info">
                แสดง {((page - 1) * LIMIT) + 1}–{Math.min(page * LIMIT, data.total)} จาก {data.total.toLocaleString('th-TH')} รายการ
              </span>
              <div className="pagination-right">
                {renderPagination()}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
