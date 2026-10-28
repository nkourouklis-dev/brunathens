import { useCallback, useEffect, useRef, useState } from 'react'

// Σαρωτής QR με κάμερα. Χρησιμοποιεί το BarcodeDetector του browser όπου υπάρχει (Android Chrome),
// αλλιώς (iPhone Safari) αποκωδικοποιεί τα καρέ του βίντεο με το jsQR.
const SCAN_INTERVAL_MS = 150
const SAME_CODE_PAUSE_MS = 2500

async function loadJsQr() {
  return (await import('jsqr')).default
}

async function createDecoder() {
  if ('BarcodeDetector' in window) {
    try {
      const formats = await window.BarcodeDetector.getSupportedFormats()
      if (formats.includes('qr_code')) {
        const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
        return async (video) => (await detector.detect(video))[0]?.rawValue || ''
      }
    } catch {
      // fall through to jsQR
    }
  }
  const jsQR = await loadJsQr()
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d', { willReadFrequently: true })
  return async (video) => {
    const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight))
    canvas.width = Math.round(video.videoWidth * scale)
    canvas.height = Math.round(video.videoHeight * scale)
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    const image = context.getImageData(0, 0, canvas.width, canvas.height)
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' })?.data || ''
  }
}

export function Scanner({ active, onCode }) {
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const lastRef = useRef({ value: '', at: 0 })
  const onCodeRef = useRef(onCode)
  const [status, setStatus] = useState('idle') // idle | starting | scanning | error
  const [errorText, setErrorText] = useState('')

  useEffect(() => { onCodeRef.current = onCode }, [onCode])

  // Bumped on every stop, so a camera that finishes opening after the scanner closed gets released.
  const generationRef = useRef(0)
  const startingRef = useRef(null) // generation of the start() in flight

  const stop = useCallback(() => {
    generationRef.current += 1
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
  }, [])

  const start = useCallback(async () => {
    const generation = generationRef.current
    if (streamRef.current || startingRef.current === generation) return
    startingRef.current = generation
    setStatus('starting')
    setErrorText('')
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('unsupported'), { name: 'NotSupportedError' })
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      if (generation !== generationRef.current || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }
      streamRef.current = stream
      const video = videoRef.current
      video.srcObject = stream
      await video.play()
      setStatus('scanning')
      try { localStorage.setItem('kerdiseto-camera-ok', '1') } catch { /* ignore */ }
    } catch (error) {
      if (generation !== generationRef.current) return
      stop()
      setStatus('error')
      setErrorText(error.name === 'NotAllowedError'
        ? 'Δεν δόθηκε άδεια για την κάμερα. Επίτρεψέ τη από τις ρυθμίσεις του browser.'
        : error.name === 'NotSupportedError' ? 'Αυτή η συσκευή δεν υποστηρίζει κάμερα εδώ. Πληκτρολόγησε τον αριθμό κάρτας.'
          : 'Δεν άνοιξε η κάμερα. Δοκίμασε ξανά.')
    } finally {
      if (startingRef.current === generation) startingRef.current = null
    }
  }, [stop])

  // Auto-start if the camera was allowed before on this device.
  useEffect(() => {
    let allowed = false
    try { allowed = localStorage.getItem('kerdiseto-camera-ok') === '1' } catch { /* ignore */ }
    if (allowed) void start()
    return stop
  }, [start, stop])

  useEffect(() => {
    if (status !== 'scanning' || !active) return undefined
    let cancelled = false
    let timer = null
    let decode = null

    const tick = async () => {
      if (cancelled) return
      const video = videoRef.current
      try {
        if (!decode) decode = await createDecoder()
        if (video && video.readyState >= 2 && video.videoWidth) {
          const value = await decode(video)
          const now = Date.now()
          if (value && !(value === lastRef.current.value && now - lastRef.current.at < SAME_CODE_PAUSE_MS)) {
            lastRef.current = { value, at: now }
            navigator.vibrate?.(60)
            onCodeRef.current(value)
          }
        }
      } catch (error) {
        if (!decode) {
          setStatus('error')
          setErrorText('Δεν φόρτωσε ο αναγνώστης QR. Δοκίμασε ξανά ή πληκτρολόγησε τον αριθμό κάρτας.')
          return
        }
      }
      if (!cancelled) timer = setTimeout(tick, SCAN_INTERVAL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [status, active])

  return (
    <div className={`scanner${active ? '' : ' is-paused'}`}>
      <div className="scanner-view">
        <video ref={videoRef} playsInline muted aria-label="Κάμερα σάρωσης" />
        {status === 'scanning' ? <div className="scanner-frame" aria-hidden="true" /> : null}
        {status !== 'scanning' ? (
          <div className="scanner-overlay">
            {status === 'error' ? <p role="alert">{errorText}</p> : null}
            <button type="button" className="primary-button" onClick={start} disabled={status === 'starting'}>
              {status === 'starting' ? 'Άνοιγμα…' : status === 'error' ? 'Δοκίμασε ξανά' : '📷 Άνοιγμα κάμερας'}
            </button>
          </div>
        ) : null}
      </div>
      {status === 'scanning' ? <p className="scanner-hint">Στόχευσε το QR της κάρτας του πελάτη.</p> : null}
    </div>
  )
}
