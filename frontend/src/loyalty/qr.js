// Minimal QR Code encoder (byte mode), no dependencies.
// Algorithm follows ISO/IEC 18004 and Project Nayuki's reference implementation (MIT).
// Returns a square boolean matrix; render it with qrToSvgPath().

const ECC = {
  L: { ordinal: 0, formatBits: 1 },
  M: { ordinal: 1, formatBits: 0 },
  Q: { ordinal: 2, formatBits: 3 },
  H: { ordinal: 3, formatBits: 2 },
}

// [ecc ordinal][version]
const ECC_CODEWORDS_PER_BLOCK = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
]

const NUM_ERROR_CORRECTION_BLOCKS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
]

function getNumRawDataModules(ver) {
  let result = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const numAlign = Math.floor(ver / 7) + 2
    result -= (25 * numAlign - 10) * numAlign - 55
    if (ver >= 7) result -= 36
  }
  return result
}

function getNumDataCodewords(ver, ecl) {
  return Math.floor(getNumRawDataModules(ver) / 8)
    - ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver]
}

function reedSolomonMultiply(x, y) {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d)
    z ^= ((y >>> i) & 1) * x
  }
  return z & 0xff
}

function reedSolomonComputeDivisor(degree) {
  const result = new Array(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = reedSolomonMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = reedSolomonMultiply(root, 0x02)
  }
  return result
}

function reedSolomonComputeRemainder(data, divisor) {
  const result = divisor.map(() => 0)
  for (const b of data) {
    const factor = b ^ result.shift()
    result.push(0)
    divisor.forEach((coef, i) => { result[i] ^= reedSolomonMultiply(coef, factor) })
  }
  return result
}

function appendBits(val, len, bb) {
  for (let i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1)
}

function getAlignmentPatternPositions(ver) {
  if (ver === 1) return []
  const numAlign = Math.floor(ver / 7) + 2
  const step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2
  const result = [6]
  for (let pos = ver * 4 + 17 - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos)
  return result
}

export function encodeQr(text, eclName = 'M') {
  const ecl = ECC[eclName] || ECC.M
  const data = Array.from(new TextEncoder().encode(text))

  let version
  let dataUsedBits
  for (version = 1; ; version++) {
    const capacityBits = getNumDataCodewords(version, ecl) * 8
    const ccBits = version <= 9 ? 8 : 16
    dataUsedBits = 4 + ccBits + data.length * 8
    if (dataUsedBits <= capacityBits) break
    if (version >= 40) throw new RangeError('Data too long for a QR code')
  }

  const bb = []
  appendBits(0x4, 4, bb)
  appendBits(data.length, version <= 9 ? 8 : 16, bb)
  for (const b of data) appendBits(b, 8, bb)

  const dataCapacityBits = getNumDataCodewords(version, ecl) * 8
  appendBits(0, Math.min(4, dataCapacityBits - bb.length), bb)
  appendBits(0, (8 - (bb.length % 8)) % 8, bb)
  for (let padByte = 0xec; bb.length < dataCapacityBits; padByte ^= 0xec ^ 0x11) appendBits(padByte, 8, bb)

  const dataCodewords = new Array(bb.length / 8).fill(0)
  bb.forEach((bit, i) => { dataCodewords[i >>> 3] |= bit << (7 - (i & 7)) })

  const size = version * 4 + 17
  const modules = Array.from({ length: size }, () => new Array(size).fill(false))
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false))

  const setFunctionModule = (x, y, isDark) => {
    modules[y][x] = isDark
    isFunction[y][x] = true
  }

  // Timing patterns
  for (let i = 0; i < size; i++) {
    setFunctionModule(6, i, i % 2 === 0)
    setFunctionModule(i, 6, i % 2 === 0)
  }

  const drawFinderPattern = (x, y) => {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const xx = x + dx
        const yy = y + dy
        if (xx >= 0 && xx < size && yy >= 0 && yy < size) setFunctionModule(xx, yy, dist !== 2 && dist !== 4)
      }
    }
  }
  drawFinderPattern(3, 3)
  drawFinderPattern(size - 4, 3)
  drawFinderPattern(3, size - 4)

  const alignPos = getAlignmentPatternPositions(version)
  const numAlign = alignPos.length
  for (let i = 0; i < numAlign; i++) {
    for (let j = 0; j < numAlign; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0)) continue
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunctionModule(alignPos[i] + dx, alignPos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
        }
      }
    }
  }

  const drawFormatBits = (mask) => {
    const formatData = (ecl.formatBits << 3) | mask
    let rem = formatData
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const bits = ((formatData << 10) | rem) ^ 0x5412
    const getBit = (i) => ((bits >>> i) & 1) !== 0

    for (let i = 0; i <= 5; i++) setFunctionModule(8, i, getBit(i))
    setFunctionModule(8, 7, getBit(6))
    setFunctionModule(8, 8, getBit(7))
    setFunctionModule(7, 8, getBit(8))
    for (let i = 9; i < 15; i++) setFunctionModule(14 - i, 8, getBit(i))

    for (let i = 0; i < 8; i++) setFunctionModule(size - 1 - i, 8, getBit(i))
    for (let i = 8; i < 15; i++) setFunctionModule(8, size - 15 + i, getBit(i))
    setFunctionModule(8, size - 8, true)
  }

  const drawVersion = () => {
    if (version < 7) return
    let rem = version
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const bits = (version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = ((bits >>> i) & 1) !== 0
      const a = size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      setFunctionModule(a, b, bit)
      setFunctionModule(b, a, bit)
    }
  }

  drawFormatBits(0)
  drawVersion()

  // Error correction and interleaving
  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][version]
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][version]
  const rawCodewords = Math.floor(getNumRawDataModules(version) / 8)
  const numShortBlocks = numBlocks - (rawCodewords % numBlocks)
  const shortBlockLen = Math.floor(rawCodewords / numBlocks)
  const divisor = reedSolomonComputeDivisor(blockEccLen)
  const blocks = []
  for (let i = 0, k = 0; i < numBlocks; i++) {
    const dat = dataCodewords.slice(k, k + shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1))
    k += dat.length
    const ecc = reedSolomonComputeRemainder(dat, divisor)
    if (i < numShortBlocks) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const allCodewords = []
  for (let i = 0; i < blocks[0].length; i++) {
    blocks.forEach((block, j) => {
      if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) allCodewords.push(block[i])
    })
  }

  // Zigzag placement
  let bitIndex = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!isFunction[y][x] && bitIndex < allCodewords.length * 8) {
          modules[y][x] = ((allCodewords[bitIndex >>> 3] >>> (7 - (bitIndex & 7))) & 1) !== 0
          bitIndex++
        }
      }
    }
  }

  const applyMask = (mask) => {
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let invert
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break
          case 1: invert = y % 2 === 0; break
          case 2: invert = x % 3 === 0; break
          case 3: invert = (x + y) % 3 === 0; break
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break
          case 5: invert = ((x * y) % 2) + ((x * y) % 3) === 0; break
          case 6: invert = (((x * y) % 2) + ((x * y) % 3)) % 2 === 0; break
          default: invert = (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
        }
        if (!isFunction[y][x] && invert) modules[y][x] = !modules[y][x]
      }
    }
  }

  const finderPenaltyCountPatterns = (runHistory) => {
    const n = runHistory[1]
    const core = n > 0 && runHistory[2] === n && runHistory[3] === n * 3 && runHistory[4] === n && runHistory[5] === n
    return (core && runHistory[0] >= n * 4 && runHistory[6] >= n ? 1 : 0)
      + (core && runHistory[6] >= n * 4 && runHistory[0] >= n ? 1 : 0)
  }
  const finderPenaltyAddHistory = (currentRunLength, runHistory) => {
    if (runHistory[0] === 0) currentRunLength += size
    runHistory.pop()
    runHistory.unshift(currentRunLength)
  }
  const finderPenaltyTerminateAndCount = (currentRunColor, currentRunLength, runHistory) => {
    if (currentRunColor) {
      finderPenaltyAddHistory(currentRunLength, runHistory)
      currentRunLength = 0
    }
    currentRunLength += size
    finderPenaltyAddHistory(currentRunLength, runHistory)
    return finderPenaltyCountPatterns(runHistory)
  }

  const getPenaltyScore = () => {
    let result = 0
    for (let y = 0; y < size; y++) {
      let runColor = false
      let runX = 0
      const runHistory = [0, 0, 0, 0, 0, 0, 0]
      for (let x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runX++
          if (runX === 5) result += 3
          else if (runX > 5) result++
        } else {
          finderPenaltyAddHistory(runX, runHistory)
          if (!runColor) result += finderPenaltyCountPatterns(runHistory) * 40
          runColor = modules[y][x]
          runX = 1
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runX, runHistory) * 40
    }
    for (let x = 0; x < size; x++) {
      let runColor = false
      let runY = 0
      const runHistory = [0, 0, 0, 0, 0, 0, 0]
      for (let y = 0; y < size; y++) {
        if (modules[y][x] === runColor) {
          runY++
          if (runY === 5) result += 3
          else if (runY > 5) result++
        } else {
          finderPenaltyAddHistory(runY, runHistory)
          if (!runColor) result += finderPenaltyCountPatterns(runHistory) * 40
          runColor = modules[y][x]
          runY = 1
        }
      }
      result += finderPenaltyTerminateAndCount(runColor, runY, runHistory) * 40
    }
    for (let y = 0; y < size - 1; y++) {
      for (let x = 0; x < size - 1; x++) {
        const color = modules[y][x]
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1]) result += 3
      }
    }
    let dark = 0
    for (const row of modules) dark = row.reduce((sum, color) => sum + (color ? 1 : 0), dark)
    const total = size * size
    const k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1
    result += k * 10
    return result
  }

  let bestMask = 0
  let minPenalty = Infinity
  for (let mask = 0; mask < 8; mask++) {
    applyMask(mask)
    drawFormatBits(mask)
    const penalty = getPenaltyScore()
    if (penalty < minPenalty) {
      bestMask = mask
      minPenalty = penalty
    }
    applyMask(mask) // undo (XOR)
  }
  applyMask(bestMask)
  drawFormatBits(bestMask)

  return modules
}

// One SVG path for all dark modules, with a quiet zone of `border` modules.
export function qrToSvg(text, { border = 2, ecl = 'M' } = {}) {
  const modules = encodeQr(text, ecl)
  const size = modules.length
  const parts = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) parts.push(`M${x + border},${y + border}h1v1h-1z`)
    }
  }
  const dim = size + border * 2
  return { viewBox: `0 0 ${dim} ${dim}`, path: parts.join(''), size: dim }
}
